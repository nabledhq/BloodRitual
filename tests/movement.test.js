import { describe, it, expect } from 'vitest';
import { Vector3 } from '../src/procedural/index.js';
import { MOVEMENT } from '../src/config.js';
import {
  createMovementState,
  updateMovement,
  horizontalVelocity,
  movementSpeed,
  cameraYaw,
} from '../src/movement.js';

const idle = { forward: 0, right: 0, sprint: false, crouch: false, jump: false };
const STEP = 1 / 60;

function run(state, intent, seconds, yaw = 0) {
  for (let t = 0; t < seconds; t += STEP) updateMovement(state, intent, STEP, yaw);
  return state;
}

function horizontalSpeed(state) {
  return Math.hypot(state.velocity.x, state.velocity.z);
}

describe('movement config', () => {
  it('keeps every movement constant in one place', () => {
    for (const name of ['walkSpeed', 'sprintMultiplier', 'jumpStrength', 'crouchSpeed']) {
      expect(MOVEMENT[name], name).toBeGreaterThan(0);
    }
    expect(MOVEMENT.sprintMultiplier).toBeCloseTo(1.75);
    expect(MOVEMENT.crouchSpeed).toBeLessThan(MOVEMENT.walkSpeed);
    expect(MOVEMENT.crouchHeight).toBeLessThan(MOVEMENT.standingHeight);
  });
});

describe('horizontalVelocity', () => {
  it('moves forward along the camera direction and strafes sideways', () => {
    // Yaw 0 looks along +Z, so camera-right is -X.
    const fwd = horizontalVelocity({ ...idle, forward: 1 }, 0);
    expect(fwd.x).toBeCloseTo(0);
    expect(fwd.z).toBeCloseTo(MOVEMENT.walkSpeed);
    const back = horizontalVelocity({ ...idle, forward: -1 }, 0);
    expect(back.z).toBeCloseTo(-MOVEMENT.walkSpeed);
    const right = horizontalVelocity({ ...idle, right: 1 }, 0);
    expect(right.x).toBeCloseTo(-MOVEMENT.walkSpeed);
    expect(right.z).toBeCloseTo(0);
    const left = horizontalVelocity({ ...idle, right: -1 }, 0);
    expect(left.x).toBeCloseTo(MOVEMENT.walkSpeed);
  });

  it('follows the camera when it turns', () => {
    // A camera at +Z looking back at the origin looks down -Z; its right is +X.
    const yaw = cameraYaw(new Vector3(0, 2, 5), new Vector3(0, 1, 0));
    const fwd = horizontalVelocity({ ...idle, forward: 1 }, yaw);
    expect(fwd.x).toBeCloseTo(0);
    expect(fwd.z).toBeCloseTo(-MOVEMENT.walkSpeed);
    const right = horizontalVelocity({ ...idle, right: 1 }, yaw);
    expect(right.x).toBeCloseTo(MOVEMENT.walkSpeed);
    expect(right.z).toBeCloseTo(0);
  });

  it('is not faster when moving diagonally', () => {
    for (const yaw of [0, 0.7, -2.1]) {
      for (const [forward, right] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const v = horizontalVelocity({ ...idle, forward, right }, yaw);
        expect(Math.hypot(v.x, v.z)).toBeCloseTo(MOVEMENT.walkSpeed, 6);
      }
    }
  });

  it('runs at walk speed times the sprint multiplier while Shift is held', () => {
    const v = horizontalVelocity({ ...idle, forward: 1, sprint: true }, 0);
    expect(Math.hypot(v.x, v.z)).toBeCloseTo(MOVEMENT.walkSpeed * MOVEMENT.sprintMultiplier, 6);
    const diagonal = horizontalVelocity({ ...idle, forward: 1, right: 1, sprint: true }, 0);
    expect(Math.hypot(diagonal.x, diagonal.z)).toBeCloseTo(MOVEMENT.walkSpeed * MOVEMENT.sprintMultiplier, 6);
  });

  it('does not move when only Shift is held', () => {
    expect(horizontalVelocity({ ...idle, sprint: true }, 0)).toEqual({ x: 0, z: 0 });
  });

  it('uses crouch speed while crouching, even when sprinting', () => {
    expect(movementSpeed({ ...idle, crouch: true, sprint: true })).toBe(MOVEMENT.crouchSpeed);
  });
});

