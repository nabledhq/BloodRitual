import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  createCharacter,
  updateCharacterIdle,
  updateCharacterWalk,
  CHARACTER_HEIGHT,
  DEFAULT_PALETTE,
  WOMAN_PALETTE,
} from './character.js';
import { createWorld, updateWorld, terrainHeight } from './world.js';
import { Highlighter, collectInteractive, pickInteractive } from './interaction.js';
import { LAYOUT } from './layout.js';
import { KeyboardInput } from './input.js';
import { createMovementState, updateMovement, cameraYaw } from './movement.js';
import { MOVEMENT } from './config.js';

/** Palette for the villager who walks around the camp. */
const VILLAGER_PALETTE = Object.freeze({
  ...DEFAULT_PALETTE,
  height: 1.7,
  skin: 0x7e5236,
  shirtBands: [0x34445e, 0xbfb08e, 0x7a3b2e, 0xb8a888, 0x4f5f3e, 0xbfb08e],
  neckerchief: 0x34445e,
  turban: 0x7a3b2e,
  turbanBand: 0x34445e,
});

/** NPCs: a woman tending the fire and a man walking a loop through camp. */
export function createNpcs() {
  const { firePit, walkPath } = LAYOUT;
  const woman = createCharacter(WOMAN_PALETTE);
  woman.name = 'npcWoman';
  const wx = firePit.x - 1.0;
  const wz = firePit.z + 1.1;
  woman.position.set(wx, terrainHeight(wx, wz), wz);
  woman.rotation.y = Math.atan2(firePit.x - wx, firePit.z - wz);
  woman.userData.interactive = { label: 'Villager', prompt: 'She is tending the cooking fire' };
  woman.userData.behaviour = 'idle';

  const man = createCharacter(VILLAGER_PALETTE);
  man.name = 'npcMan';
  man.userData.interactive = { label: 'Villager', prompt: 'He is walking back from the canoe' };
  man.userData.behaviour = 'walk';
  man.userData.path = walkPath;
  man.userData.speed = 1.1;
  return [woman, man];
}

/** Position on the elliptical walk path after walking `distance` metres. */
export function walkPathPoint(path, distance) {
  // Approximate perimeter (Ramanujan) to convert distance to angle.
  const { rx, rz } = path;
  const perimeter = Math.PI * (3 * (rx + rz) - Math.sqrt((3 * rx + rz) * (rx + 3 * rz)));
  const angle = (distance / perimeter) * Math.PI * 2;
  const x = path.x + Math.cos(angle) * rx;
  const z = path.z + Math.sin(angle) * rz;
  // Tangent direction (counter-clockwise when seen from above is +angle).
  const dx = -Math.sin(angle) * rx;
  const dz = Math.cos(angle) * rz;
  return { x, z, heading: Math.atan2(dx, dz) };
}

function updateNpc(npc, elapsed) {
  if (npc.userData.behaviour === 'walk') {
    const distance = elapsed * npc.userData.speed;
    const { x, z, heading } = walkPathPoint(npc.userData.path, distance);
    const bob = updateCharacterWalk(npc, distance, elapsed);
    npc.position.set(x, terrainHeight(x, z) + bob, z);
    npc.rotation.y = heading;
  } else {
    updateCharacterIdle(npc, elapsed + 3.7);
  }
}

/**
 * Owns the renderer, scene, camera and main loop. Create one per page and
 * call `start()` to begin rendering.
 */
export class Game {
  constructor(container, { promptElement = null } = {}) {
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

    this.npcs = createNpcs();
    this.scene.add(...this.npcs);

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

    this.onResize = this.onResize.bind(this);
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerLeave = this.onPointerLeave.bind(this);
    window.addEventListener('resize', this.onResize);
    this.renderer.domElement.addEventListener?.('pointermove', this.onPointerMove);
    this.renderer.domElement.addEventListener?.('pointerleave', this.onPointerLeave);
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
    for (const npc of this.npcs) updateNpc(npc, elapsed);
    updateWorld(this.world, elapsed);
    this.controls.update();
    this.updateHover();
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
      updateCharacterWalk(this.character, this.walkedDistance, elapsed);
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
    this.renderer.setAnimationLoop(null);
    window.removeEventListener('resize', this.onResize);
    this.renderer.domElement.removeEventListener?.('pointermove', this.onPointerMove);
    this.renderer.domElement.removeEventListener?.('pointerleave', this.onPointerLeave);
    this.highlighter.dispose();
    this.input.detach();
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
