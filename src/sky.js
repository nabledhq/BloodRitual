import { Color, LinearSRGBColorSpace, Vector3 } from './procedural/index.js';
import { fbm, smoothstep, lerp } from './noise.js';

/**
 * Procedural HDR sky used both as the visible background and as the
 * image-based environment light. `skyRadiance` is an analytic function of
 * direction: a hazy humid-subtropical gradient, soft cumulus and a bright
 * sun disc that lines up with the directional sun light. The engine
 * (src/engine/SkyEnvironment.js) samples it into a float cube map.
 */

/** Hazy horizon colour (sRGB hex). Fog uses the same colour so distant terrain melts into the sky. */
export const HORIZON_COLOR = 0xb4c3c6;

/** Direction *towards* the sun (late morning, about 42 degrees up). */
export const SUN_DIRECTION = new Vector3(0.62, 0.67, 0.4).normalize();

const horizon = new Color(HORIZON_COLOR); // stored linear
const zenith = new Color().setRGB(0.16, 0.33, 0.66, LinearSRGBColorSpace);
const groundColor = new Color().setRGB(0.12, 0.12, 0.08, LinearSRGBColorSpace);
const sunTint = new Color().setRGB(1.0, 0.86, 0.66, LinearSRGBColorSpace);

/** Linear HDR radiance [r, g, b] seen looking along the unit direction `dir`. */
export function skyRadiance(dir, sunDirection = SUN_DIRECTION) {
  const sy = dir.y;
  const c = new Color();
  if (sy >= 0) {
    // Above the horizon: haze fading into a deeper blue overhead.
    c.copy(horizon).lerp(zenith, Math.pow(smoothstep(0, 1, sy), 0.4));
    // Soft fair-weather cumulus projected onto a cloud layer.
    if (sy > 0.04) {
      const px = dir.x / (sy + 0.15);
      const pz = dir.z / (sy + 0.15);
      const n = fbm(px * 1.6 + 7, pz * 1.6 + 3, { octaves: 5, seed: 9 });
      const cloud = smoothstep(0.52, 0.72, n) * smoothstep(0.04, 0.25, sy);
      c.r = lerp(c.r, 0.95, cloud * 0.85);
      c.g = lerp(c.g, 0.94, cloud * 0.85);
      c.b = lerp(c.b, 0.92, cloud * 0.85);
    }
  } else {
    // Below the horizon: keep the haze for a few degrees (hides the
    // terrain edge), then fade to a dim ground bounce colour.
    c.copy(horizon).lerp(groundColor, smoothstep(0.2, 0.5, -sy));
  }
  const d = Math.max(0, dir.x * sunDirection.x + dir.y * sunDirection.y + dir.z * sunDirection.z);
  const glow = Math.pow(d, 12) * 0.5 + Math.pow(d, 200) * 3;
  const disc = d > 0.99985 ? 60 : 0;
  return [c.r + sunTint.r * (glow + disc), c.g + sunTint.g * (glow + disc), c.b + sunTint.b * (glow + disc)];
}

/** Description of the sky environment, applied by the engine as skybox and IBL. */
export function createSky({ sunDirection = SUN_DIRECTION } = {}) {
  return { isSky: true, name: 'sky', sunDirection, radiance: (dir) => skyRadiance(dir, sunDirection) };
}
