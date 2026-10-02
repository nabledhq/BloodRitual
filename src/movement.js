import { Vector3 } from './procedural/index.js';
import { MOVEMENT } from './config.js';

/** Ground height used when no terrain is supplied: a flat plane at y = 0. */
export const flatGround = () => 0;

/**
 * Creates the mutable movement state for a character standing on the
 * ground at `position`. `groundAt(x, z)` gives the ground height.
 */
export function createMovementState(position = new Vector3(), config = MOVEMENT, groundAt = flatGround) {
  return {
    position: position.clone(),
    velocity: new Vector3(),
    grounded: position.y <= groundAt(position.x, position.z),
    crouching: false,
    height: config.standingHeight,
    facing: 0,
  };
}

/**
 * Converts the camera's position and look target into a yaw angle, using
 * the same convention as the character: yaw 0 looks along +Z.
 */
export function cameraYaw(cameraPosition, target) {
  return Math.atan2(target.x - cameraPosition.x, target.z - cameraPosition.z);
}

/** Current ground speed for an intent (ignores direction). */
export function movementSpeed(intent, config = MOVEMENT) {
  if (intent.crouch) return config.crouchSpeed;
  if (intent.sprint) return config.walkSpeed * config.sprintMultiplier;
  return config.walkSpeed;
}

/**
 * Horizontal velocity `{ x, z }` for an intent, relative to a camera looking
 * along `yaw`. The direction is normalised, so diagonal movement is no
 * faster than moving in a single direction.
 */
export function horizontalVelocity(intent, yaw, config = MOVEMENT) {
  const forward = intent.forward ?? 0;
  const right = intent.right ?? 0;
  const length = Math.hypot(forward, right);
  if (length === 0) return { x: 0, z: 0 };

  const speed = movementSpeed(intent, config) / length;
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  // Forward is (sin, cos); camera-right is (-cos, sin) on the XZ plane.
  return {
    x: (forward * sin - right * cos) * speed,
    z: (forward * cos + right * sin) * speed,
  };
}

function approach(value, target, maxStep) {
  if (value < target) return Math.min(value + maxStep, target);
  return Math.max(value - maxStep, target);
}

function turnTowards(angle, target, maxStep) {
  const diff = Math.atan2(Math.sin(target - angle), Math.cos(target - angle));
  if (Math.abs(diff) <= maxStep) return target;
  return angle + Math.sign(diff) * maxStep;
}

/**
 * Advances `state` by `delta` seconds given an input intent
 * (`{ forward, right, sprint, crouch, jump }`) and the camera yaw.
 * `groundAt(x, z)` gives the ground height; while grounded the character
 * follows it up and down slopes. Mutates and returns `state`.
 */
export function updateMovement(state, intent, delta, yaw = 0, config = MOVEMENT, groundAt = flatGround) {
  const dt = Math.min(Math.max(delta, 0), config.maxStep);

  state.crouching = Boolean(intent.crouch);
  const horizontal = horizontalVelocity(intent, yaw, config);
  state.velocity.x = horizontal.x;
  state.velocity.z = horizontal.z;

  if (intent.jump && state.grounded) {
    state.velocity.y = config.jumpStrength;
    state.grounded = false;
  }
  if (!state.grounded) {
    state.velocity.y -= config.gravity * dt;
  }

  state.position.addScaledVector(state.velocity, dt);

  const distance = Math.hypot(state.position.x, state.position.z);
  if (distance > config.boundaryRadius) {
    const scale = config.boundaryRadius / distance;
    state.position.x *= scale;
    state.position.z *= scale;
  }

  // Land when falling to the ground; stay on it (up and down slopes) while grounded.
  const ground = groundAt(state.position.x, state.position.z);
  if (state.grounded || state.position.y <= ground) {
    state.position.y = ground;
    state.velocity.y = 0;
    state.grounded = true;
  }

  const targetHeight = state.crouching ? config.crouchHeight : config.standingHeight;
  state.height = approach(state.height, targetHeight, config.crouchTransitionSpeed * dt);

  if (horizontal.x !== 0 || horizontal.z !== 0) {
    state.facing = turnTowards(state.facing, Math.atan2(horizontal.x, horizontal.z), config.turnSpeed * dt);
  }

  return state;
}
