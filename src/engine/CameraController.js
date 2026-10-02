import { ArcRotateCamera, Vector3 } from '@babylonjs/core';
import { CHARACTER_HEIGHT } from '../character.js';

/** Follow-camera tuning. Distances in metres, angles in radians. */
export const CAMERA = Object.freeze({
  fov: (50 * Math.PI) / 180,
  near: 0.1,
  far: 250,
  minDistance: 2,
  maxDistance: 15,
  /** Keeps the camera above the ground (just short of horizontal). */
  maxPolarAngle: Math.PI * 0.48,
  minPolarAngle: 0.12,
  /** Look-at height on the character. */
  targetHeight: CHARACTER_HEIGHT * 0.6,
  /** Orbit inertia (0 = none, closer to 1 = smoother). */
  inertia: 0.85,
  /** How quickly the look-at point catches up with the character (1/s). */
  followRate: 14,
  /** Gap kept between the camera and whatever it would otherwise clip into. */
  collisionMargin: 0.3,
  /** Closest the camera may be pulled in by an obstacle. */
  minCollisionDistance: 0.6,
  /** How quickly the camera eases back out after an obstacle clears (1/s). */
  recoverRate: 4,
});

/** Starting offset of the camera from the character's feet, as before the migration. */
const START_OFFSET = new Vector3(2.2, 1.9, 4.2);

/** Unit vector from the look-at point to an ArcRotateCamera at (alpha, beta). */
export function orbitDirection(alpha, beta) {
  return new Vector3(Math.cos(alpha) * Math.sin(beta), Math.cos(beta), Math.sin(alpha) * Math.sin(beta));
}

/**
 * Third-person orbit camera (ArcRotateCamera) following the player: drag to
 * orbit with inertia, vertical limits, wheel zoom between a minimum and
 * maximum distance, a smoothed follow point, and collision so it never
 * passes through terrain or buildings (a physics ray from the character to
 * the camera pulls it in).
 */
export class CameraController {
  constructor(scene, { canvas = null, physics = null, focus = Vector3.Zero(), config = CAMERA } = {}) {
    this.config = config;
    this.physics = physics;
    const target = new Vector3(focus.x, focus.y + config.targetHeight, focus.z);
    const offset = START_OFFSET.subtract(new Vector3(0, config.targetHeight, 0));
    const radius = offset.length();
    const camera = new ArcRotateCamera('camera', Math.atan2(offset.z, offset.x), Math.acos(offset.y / radius), radius, target, scene);
    camera.fov = config.fov;
    camera.minZ = config.near;
    camera.maxZ = config.far;
    camera.inertia = config.inertia;
    camera.lowerBetaLimit = config.minPolarAngle;
    camera.upperBetaLimit = config.maxPolarAngle;
    // Collision may pull the camera closer than the zoom limit; the zoom limit is enforced on `distance`.
    camera.lowerRadiusLimit = config.minCollisionDistance;
    camera.upperRadiusLimit = config.maxDistance;
    camera.wheelDeltaPercentage = 0.01;
    camera.panningSensibility = 0;
    // Arrow keys move the character, not the camera.
    camera.inputs.removeByType('ArcRotateCameraKeyboardMoveInput');
    if (canvas) camera.attachControl(canvas, true);
    this.camera = camera;
    /** The distance the player chose with the wheel (before collision). */
    this.distance = radius;
    this.appliedRadius = radius;
    this.lastDelta = 0;
    this.observer = camera.onAfterCheckInputsObservable.add(() => this.resolveCollision(this.lastDelta));
  }

  get target() {
    return this.camera.target;
  }

  get position() {
    return this.camera.position;
  }

  /** Eases the look-at point towards the character standing at `feet`. */
  follow(feet, delta, { immediate = false } = {}) {
    this.lastDelta = delta;
    const goal = new Vector3(feet.x, feet.y + this.config.targetHeight, feet.z);
    const k = immediate ? 1 : 1 - Math.exp(-this.config.followRate * Math.max(0, delta));
    // Moving the target in place keeps alpha, beta and radius: the camera follows rigidly.
    this.camera.target.copyFrom(Vector3.Lerp(this.camera.target, goal, k));
  }

  /**
   * Applies wheel zoom to the chosen distance, then shortens the radius if
   * terrain or a building is between the character and the camera.
   */
  resolveCollision(delta) {
    const camera = this.camera;
    const { minDistance, maxDistance, collisionMargin, minCollisionDistance, recoverRate } = this.config;
    // Whatever the inputs changed this frame is the player's zoom.
    this.distance = Math.min(maxDistance, Math.max(minDistance, this.distance + (camera.radius - this.appliedRadius)));
    let radius = this.distance;
    if (this.physics) {
      const from = camera.target;
      const to = from.add(orbitDirection(camera.alpha, camera.beta).scale(this.distance + collisionMargin));
      const hit = this.physics.raycast(from, to);
      if (hit !== null) radius = Math.max(minCollisionDistance, hit - collisionMargin);
    }
    // Snap in immediately (never show the inside of a wall); ease back out.
    if (radius > this.appliedRadius) {
      radius = this.appliedRadius + (radius - this.appliedRadius) * (1 - Math.exp(-recoverRate * Math.max(0, delta)));
    }
    camera.radius = radius;
    this.appliedRadius = radius;
  }

  /** Yaw of the view direction (0 looks along +Z), for camera-relative movement. */
  get yaw() {
    const toCamera = orbitDirection(this.camera.alpha, this.camera.beta);
    return Math.atan2(-toCamera.x, -toCamera.z);
  }

  dispose() {
    this.camera.onAfterCheckInputsObservable.remove(this.observer);
    this.camera.detachControl();
    this.camera.dispose();
  }
}