describe('updateMovement', () => {
  it('moves the character in the pressed direction', () => {
    const state = run(createMovementState(), { ...idle, forward: 1 }, 1);
    expect(state.position.z).toBeCloseTo(MOVEMENT.walkSpeed, 1);
    expect(state.position.x).toBeCloseTo(0);
    expect(state.position.y).toBe(0);
  });

  it('stops horizontal movement as soon as all keys are released', () => {
    const state = run(createMovementState(), { ...idle, forward: 1, right: 1, sprint: true }, 0.5);
    const stoppedAt = state.position.clone();
    updateMovement(state, idle, STEP);
    expect(horizontalSpeed(state)).toBe(0);
    run(state, idle, 1);
    expect(state.position.x).toBe(stoppedAt.x);
    expect(state.position.z).toBe(stoppedAt.z);
  });

  it('jumps only when grounded and ignores a second press mid-air', () => {
    const state = createMovementState();
    expect(state.grounded).toBe(true);
    updateMovement(state, { ...idle, jump: true }, STEP);
    expect(state.grounded).toBe(false);
    expect(state.position.y).toBeGreaterThan(0);
    const vyAfterJump = state.velocity.y;

    run(state, idle, 0.1);
    const heightBefore = state.position.y;
    const vyBefore = state.velocity.y;
    updateMovement(state, { ...idle, jump: true }, STEP);
    // No double jump: velocity keeps falling under gravity.
    expect(state.velocity.y).toBeLessThan(vyBefore);
    expect(state.velocity.y).toBeLessThan(vyAfterJump);
    expect(state.position.y).toBeGreaterThan(heightBefore - 1);

    // Lands back on the ground and can jump again.
    run(state, idle, 2);
    expect(state.grounded).toBe(true);
    expect(state.position.y).toBe(0);
    expect(state.velocity.y).toBe(0);
    updateMovement(state, { ...idle, jump: true }, STEP);
    expect(state.velocity.y).toBeGreaterThan(0);
  });

  it('reaches a jump height high enough to clear small obstacles', () => {
    const state = createMovementState();
    updateMovement(state, { ...idle, jump: true }, STEP);
    let apex = 0;
    for (let i = 0; i < 120; i++) {
      updateMovement(state, idle, STEP);
      apex = Math.max(apex, state.position.y);
    }
    expect(apex).toBeGreaterThan(0.5);
    expect(apex).toBeLessThan(2);
  });

  it('does not jump while Space is not pressed', () => {
    const state = run(createMovementState(), { ...idle, forward: 1 }, 1);
    expect(state.position.y).toBe(0);
    expect(state.grounded).toBe(true);
  });

  it('crouching reduces speed and height, and releasing restores both', () => {
    const state = createMovementState();
    run(state, { ...idle, forward: 1, crouch: true }, 0.5);
    expect(state.crouching).toBe(true);
    expect(horizontalSpeed(state)).toBeCloseTo(MOVEMENT.crouchSpeed, 6);
    expect(horizontalSpeed(state)).toBeLessThan(MOVEMENT.walkSpeed);
    expect(state.height).toBeCloseTo(MOVEMENT.crouchHeight, 6);

    run(state, { ...idle, forward: 1 }, 0.5);
    expect(state.crouching).toBe(false);
    expect(horizontalSpeed(state)).toBeCloseTo(MOVEMENT.walkSpeed, 6);
    expect(state.height).toBeCloseTo(MOVEMENT.standingHeight, 6);
  });

  it('turns the character to face its movement direction', () => {
    const state = run(createMovementState(), { ...idle, right: 1 }, 1);
    // Right at yaw 0 is -X, which is a facing of -PI/2.
    expect(state.facing).toBeCloseTo(-Math.PI / 2, 3);
    const facing = state.facing;
    run(state, idle, 0.5);
    expect(state.facing).toBe(facing);
  });

  it('keeps the character inside the world', () => {
    const state = run(createMovementState(), { ...idle, forward: 1, sprint: true }, 60);
    expect(Math.hypot(state.position.x, state.position.z)).toBeCloseTo(MOVEMENT.boundaryRadius, 4);
  });

  it('caps very long frames so the character cannot teleport', () => {
    const state = createMovementState();
    updateMovement(state, { ...idle, forward: 1 }, 5);
    expect(state.position.z).toBeCloseTo(MOVEMENT.walkSpeed * MOVEMENT.maxStep);
  });
});
