import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  createCharacter,
  updateCharacterIdle,
  updateCharacterWalk,
  CHARACTER_HEIGHT,
} from './character.js';
import { generateCharacterParams } from './character-params.js';
import { createWorld, updateWorld, terrainHeight } from './world.js';
import { Highlighter, collectInteractive, pickInteractive } from './interaction.js';
import { LAYOUT } from './layout.js';
import { KeyboardInput } from './input.js';
import { createMovementState, updateMovement, cameraYaw } from './movement.js';
import { MOVEMENT } from './config.js';

/**
 * The people of the camp. Each is generated from a fixed seed, so they look
 * the same on every launch. `at` is where they stand (or null for the man
 * walking the camp loop) and `face` what they turn towards.
 */
export const VILLAGERS = Object.freeze([
  { name: 'npcWoman', seed: 41, variant: 'woman', at: [-3.3, -1.8], face: 'firePit', label: 'Villager', prompt: 'She is tending the cooking fire' },
  { name: 'npcElderWoman', seed: 7, variant: 'elderWoman', at: [-1.35, -2.0], face: 'firePit', label: 'Elder', prompt: 'She is watching the kettle and telling stories' },
  { name: 'npcChild', seed: 23, variant: 'child', sex: 'female', at: [-0.75, -1.15], face: [0, 2], label: 'Child', prompt: 'She is curious about you' },
  { name: 'npcElderMan', seed: 12, variant: 'elderMan', at: [3.6, -1.9], face: [0, 0], label: 'Elder', prompt: 'He is resting in the shade of the chickee' },
  { name: 'npcTeen', seed: 62, variant: 'teen', sex: 'male', at: [2.95, -0.55], face: 'mortar', label: 'Villager', prompt: 'He is waiting his turn at the corn mortar' },
  { name: 'npcHunter', seed: 77, variant: 'man', at: [-5.6, -5.0], face: 'canoe', label: 'Villager', prompt: 'He is checking the dugout canoe' },
  { name: 'npcMan', seed: 3, variant: 'man', at: null, label: 'Villager', prompt: 'He is walking back from the canoe' },
]);

function facing([x, z], target) {
  const [tx, tz] = Array.isArray(target) ? target : [LAYOUT[target].x, LAYOUT[target].z];
  return Math.atan2(tx - x, tz - z);
}

/** NPCs: six villagers of different ages standing about the camp and a man walking a loop through it. */
export function createNpcs() {
  return VILLAGERS.map((v) => {
    const npc = createCharacter(generateCharacterParams(v.seed, v.variant, v.sex ? { sex: v.sex } : {}));
    npc.name = v.name;
    npc.userData.interactive = { label: v.label, prompt: v.prompt };
    if (v.at) {
      const [x, z] = v.at;
      npc.position.set(x, terrainHeight(x, z), z);
      npc.rotation.y = facing(v.at, v.face);
      npc.userData.behaviour = 'idle';
    } else {
      npc.userData.behaviour = 'walk';
      npc.userData.path = LAYOUT.walkPath;
      npc.userData.speed = 1.1;
    }
    return npc;
  });
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
    updateCharacterIdle(npc, elapsed);
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
