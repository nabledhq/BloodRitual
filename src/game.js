import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createCharacter, updateCharacterIdle, CHARACTER_HEIGHT } from './character.js';
import { createWorld } from './world.js';
import { KeyboardInput } from './input.js';
import { createMovementState, updateMovement, cameraYaw } from './movement.js';

/**
 * Owns the renderer, scene, camera and main loop. Create one per page and
 * call `start()` to begin rendering.
 */
export class Game {
  constructor(container) {
    this.container = container;
    this.clock = new THREE.Clock();

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.world = createWorld(this.scene);

    this.character = createCharacter();
    this.scene.add(this.character);

    this.camera = new THREE.PerspectiveCamera(
      50,
      container.clientWidth / container.clientHeight,
      0.1,
      200,
    );
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

    this.movement = createMovementState(this.character.position);
    this.input = new KeyboardInput(window);
    this.input.attach();

    this.onResize = this.onResize.bind(this);
    window.addEventListener('resize', this.onResize);
  }

  onResize() {
    const { clientWidth: width, clientHeight: height } = this.container;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  /**
   * Advances the game by `delta` seconds (defaults to the time since the
   * last frame).
   */
  update(delta = this.clock.getDelta()) {
    const elapsed = this.clock.elapsedTime;
    this.updatePlayer(delta);
    updateCharacterIdle(this.character, elapsed);
    this.controls.update();
  }

  /** Moves the character from keyboard input and keeps the camera following it. */
  updatePlayer(delta) {
    const { position } = this.movement;
    const previousX = position.x;
    const previousZ = position.z;
    const yaw = cameraYaw(this.camera.position, this.controls.target);
    updateMovement(this.movement, this.input.getIntent(), delta, yaw);

    this.character.position.copy(position);
    this.character.rotation.y = this.movement.facing;
    this.character.scale.y = this.movement.height / CHARACTER_HEIGHT;

    // Follow horizontally only, so jumps and crouches read clearly on screen.
    const dx = position.x - previousX;
    const dz = position.z - previousZ;
    this.camera.position.x += dx;
    this.camera.position.z += dz;
    this.controls.target.x += dx;
    this.controls.target.z += dz;
  }

  start() {
    this.clock.start();
    this.renderer.setAnimationLoop(() => {
      this.update();
      this.renderer.render(this.scene, this.camera);
    });
  }

  dispose() {
    this.renderer.setAnimationLoop(null);
    window.removeEventListener('resize', this.onResize);
    this.input.detach();
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
