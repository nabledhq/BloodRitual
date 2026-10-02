import * as THREE from 'three';
import { fbm, smoothstep, lerp } from './noise.js';

/**
 * Procedural HDR sky used both as the visible background and as the
 * image-based environment light (three.js prefilters it with PMREM). It is
 * an equirectangular half-float texture: a hazy humid-subtropical gradient,
 * soft cumulus and a bright sun disc that lines up with the directional
 * sun light.
 */

/** Hazy horizon colour (sRGB hex). Fog uses the same colour so distant terrain melts into the sky. */
export const HORIZON_COLOR = 0xb4c3c6;

/** Direction *towards* the sun (late morning, about 42 degrees up). */
export const SUN_DIRECTION = new THREE.Vector3(0.62, 0.67, 0.4).normalize();

export function createSkyTexture({ width = 512, height = 256, sunDirection = SUN_DIRECTION } = {}) {
  const horizon = new THREE.Color(HORIZON_COLOR); // stored linear
  const zenith = new THREE.Color().setRGB(0.16, 0.33, 0.66, THREE.LinearSRGBColorSpace);
  const ground = new THREE.Color().setRGB(0.12, 0.12, 0.08, THREE.LinearSRGBColorSpace);
  const sunTint = new THREE.Color().setRGB(1.0, 0.86, 0.66, THREE.LinearSRGBColorSpace);
  const data = new Uint16Array(width * height * 4);
  const toHalf = THREE.DataUtils.toHalfFloat;
  const dir = new THREE.Vector3();
  const c = new THREE.Color();

  for (let y = 0; y < height; y++) {
    const lat = ((y + 0.5) / height - 0.5) * Math.PI;
    const sy = Math.sin(lat);
    const cy = Math.cos(lat);
    for (let x = 0; x < width; x++) {
      const phi = ((x + 0.5) / width - 0.5) * Math.PI * 2;
      dir.set(Math.cos(phi) * cy, sy, Math.sin(phi) * cy);

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
        c.copy(horizon).lerp(ground, smoothstep(0.2, 0.5, -sy));
      }

      const d = Math.max(0, dir.dot(sunDirection));
      const glow = Math.pow(d, 12) * 0.5 + Math.pow(d, 200) * 3;
      const disc = d > 0.99985 ? 60 : 0;
      c.r += sunTint.r * (glow + disc);
      c.g += sunTint.g * (glow + disc);
      c.b += sunTint.b * (glow + disc);

      const i = (y * width + x) * 4;
      data[i] = toHalf(c.r);
      data[i + 1] = toHalf(c.g);
      data[i + 2] = toHalf(c.b);
      data[i + 3] = toHalf(1);
    }
  }

  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.HalfFloatType);
  texture.name = 'sky';
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.LinearSRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}
