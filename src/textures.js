import * as THREE from 'three';
import { fbm, valueNoise, smoothstep, clamp01, lerp } from './noise.js';

/**
 * Procedural PBR texture sets (albedo + normal + roughness) generated at
 * start-up from tileable noise. Generating them in code keeps the repository
 * free of binary assets and licensing questions while still giving every
 * surface real texture detail.
 *
 * Each set is generated once and cached. The normal map stores the surface
 * height in its alpha channel, which the terrain shader uses for
 * height-based blending between ground layers.
 */

export const TEXTURE_SIZE = 256;

const TAU = Math.PI * 2;

function mix3(a, b, t) {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

function dataTexture(data, size, colorSpace) {
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.colorSpace = colorSpace;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Runs `sample(u, v)` for every texel. It must return
 * `{ color: [r, g, b], height, roughness, alpha? }` with values in [0, 1].
 */
function generateSet(name, sample, { size = TEXTURE_SIZE, normalStrength = 2 } = {}) {
  const n = size * size;
  const albedo = new Uint8Array(n * 4);
  const rough = new Uint8Array(n * 4);
  const heights = new Float32Array(n);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const s = sample((x + 0.5) / size, (y + 0.5) / size);
      albedo[i * 4] = clamp01(s.color[0]) * 255;
      albedo[i * 4 + 1] = clamp01(s.color[1]) * 255;
      albedo[i * 4 + 2] = clamp01(s.color[2]) * 255;
      albedo[i * 4 + 3] = clamp01(s.alpha ?? 1) * 255;
      const r = clamp01(s.roughness) * 255;
      rough[i * 4] = r;
      rough[i * 4 + 1] = r;
      rough[i * 4 + 2] = r;
      rough[i * 4 + 3] = 255;
      heights[i] = clamp01(s.height);
    }
  }

  // Tangent-space normals from the height field (wrapping at the edges so the
  // normal map tiles as well as the albedo).
  const normal = new Uint8Array(n * 4);
  const k = normalStrength * (size / 256);
  for (let y = 0; y < size; y++) {
    const yu = ((y + 1) % size) * size;
    const yd = ((y - 1 + size) % size) * size;
    for (let x = 0; x < size; x++) {
      const xr = (x + 1) % size;
      const xl = (x - 1 + size) % size;
      const dx = (heights[y * size + xr] - heights[y * size + xl]) * k;
      const dy = (heights[yu + x] - heights[yd + x]) * k;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      normal[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      normal[i + 1] = ((-dy / len) * 0.5 + 0.5) * 255;
      normal[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      normal[i + 3] = heights[y * size + x] * 255;
    }
  }

  const set = {
    name,
    map: dataTexture(albedo, size, THREE.SRGBColorSpace),
    normalMap: dataTexture(normal, size, THREE.NoColorSpace),
    roughnessMap: dataTexture(rough, size, THREE.NoColorSpace),
  };
  for (const [kind, tex] of Object.entries(set)) {
    if (tex.isTexture) tex.name = `${name}.${kind}`;
  }
  return set;
}

// Shorthand for tileable fbm over the unit square.
function tfbm(u, v, fx, fy, seed, octaves = 4) {
  return fbm(u * fx, v * fy, { period: fx, periodY: fy, seed, octaves });
}

function tnoise(u, v, fx, fy, seed) {
  return valueNoise(u * fx, v * fy, fx, seed, fy);
}

/** Plain-weave profile used by fabric and basketry. */
function weave(u, v, count) {
  const cu = Math.floor(u * count);
  const cv = Math.floor(v * count);
  const alongU = (cu + cv) % 2 === 0;
  const across = alongU ? Math.abs(Math.sin(Math.PI * v * count)) : Math.abs(Math.sin(Math.PI * u * count));
  const along = alongU ? Math.sin(Math.PI * (u * count - cu)) : Math.sin(Math.PI * (v * count - cv));
  return across * (0.75 + 0.25 * along);
}

const RECIPES = {
  grass(u, v) {
    const macro = tfbm(u, v, 4, 4, 1);
    const clumps = tfbm(u, v, 16, 16, 2, 3);
    const blades = tnoise(u, v, 128, 32, 3) * 0.5 + tnoise(u, v, 32, 128, 4) * 0.5;
    const dry = smoothstep(0.55, 0.78, tfbm(u, v, 8, 8, 5, 3));
    let c = mix3([0.24, 0.3, 0.13], [0.4, 0.43, 0.21], macro);
    c = mix3(c, [0.53, 0.49, 0.3], dry * 0.8);
    const shade = 0.72 + 0.45 * blades * clumps;
    return {
      color: [c[0] * shade, c[1] * shade, c[2] * shade],
      height: blades * 0.6 + clumps * 0.4,
      roughness: 0.82 + 0.15 * (1 - blades),
    };
  },

  dirt(u, v) {
    const macro = tfbm(u, v, 4, 4, 11);
    const detail = tfbm(u, v, 32, 32, 12, 3);
    const pebble = smoothstep(0.7, 0.8, tnoise(u, v, 48, 48, 13));
    const litter = smoothstep(0.78, 0.86, tnoise(u, v, 24, 24, 14));
    let c = mix3([0.36, 0.3, 0.22], [0.54, 0.47, 0.36], macro);
    c = mix3(c, [0.66, 0.62, 0.54], pebble * 0.7);
    c = mix3(c, [0.3, 0.24, 0.15], litter * 0.6);
    const shade = 0.85 + 0.25 * detail;
    return {
      color: [c[0] * shade, c[1] * shade, c[2] * shade],
      height: detail * 0.5 + pebble * 0.5,
      roughness: 0.88 + 0.1 * detail,
    };
  },

  mud(u, v) {
    const macro = tfbm(u, v, 4, 4, 21);
    const detail = tfbm(u, v, 24, 24, 22, 3);
    const wet = smoothstep(0.42, 0.62, tfbm(u, v, 6, 6, 23, 3));
    const debris = smoothstep(0.8, 0.88, tnoise(u, v, 40, 40, 24));
    let c = mix3([0.2, 0.16, 0.11], [0.31, 0.26, 0.18], macro);
    c = mix3(c, [0.13, 0.11, 0.08], wet * 0.6);
    c = mix3(c, [0.42, 0.36, 0.22], debris * 0.6);
    return {
      color: c,
      height: (1 - wet) * 0.5 + detail * 0.4 + debris * 0.1,
      roughness: lerp(0.85, 0.3, wet),
    };
  },

  thatch(u, v) {
    // Strands run along v (down the roof slope).
    const strands = tfbm(u, v, 96, 4, 31, 3);
    const fine = tnoise(u, v, 192, 8, 32);
    const weather = tfbm(u, v, 4, 4, 33, 3);
    const gap = smoothstep(0.35, 0.12, strands);
    let c = mix3([0.5, 0.42, 0.26], [0.62, 0.53, 0.34], fine);
    c = mix3(c, [0.42, 0.39, 0.33], smoothstep(0.45, 0.75, weather) * 0.7);
    c = mix3(c, [0.14, 0.11, 0.07], gap * 0.85);
    return {
      color: c,
      height: strands * 0.75 + fine * 0.25,
      roughness: 0.85 + 0.12 * fine,
    };
  },

  bark(u, v) {
    // Stringy, vertically fibrous bark (cypress / palm boots). v runs up the trunk.
    const ridges = tfbm(u, v, 24, 3, 41, 4);
    const fibres = tnoise(u, v, 96, 6, 42);
    const lichen = smoothstep(0.62, 0.75, tfbm(u, v, 6, 6, 43, 3));
    const crack = smoothstep(0.38, 0.2, ridges);
    let c = mix3([0.33, 0.27, 0.21], [0.48, 0.41, 0.33], ridges);
    c = mix3(c, [0.56, 0.55, 0.47], lichen * 0.5);
    c = mix3(c, [0.17, 0.12, 0.09], crack * 0.8);
    const shade = 0.85 + 0.25 * fibres;
    return {
      color: [c[0] * shade, c[1] * shade, c[2] * shade],
      height: ridges * 0.8 + fibres * 0.2,
      roughness: 0.9,
    };
  },

  wood(u, v) {
    // Hewn / split cypress: grain runs along u.
    const warp = tfbm(u, v, 2, 4, 51, 3);
    const grain = 0.5 + 0.5 * Math.sin(TAU * (v * 18 + warp * 2.5));
    const fine = tnoise(u, v, 8, 128, 52);
    const grey = tfbm(u, v, 4, 4, 53, 3);
    let c = mix3([0.36, 0.26, 0.17], [0.55, 0.42, 0.29], grain * 0.6 + fine * 0.4);
    c = mix3(c, [0.48, 0.45, 0.4], smoothstep(0.45, 0.7, grey) * 0.55);
    return {
      color: c,
      height: grain * 0.6 + fine * 0.4,
      roughness: 0.68 + 0.2 * fine,
    };
  },

  charred(u, v) {
    const grain = 0.5 + 0.5 * Math.sin(TAU * (v * 10 + tfbm(u, v, 2, 4, 61, 3) * 2));
    const cracks = smoothstep(0.75, 0.85, tnoise(u, v, 16, 6, 62));
    const ash = smoothstep(0.55, 0.75, tfbm(u, v, 8, 8, 63, 3));
    let c = mix3([0.05, 0.045, 0.04], [0.16, 0.14, 0.12], grain);
    c = mix3(c, [0.45, 0.43, 0.4], ash * 0.6);
    return { color: c, height: grain * 0.6 + (1 - cracks) * 0.4, roughness: 0.95 };
  },

  fabric(u, v) {
    // Near-white cotton weave; the material colour tints it.
    const w = weave(u, v, 64);
    const slub = tfbm(u, v, 8, 64, 71, 3);
    const grime = tfbm(u, v, 4, 4, 72, 3);
    const g = (0.8 + 0.2 * w) * (0.93 + 0.07 * slub) * (0.94 + 0.06 * grime);
    return { color: [g, g, g], height: w * 0.8 + slub * 0.2, roughness: 0.82 + 0.15 * (1 - w) };
  },

  skin(u, v) {
    const tone = tfbm(u, v, 6, 6, 81, 4);
    const pores = tnoise(u, v, 128, 128, 82);
    const g = 0.92 + 0.08 * tone;
    return { color: [g, g * 0.985, g * 0.97], height: pores * 0.5 + tone * 0.5, roughness: 0.55 + 0.15 * pores };
  },

  water(u, v) {
    const ripples = tfbm(u, v, 6, 6, 91, 5);
    // Faint floating silt/pollen streaks and patches of calmer, glossier water.
    const silt = smoothstep(0.55, 0.8, tfbm(u, v, 3, 3, 92, 4));
    const calm = tfbm(u, v, 2, 2, 93, 3);
    const g = 0.92 + 0.08 * ripples;
    return { color: [g + silt * 0.08, g + silt * 0.06, g * 0.97], height: ripples, roughness: 0.04 + 0.1 * (1 - calm) + silt * 0.1 };
  },

  leaf(u, v) {
    // A single palm leaflet / blade: u across (midrib at 0.5), v from base to tip.
    const rib = smoothstep(0.07, 0.0, Math.abs(u - 0.5));
    const veins = 0.5 + 0.5 * Math.cos(TAU * u * 7);
    const mottle = tfbm(u, v, 4, 8, 101, 3);
    const tip = smoothstep(0.82, 1.0, v) * smoothstep(0.4, 0.8, mottle);
    let c = mix3([0.2, 0.28, 0.12], [0.33, 0.4, 0.19], mottle);
    c = mix3(c, [0.55, 0.55, 0.3], rib * 0.6);
    c = mix3(c, [0.5, 0.41, 0.25], tip * 0.8);
    const shade = 0.85 + 0.15 * veins;
    return {
      color: [c[0] * shade, c[1] * shade, c[2] * shade],
      height: rib * 0.6 + veins * 0.4,
      roughness: 0.55 + 0.2 * mottle,
    };
  },

  blade(u, v) {
    // Sawgrass blade: pale at the base, olive in the middle, tan at the tip.
    const rib = smoothstep(0.1, 0.0, Math.abs(u - 0.5));
    const streak = tnoise(u, v, 16, 4, 111);
    let c = mix3([0.55, 0.52, 0.34], [0.38, 0.4, 0.2], smoothstep(0.0, 0.35, v));
    c = mix3(c, [0.6, 0.52, 0.33], smoothstep(0.6, 1.0, v) * (0.5 + 0.5 * streak));
    c = mix3(c, [0.6, 0.6, 0.4], rib * 0.35);
    return { color: c, height: rib * 0.5 + streak * 0.5, roughness: 0.7 };
  },

  foliage(u, v) {
    // Clumped, feathery needles for cypress crowns.
    const clumps = tfbm(u, v, 8, 8, 121, 4);
    const needles = tnoise(u, v, 96, 96, 122) * 0.6 + tnoise(u, v, 48, 160, 123) * 0.4;
    const gap = smoothstep(0.42, 0.25, clumps);
    let c = mix3([0.15, 0.21, 0.09], [0.3, 0.37, 0.16], needles);
    c = mix3(c, [0.36, 0.33, 0.18], smoothstep(0.7, 0.85, clumps) * 0.5);
    c = mix3(c, [0.05, 0.07, 0.03], gap * 0.8);
    return { color: c, height: clumps * 0.5 + needles * 0.5, roughness: 0.85 };
  },

  stone(u, v) {
    const macro = tfbm(u, v, 4, 4, 131, 5);
    const pits = smoothstep(0.75, 0.85, tnoise(u, v, 40, 40, 132));
    const soot = smoothstep(0.55, 0.8, tfbm(u, v, 3, 3, 133, 3));
    let c = mix3([0.42, 0.4, 0.36], [0.62, 0.6, 0.55], macro);
    c = mix3(c, [0.2, 0.19, 0.17], pits * 0.6);
    c = mix3(c, [0.12, 0.11, 0.1], soot * 0.5);
    return { color: c, height: macro * 0.8 - pits * 0.2 + 0.2, roughness: 0.88 };
  },

  basket(u, v) {
    const w = weave(u, v, 12);
    const fibre = tnoise(u, v, 64, 8, 141);
    const band = Math.floor(v * 12) % 6 === 2 ? 1 : 0;
    let c = mix3([0.5, 0.38, 0.22], [0.68, 0.56, 0.36], w * 0.7 + fibre * 0.3);
    c = mix3(c, [0.32, 0.17, 0.1], band * 0.7);
    return { color: c, height: w, roughness: 0.8 };
  },

  iron(u, v) {
    const rust = smoothstep(0.55, 0.75, tfbm(u, v, 6, 6, 151, 5));
    const pitting = tnoise(u, v, 96, 96, 152);
    let c = mix3([0.11, 0.105, 0.1], [0.17, 0.16, 0.15], pitting);
    c = mix3(c, [0.34, 0.19, 0.1], rust * 0.8);
    return { color: c, height: pitting * 0.4 + rust * 0.6, roughness: lerp(0.5, 0.9, rust) };
  },
};

export const TEXTURE_SET_NAMES = Object.freeze(Object.keys(RECIPES));

const STRENGTH = { water: 3, fabric: 1.5, skin: 0.6, leaf: 1.2, blade: 1 };

const cache = new Map();

/** Returns the cached `{ map, normalMap, roughnessMap }` set for `name`. */
export function getTextureSet(name) {
  if (!RECIPES[name]) throw new Error(`Unknown texture set "${name}"`);
  if (!cache.has(name)) {
    cache.set(name, generateSet(name, RECIPES[name], { normalStrength: STRENGTH[name] ?? 2 }));
  }
  return cache.get(name);
}

/**
 * Returns a copy of a texture set whose textures repeat `rx` by `ry` times.
 * The copies share their pixel data with the cached originals.
 */
export function repeatedSet(name, rx, ry = rx) {
  const base = getTextureSet(name);
  const out = { name };
  for (const kind of ['map', 'normalMap', 'roughnessMap']) {
    const tex = base[kind].clone();
    tex.repeat.set(rx, ry);
    tex.needsUpdate = true;
    out[kind] = tex;
  }
  return out;
}
