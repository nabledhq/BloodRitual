import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  createCharacter,
  updateCharacterIdle,
  updateCharacterWalk,
  CHARACTER_HEIGHT,
} from './character.js';
import { createWorld, updateWorld, terrainHeight } from './world.js';
import { Highlighter, collectInteractive, pickInteractive } from './interaction.js';
import { KeyboardInput, DEBUG_KEYS } from './input.js';
import { createMovementState, updateMovement, cameraYaw } from './movement.js';
import { MOVEMENT } from './config.js';
import { loadNpcAssets } from './npc/assets.js';
import { NpcPopulation } from './npc/population.js';
import { DebugOverlay } from './debug-overlay.js';

/** Longest NPC simulation step, so a stalled tab does not teleport villagers. */
const MAX_NPC_STEP = 0.1;

/** A soft ring drawn under the NPC selected with the debug keys. */
function createSelectionMarker() {
  const material = new THREE.MeshStandardMaterial({ color: 0xffd27a, emissive: 0xffb040, emissiveIntensity: 0.8, roughness: 0.6, transparent: true, opacity: 0.85, depthWrite: false });
  const marker = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.5, 40), material);
  marker.name = 'npcSelectionMarker';
  marker.rotation.x = -Math.PI / 2;
  marker.visible = false;
  marker.receiveShadow = true;
  marker.raycast = () => {};
  return marker;
}

/**
 * Owns the renderer, scene, camera and main loop. Create one per page and
 * call `start()` to begin rendering.
 */
