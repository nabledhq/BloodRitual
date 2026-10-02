/**
 * Small, dependency-free noise helpers used to generate procedural textures
 * and terrain. Everything is deterministic so the world looks the same on
 * every launch and in tests.
 */

// Permutation table and lattice values (fixed seed), Perlin style. Table
// lookups are much cheaper than integer hashing, which matters because the
// procedural textures sample noise tens of millions of times at start-up.
const TABLE_SIZE = 1024;
const MASK = TABLE_SIZE - 1;
const PERM = new Uint16Array(TABLE_SIZE * 2);
const VALUES = new Float32Array(TABLE_SIZE);
{
  let s = 0x9e3779b9;
  const rand = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const p = Array.from({ length: TABLE_SIZE }, (_, i) => i);
  for (let i = TABLE_SIZE - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < TABLE_SIZE * 2; i++) PERM[i] = p[i & MASK];
  for (let i = 0; i < TABLE_SIZE; i++) VALUES[i] = rand();
}

/** Hash of a 2D lattice point (and seed) to a float in [0, 1). */
export function hash2(ix, iy, seed = 0) {
  return VALUES[PERM[PERM[(ix + Math.imul(seed, 157)) & MASK] + (iy & MASK)]];
}

function mod(a, n) {
  return ((a % n) + n) % n;
}

/**
 * Smooth value noise in [0, 1]. When `period` (and optionally a separate
 * `periodY`) is a positive integer the noise repeats every `period` units,
 * which is what makes textures tile.
 */
export function valueNoise(x, y, period = 0, seed = 0, periodY = period) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  let ax = x0;
  let ay = y0;
  let bx = x0 + 1;
  let by = y0 + 1;
  if (period > 0 && periodY > 0) {
    ax = mod(ax, period);
    ay = mod(ay, periodY);
    bx = mod(bx, period);
    by = mod(by, periodY);
  }
  const a = hash2(ax, ay, seed);
  const b = hash2(bx, ay, seed);
  const c = hash2(ax, by, seed);
  const d = hash2(bx, by, seed);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

/**
 * Fractal Brownian motion: several octaves of value noise, normalised to
 * [0, 1]. A positive `period` (and `periodY`) keeps every octave tileable.
 */
export function fbm(x, y, { octaves = 4, period = 0, periodY = period, seed = 0, lacunarity = 2, gain = 0.5 } = {}) {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let freq = 1;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise(x * freq, y * freq, period * freq, seed + i * 31, periodY * freq) * amp;
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}

export function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function smoothstep(edge0, edge1, x) {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}
