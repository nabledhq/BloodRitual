import { Quaternion, Vector3 } from '@babylonjs/core';
import { createCharacter, CHARACTER_HEIGHT } from '../character.js';
import { createMovementState, updateMovement } from '../movement.js';
import { terrainHeight } from '../terrain.js';
import { MOVEMENT } from '../config.js';
import { AnimationController } from './AnimationController.js';

const UP = Vector3.Up();

/**
 * The player character: third-person, camera-relative movement from
 * src/movement.js (walk, run, jump, crouch over the terrain, turning
 * smoothly towards the direction of travel), collision against obstacles
 * through a Havok character controller, and blended locomotion clips.
 */
export class PlayerController {
  constructor(sceneManager, physics, { config = MOVEMENT } = {}) {
    this.config = config;
    this.character = createCharacter();
    this.character.position.y = terrainHeight(0, 0);
    this.root = sceneManager.instantiate(this.character, null);
    this.animation = AnimationController.forCharacter(sceneManager.scene, this.character, sceneManager.nodes);
    this.movement = createMovementState(this.character.position, config, terrainHeight);
    this.physics = physics;
    this.controller = physics?.createCharacterController(this.movement.position) ?? null;
    this.speed = 0;
    this.sync();
  }

  get position() {
    return this.movement.position;
  }

  /**
   * Advances the player by `delta` seconds for an input `intent`, with
   * "forward" along the camera's `yaw`.
   */
  update(delta, intent, yaw) {
    const state = this.movement;
    const previousX = state.position.x;
    const previousZ = state.position.z;
    updateMovement(state, intent, delta, yaw, this.config, terrainHeight);

    if (this.controller) {
      // Obstacles stop or deflect the horizontal step; the ground height stays analytic.
      const dt = Math.min(Math.max(delta, 0), this.config.maxStep);
      this.physics.placeCharacter(this.controller, previousX, state.position.y, previousZ);
      const reached = this.physics.moveCharacter(this.controller, state.position.x - previousX, state.position.z - previousZ, state.position.y, dt);
      state.position.x = reached.x;
      state.position.z = reached.z;
      if (state.grounded) state.position.y = terrainHeight(reached.x, reached.z);
    }

    const stride = Math.hypot(state.position.x - previousX, state.position.z - previousZ);
    this.speed = delta > 0 ? stride / Math.min(delta, this.config.maxStep) : 0;
    this.animation.update(delta, { speed: this.speed, grounded: state.grounded });
    this.sync();
  }

  /** Copies the movement state onto the Babylon character. */
  sync() {
    const { position, facing, height } = this.movement;
    this.root.position.set(position.x, position.y, position.z);
    this.root.rotationQuaternion = Quaternion.RotationAxis(UP, facing);
    this.root.scaling.y = height / CHARACTER_HEIGHT;
  }

  dispose() {
    this.animation.dispose();
    this.controller?.dispose?.();
  }
}
