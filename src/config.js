import { CHARACTER_HEIGHT } from './character.js';
import { WORLD_SIZE } from './world.js';

/**
 * Tunable constants for player movement. Speeds are in world units
 * (metres) per second, accelerations in metres per second squared.
 * Everything that affects how the character moves lives here.
 */
export const MOVEMENT = Object.freeze({
  /** Walking speed on the ground. */
  walkSpeed: 3,
  /** Holding Shift multiplies the walk speed by this. */
  sprintMultiplier: 1.75,
  /** Speed while crouching (replaces walk / sprint speed). */
  crouchSpeed: 1.4,
  /** Upward velocity applied when jumping. */
  jumpStrength: 5.5,
  /** Downward acceleration while airborne. */
  gravity: 18,
  /** Character height when standing. */
  standingHeight: CHARACTER_HEIGHT,
  /** Character height while crouching. */
  crouchHeight: CHARACTER_HEIGHT * 0.65,
  /** How fast the character changes between standing and crouching height (m/s). */
  crouchTransitionSpeed: 6,
  /** How fast the character turns to face its movement direction (rad/s). */
  turnSpeed: 12,
  /** The character cannot walk further than this from the camp centre. */
  boundaryRadius: WORLD_SIZE / 2 - 2,
  /** Longest frame step simulated at once, so a stalled tab cannot fling the player. */
  maxStep: 0.1,
});

/** Talking to villagers (distances in metres, measured on the ground). */
export const INTERACTION = Object.freeze({
  /** The player must be this close to a villager for E to open the menu. */
  radius: 2.2,
  /** An open menu closes once the player (or the villager) is further apart than this. */
  leaveRadius: 3.5,
});