export class Game {
  /**
   * `npcAssets()` resolves to the loaded NPC models and clips (defaults to
   * fetching them); `debugElement` shows the debug overlay.
   */
  constructor(container, { promptElement = null, debugElement = null, npcAssets = loadNpcAssets } = {}) {
    this.container = container;
    this.promptElement = promptElement;
    this.timer = new THREE.Timer();

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    // PCF with a per-light radius gives soft shadow edges (PCFSoftShadowMap
    // was removed from three.js).
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.world = createWorld(this.scene);

    this.character = createCharacter();
    this.character.position.y = terrainHeight(0, 0);
    this.scene.add(this.character);

    // NPCs load asynchronously (rigged glTF models and clips); see loadNpcs().
    this.npcs = [];
    this.population = null;
    this.selectionMarker = createSelectionMarker();
    this.scene.add(this.selectionMarker);
    this.debugOverlay = new DebugOverlay(debugElement);

    this.camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 250);
    this.camera.position.set(2.2, 1.9, 4.2);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, CHARACTER_HEIGHT * 0.6, 0);
    this.controls.enableDamping = true;
    this.controls.enablePan = false;
    this.controls.minDistance = 2;
    this.controls.maxDistance = 15;
    // Keep the camera above the ground.
    this.controls.maxPolarAngle = Math.PI * 0.48;
    this.controls.update();

    this.applyAnisotropy();

    // Hover highlighting of interactive objects.
    this.highlighter = new Highlighter();
    this.raycaster = new THREE.Raycaster();
    this.pointer = null;
    this.interactive = collectInteractive(this.scene);

    // Keyboard movement over the terrain; the walk cycle advances with distance walked.
    this.movement = createMovementState(this.character.position, MOVEMENT, terrainHeight);
    this.walkedDistance = 0;
    this.input = new KeyboardInput(window);
    this.input.attach();

    this.onDebugKey = this.onDebugKey.bind(this);
    window.addEventListener('keydown', this.onDebugKey);
    this.npcsReady = this.loadNpcs(npcAssets);

    this.onResize = this.onResize.bind(this);
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerLeave = this.onPointerLeave.bind(this);
    window.addEventListener('resize', this.onResize);
    this.renderer.domElement.addEventListener?.('pointermove', this.onPointerMove);
    this.renderer.domElement.addEventListener?.('pointerleave', this.onPointerLeave);
  }

  /** Loads the NPC models and spawns the demo population. Resolves to the population. */
  async loadNpcs(npcAssets) {
    try {
      const assets = await npcAssets();
      if (this.disposed) return null;
      this.population = new NpcPopulation(assets, { groundAt: terrainHeight });
      this.npcs = this.population.groups;
      this.scene.add(...this.npcs);
      this.interactive = collectInteractive(this.scene);
      this.applyAnisotropy();
      return this.population;
    } catch (error) {
      console.error('Seminole: could not load the villagers', error);
      return null;
    }
  }

  /** Debug keys: select an NPC, step it through every action, send it back, toggle the overlay. */
  onDebugKey(event) {
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
    const population = this.population;
    switch (event.code) {
      case DEBUG_KEYS.overlay:
        this.debugOverlay.toggle();
        return;
      case DEBUG_KEYS.selectNpc:
        if (!population) return;
        population.selectNext();
        this.debugOverlay.note(`selected ${population.selected.name}`);
        break;
      case DEBUG_KEYS.nextAction: {
        if (!population) return;
        const r = population.playNextAction();
        const via = r.fallback ? ` (fallback: ${r.via.join(' > ')})` : '';
        this.debugOverlay.note(`action ${population.debugActionIndex + 1}/${population.selected.controller.library.actionNames().length}: ${r.action} -> ${r.clip}${via}`);
        console.info(`[npc debug] ${population.selected.name}: ${r.action} -> ${r.clip}${via}`);
        break;
      }
      case DEBUG_KEYS.resumeNpc:
        if (!population?.selected) return;
        population.resumeSelected();
        this.debugOverlay.note(`${population.selected.name} back to its routine`);
        break;
      default:
        return;
    }
    this.debugOverlay.toggle(true);
  }

  /** Sharper textures at grazing angles (ground, thatch) where supported. */
  applyAnisotropy() {
    const max = this.renderer.capabilities?.getMaxAnisotropy?.() ?? 1;
    const level = Math.min(8, max);
    this.scene.traverse((o) => {
      const materials = o.material ? [].concat(o.material) : [];
      for (const m of materials) {
        for (const key of ['map', 'normalMap', 'roughnessMap']) {
          if (m[key]) m[key].anisotropy = level;
        }
      }
    });
  }

  onResize() {
    const { clientWidth: width, clientHeight: height } = this.container;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  onPointerMove(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.setPointer(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
  }

  onPointerLeave() {
    this.setPointer(null);
  }

  /** Sets the pointer in normalised device coordinates, or null when it leaves the canvas. */
  setPointer(x, y) {
    this.pointer = x === null || x === undefined ? null : new THREE.Vector2(x, y);
  }

  /** Re-targets the hover highlight and prompt. Returns the targeted object (or null). */
  updateHover() {
    const target = this.pointer ? pickInteractive(this.raycaster, this.camera, this.pointer, this.interactive) : null;
    if (this.highlighter.setTarget(target)) {
      const info = target?.userData.interactive;
      if (this.promptElement) {
        this.promptElement.textContent = info ? `${info.label}: ${info.prompt}` : '';
        this.promptElement.classList?.toggle('visible', Boolean(info));
      }
      if (this.renderer.domElement.style) this.renderer.domElement.style.cursor = info ? 'pointer' : '';
    }
    return target;
  }

  /**
   * Advances the game by `delta` seconds (defaults to the time since the
   * last frame, from the timer).
   */
  update(delta) {
    this.timer.update();
    const step = delta ?? this.timer.getDelta();
    const elapsed = this.timer.getElapsed();
    this.updatePlayer(step, elapsed);
    this.updateNpcs(Math.min(step, MAX_NPC_STEP));
    updateWorld(this.world, elapsed);
    this.controls.update();
    this.updateHover();
  }

  /** Advances every NPC (behaviour and animation) and the debug overlay. */
  updateNpcs(delta) {
    const selected = this.population?.selected ?? null;
    this.population?.update(delta);
    this.selectionMarker.visible = Boolean(selected);
    if (selected) this.selectionMarker.position.set(selected.position.x, selected.position.y + 0.03, selected.position.z);
    this.debugOverlay.update(delta, selected);
  }

  /**
   * Moves the character from keyboard input over the terrain, animates it
   * (walk cycle while moving on the ground, idle otherwise) and keeps the
   * camera following it.
   */
  updatePlayer(delta, elapsed) {
    const { position } = this.movement;
    const previousX = position.x;
    const previousZ = position.z;
    const previousGround = terrainHeight(previousX, previousZ);
    const yaw = cameraYaw(this.camera.position, this.controls.target);
    updateMovement(this.movement, this.input.getIntent(), delta, yaw, MOVEMENT, terrainHeight);

    this.character.position.copy(position);
    this.character.rotation.y = this.movement.facing;
    this.character.scale.y = this.movement.height / CHARACTER_HEIGHT;

    const dx = position.x - previousX;
    const dz = position.z - previousZ;
    const stride = Math.hypot(dx, dz);
    if (stride > 0 && this.movement.grounded) {
      this.walkedDistance += stride;
      // Blend into the run cycle as the speed rises from walking to sprinting.
      const speed = delta > 0 ? stride / delta : 0;
      const run = (speed - MOVEMENT.walkSpeed) / (MOVEMENT.walkSpeed * (MOVEMENT.sprintMultiplier - 1));
      updateCharacterWalk(this.character, this.walkedDistance, elapsed, { run });
    } else {
      updateCharacterIdle(this.character, elapsed);
    }

    // Follow horizontally and with the ground height, but not with jumps or
    // crouches, so those read clearly on screen.
    const dy = terrainHeight(position.x, position.z) - previousGround;
    this.camera.position.x += dx;
    this.camera.position.y += dy;
    this.camera.position.z += dz;
    this.controls.target.x += dx;
    this.controls.target.y += dy;
    this.controls.target.z += dz;
  }

  start() {
    this.timer.reset();
    this.renderer.setAnimationLoop(() => {
      this.update();
      this.renderer.render(this.scene, this.camera);
    });
  }

  dispose() {
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('keydown', this.onDebugKey);
    this.population?.dispose();
    this.renderer.domElement.removeEventListener?.('pointermove', this.onPointerMove);
    this.renderer.domElement.removeEventListener?.('pointerleave', this.onPointerLeave);
    this.highlighter.dispose();
    this.input.detach();
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
