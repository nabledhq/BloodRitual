/**
 * Where things sit in the starting camp. Shared by the terrain (which
 * flattens and paints the ground around them), the world builder and the
 * game (NPC placement).
 *
 * The player stands at the origin facing +Z; the starting camera looks
 * back towards -Z, so the camp is laid out behind the player.
 */
export const LAYOUT = Object.freeze({
  /** Radius of the flat, trodden clearing around the origin. */
  campRadius: 6,
  chickee: Object.freeze({ x: 5, z: -3.4, rotation: -0.4 }),
  firePit: Object.freeze({ x: -2.3, z: -2.9 }),
  pond: Object.freeze({ x: -12, z: -10, rx: 6.4, rz: 4.4 }),
  canoe: Object.freeze({ x: -7.1, z: -6.6, rotation: 0.9 }),
  mortar: Object.freeze({ x: 2.2, z: -1.4 }),
  woodpile: Object.freeze({ x: 8.2, z: -1.2, rotation: 1.2 }),
  /** Loop walked by the villager NPC (an ellipse). */
  walkPath: Object.freeze({ x: -0.6, z: -6.4, rx: 3.0, rz: 1.3 }),
});

/** Surface level of the pond. */
export const WATER_LEVEL = -0.32;
