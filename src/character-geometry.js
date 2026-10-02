import { BufferGeometry, CapsuleGeometry, Color, CylinderGeometry, Float32BufferAttribute, LatheGeometry, Matrix4, Mesh, SphereGeometry, Vector2, Vector3, mergeGeometries } from './procedural/index.js';
import { smoothstep, lerp } from './noise.js';

/**
 * Geometry for procedural people: per-material part merging, ribbons,
 * hands with jointed fingers, feet, limbs and lathed garments with modelled
 * folds, applique bands and patchwork rows. The head, eyes and hair are in
 * character-head.js.
 */

const TAU = Math.PI * 2;
const WHITE = new Color(1, 1, 1);

// ---- Merging ------------------------------------------------------------------

/** Normalises a geometry so it can be merged: indexed, with uv and color. */
export function prepare(geometry, color = WHITE) {
  let g = geometry;
  for (const name of Object.keys(g.attributes)) {
    if (!['position', 'normal', 'uv', 'color'].includes(name)) g.deleteAttribute(name);
  }
  const count = g.attributes.position.count;
  if (!g.index) g.setIndex(Array.from({ length: count }, (_, i) => i));
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new Float32BufferAttribute(new Float32Array(count * 2), 2));
  if (!g.attributes.color) {
    const c = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) c.set([color.r, color.g, color.b], i * 3);
    g.setAttribute('color', new Float32BufferAttribute(c, 3));
  }
  g.morphAttributes = {};
  g.clearGroups();
  return g;
}

/**
 * Collects the pieces of one rigid body segment and merges them into one
 * mesh per material, so a whole character is only a couple of dozen draw
 * calls.
 */
export class PartBuilder {
  constructor() {
    this.pieces = new Map();
  }

  /**
   * Adds `geometry` (transformed by `matrix`) to the batch for `material`.
   * `color` (a hex or Color) fills the vertex colour unless the
   * geometry already has one. `label` names the item (e.g. 'turban').
   */
  add(material, geometry, { matrix = null, color = null, label = null } = {}) {
    if (color !== null) geometry.deleteAttribute('color');
    const g = prepare(geometry, color === null ? WHITE : color.isColor ? color : new Color(color));
    if (matrix) g.applyMatrix4(matrix);
    if (!this.pieces.has(material)) this.pieces.set(material, { geometries: [], labels: new Set() });
    const entry = this.pieces.get(material);
    entry.geometries.push(g);
    if (label) entry.labels.add(label);
    return this;
  }

  /** Builds the merged meshes into `group`. Returns the created meshes. */
  build(group, { castShadow = (material) => !['sclera', 'iris', 'cornea', 'beads', 'hair'].includes(material.userData.kind) } = {}) {
    const meshes = [];
    for (const [material, { geometries, labels }] of this.pieces) {
      const geometry = geometries.length === 1 ? geometries[0] : mergeGeometries(geometries, false);
      for (const g of geometries) if (g !== geometry) g.dispose();
      const mesh = new Mesh(geometry, material);
      mesh.name = `${group.name}-${material.userData.kind}`;
      mesh.castShadow = castShadow(material);
      mesh.receiveShadow = true;
      mesh.userData.parts = [...labels];
      if (material.userData.kind === 'cornea') mesh.renderOrder = 2;
      group.add(mesh);
      meshes.push(mesh);
    }
    this.pieces.clear();
    return meshes;
  }
}

/** Averages the normals of vertices that share a position (closes UV seams). */
export function smoothSeams(geometry) {
  const pos = geometry.attributes.position;
  const nor = geometry.attributes.normal;
  const groups = new Map();
  for (let i = 0; i < pos.count; i++) {
    const key = `${Math.round(pos.getX(i) * 1e5)},${Math.round(pos.getY(i) * 1e5)},${Math.round(pos.getZ(i) * 1e5)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(i);
  }
  const n = new Vector3();
  for (const indices of groups.values()) {
    if (indices.length < 2) continue;
    n.set(0, 0, 0);
    for (const i of indices) n.x += nor.getX(i), n.y += nor.getY(i), n.z += nor.getZ(i);
    n.normalize();
    for (const i of indices) nor.setXYZ(i, n.x, n.y, n.z);
  }
  nor.needsUpdate = true;
  return geometry;
}

export function colorAttribute(geometry, colorAt) {
  const pos = geometry.attributes.position;
  const c = new Float32Array(pos.count * 3);
  const p = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    const col = colorAt(p, i);
    c[i * 3] = col[0];
    c[i * 3 + 1] = col[1];
    c[i * 3 + 2] = col[2];
  }
  geometry.setAttribute('color', new Float32BufferAttribute(c, 3));
  return geometry;
}

/** A ribbon following `points` (Vector3[]), `width(t)` wide, lifted along `normals`. */
export function strip(points, sideDirs, width, { vStart = 0, vEnd = 1, uRepeat = 1 } = {}) {
  const positions = [];
  const uvs = [];
  const indices = [];
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const w = width(t) / 2;
    const p = points[i];
    const s = sideDirs[i];
    positions.push(p.x - s.x * w, p.y - s.y * w, p.z - s.z * w, p.x + s.x * w, p.y + s.y * w, p.z + s.z * w);
    const v = lerp(vEnd, vStart, t);
    uvs.push(0, v, uRepeat, v);
    if (i < n - 1) {
      const k = i * 2;
      indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

// ---- Hands and feet -------------------------------------------------------------

function capsuleAlong(radius, length, matrix) {
  const g = new CapsuleGeometry(radius, Math.max(0.0001, length - radius * 2), 1, 5);
  g.translate(0, -length / 2, 0);
  g.applyMatrix4(matrix);
  return prepare(g);
}

/**
 * A relaxed hand hanging along -Y with the palm facing +Z, thumb on the
 * `side` (+X for the right hand), fingers gently curled. `length` is wrist
 * to fingertip in metres.
 */
export function handGeometry(length, side, curl = 1) {
  const hl = length;
  const parts = [];
  const palm = new SphereGeometry(1, 8, 6);
  palm.scale(0.2 * hl, 0.28 * hl, 0.085 * hl);
  palm.translate(0, -0.24 * hl, 0);
  parts.push(prepare(palm));
  const fingers = [
    { x: 0.12, len: 0.43, r: 0.055, y: -0.47, curl: [0.32, 0.45, 0.3] },
    { x: 0.04, len: 0.47, r: 0.057, y: -0.49, curl: [0.36, 0.5, 0.32] },
    { x: -0.042, len: 0.44, r: 0.054, y: -0.48, curl: [0.4, 0.55, 0.34] },
    { x: -0.115, len: 0.35, r: 0.048, y: -0.45, curl: [0.46, 0.6, 0.36] },
  ];
  const segments = [0.47, 0.3, 0.23];
  for (const f of fingers) {
    const m = new Matrix4().makeTranslation(side * f.x * hl, f.y * hl, 0.01 * hl);
    let r = f.r * hl;
    segments.forEach((share, i) => {
      m.multiply(new Matrix4().makeRotationX(-f.curl[i] * curl));
      const len = f.len * share * hl;
      parts.push(capsuleAlong(r, len + r * 0.6, m));
      m.multiply(new Matrix4().makeTranslation(0, -len, 0));
      r *= 0.9;
    });
  }
  // Thumb: from the base of the palm, forward and down, resting against the index finger.
  const t = new Matrix4()
    .makeTranslation(side * 0.17 * hl, -0.16 * hl, 0.03 * hl)
    .multiply(new Matrix4().makeRotationZ(side * 0.45))
    .multiply(new Matrix4().makeRotationX(-0.55));
  const mound = new SphereGeometry(1, 8, 6);
  mound.scale(0.06 * hl, 0.12 * hl, 0.06 * hl);
  mound.translate(0, -0.06 * hl, 0);
  mound.applyMatrix4(t);
  parts.push(prepare(mound));
  t.multiply(new Matrix4().makeTranslation(0, -0.13 * hl, 0));
  for (const [len, bend] of [[0.2, 0.25], [0.17, 0.3]]) {
    t.multiply(new Matrix4().makeRotationX(-bend * curl));
    parts.push(capsuleAlong(0.05 * hl, len * hl, t));
    t.multiply(new Matrix4().makeTranslation(0, -len * hl, 0));
  }
  return mergeGeometries(parts, false);
}

/**
 * A foot below the ankle joint (at the origin), sole at y = -ankleHeight.
 * Moccasins get a soft gathered toe and an ankle flap; bare feet get toes.
 */
export function footGeometry({ length, width, ankleHeight, ankleRadius, moccasin }) {
  const parts = [];
  const foot = new SphereGeometry(1, 12, 8);
  const pos = foot.attributes.position;
  const sole = -ankleHeight;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    let y = pos.getY(i);
    const z = pos.getZ(i);
    // Narrow heel, broad forefoot, flat sole and a low toe box.
    const w = width * 0.5 * lerp(0.7, 1, smoothstep(-0.8, 0.3, z));
    const h = ankleHeight * lerp(1.05, 0.45, smoothstep(-0.2, 1, z));
    y = y < 0 ? y * 0.08 : y;
    pos.setXYZ(i, x * w, sole + (y + 0.08) * h * 0.95, z * length * 0.5 + length * 0.22);
  }
  foot.computeVertexNormals();
  smoothSeams(foot);
  parts.push(prepare(foot));
  if (moccasin) {
    const cuff = new CylinderGeometry(ankleRadius * 1.25, ankleRadius * 1.15, ankleHeight * 1.3, 12, 1, true);
    cuff.translate(0, -ankleHeight * 0.1, 0);
    parts.push(prepare(cuff));
    // Gathered seam over the toes.
    const seam = new CapsuleGeometry(width * 0.06, length * 0.32, 2, 5);
    seam.rotateX(Math.PI / 2 + 0.25);
    seam.translate(0, sole + ankleHeight * 0.62, length * 0.48);
    parts.push(prepare(seam));
  } else {
    const ankle = new CylinderGeometry(ankleRadius, ankleRadius * 1.1, ankleHeight * 0.9, 10, 1, true);
    parts.push(prepare(ankle));
    for (let i = 0; i < 5; i++) {
      const toe = new SphereGeometry(width * (i === 0 ? 0.13 : 0.09 - i * 0.006), 6, 5);
      toe.scale(1, 0.8, 1.3);
      toe.translate(width * (0.3 - i * 0.16), sole + width * 0.08, length * (0.68 - i * 0.025 - (i === 0 ? 0 : 0.02)));
      parts.push(prepare(toe));
    }
  }
  return mergeGeometries(parts, false);
}

/** Rounded, tapering limb hanging from y = 0 down to y = -length. */
export function limbGeometry(rTop, rBottom, length, { bulge = 0.08, segments = 12, depth = 1, cap = 1 } = {}) {
  const pts = [new Vector2(0, -length - rBottom * 0.5), new Vector2(rBottom * 0.8, -length - rBottom * 0.3)];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    const r = lerp(rBottom, rTop, t) * (1 + bulge * Math.sin(t * Math.PI));
    pts.push(new Vector2(r, -length + t * length));
  }
  pts.push(new Vector2(rTop * 0.8, rTop * 0.45 * cap), new Vector2(0, rTop * 0.65 * cap));
  const g = new LatheGeometry(pts, segments, Math.PI);
  g.scale(1, 1, depth);
  g.computeVertexNormals();
  return smoothSeams(g);
}

// ---- Garments -------------------------------------------------------------------

/** Piecewise-linear profile [[y, r], ...] (sorted by y) as a function. */
export function profileFn(points) {
  return (y) => {
    if (y <= points[0][0]) return points[0][1];
    for (let i = 1; i < points.length; i++) {
      if (y <= points[i][0]) {
        const [y0, r0] = points[i - 1];
        const [y1, r1] = points[i];
        return lerp(r0, r1, (y - y0) / (y1 - y0));
      }
    }
    return points[points.length - 1][1];
  };
}

/**
 * A garment surface: radius `profile(y)` around Y with modelled folds
 * (`folds(y)` amplitude, `count` folds around), elliptical by `depth`.
 */
export function garmentSurface(profile, { depth = 0.75, count = 11, folds = () => 0, phase = 0 } = {}) {
  return (y, phi) => {
    const r = profile(y) * (1 + folds(y) * Math.sin(count * phi + phase));
    return [r * Math.sin(phi), y, r * Math.cos(phi) * depth];
  };
}

const SEGMENTS = 44;

/** A band of the garment surface between y0 and y1 (UV v runs 0..1 across the band). */
export function garmentBand(surface, y0, y1, { steps = 3, segments = SEGMENTS, uRepeat = 1 } = {}) {
  const positions = [];
  const uvs = [];
  const indices = [];
  for (let j = 0; j <= steps; j++) {
    const y = lerp(y0, y1, j / steps);
    for (let i = 0; i <= segments; i++) {
      const phi = Math.PI + (i / segments) * TAU;
      positions.push(...surface(y, phi));
      uvs.push((i / segments) * uRepeat, j / steps);
    }
  }
  const row = segments + 1;
  for (let j = 0; j < steps; j++) {
    for (let i = 0; i < segments; i++) {
      const a = j * row + i;
      indices.push(a, a + 1, a + row, a + 1, a + row + 1, a + row);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return smoothSeams(g);
}

/**
 * A row of simple patchwork between y0 and y1: `blocks` pieces around the
 * garment in two alternating colours, either straight bars or sawtooth
 * triangles. Colours are written as vertex colours.
 */
export function patchworkBand(surface, y0, y1, { blocks = 24, colors, pattern = 'bars', inset = 0.002 }) {
  const [ca, cb] = colors.map((c) => new Color(c));
  const positions = [];
  const uvs = [];
  const cols = [];
  const per = 2;
  const push = (phi, y, u, v, c) => {
    const [x, yy, z] = surface(y, phi);
    const len = Math.hypot(x, z) || 1;
    positions.push(x + (x / len) * inset, yy, z + (z / len) * inset);
    uvs.push(u, v);
    cols.push(c.r, c.g, c.b);
  };
  for (let b = 0; b < blocks; b++) {
    for (let k = 0; k < per; k++) {
      const p0 = Math.PI + ((b * per + k) / (blocks * per)) * TAU;
      const p1 = Math.PI + ((b * per + k + 1) / (blocks * per)) * TAU;
      const u0 = (b * per + k) / per / 4;
      const u1 = (b * per + k + 1) / per / 4;
      if (pattern === 'sawtooth') {
        // Each block is split corner to corner: a dark tooth on a light ground.
        const pm = (p0 + p1) / 2;
        const um = (u0 + u1) / 2;
        const tooth = k === 0 ? ca : cb;
        const ground = k === 0 ? cb : ca;
        push(p0, y0, u0, 0, ground); push(p1, y0, u1, 0, ground); push(pm, y1, um, 1, ground);
        push(p0, y0, u0, 0, tooth); push(pm, y1, um, 1, tooth); push(p0, y1, u0, 1, tooth);
        push(p1, y0, u1, 0, tooth); push(p1, y1, u1, 1, tooth); push(pm, y1, um, 1, tooth);
      } else {
        const c = b % 2 === 0 ? ca : cb;
        push(p0, y0, u0, 0, c); push(p1, y0, u1, 0, c); push(p1, y1, u1, 1, c);
        push(p0, y0, u0, 0, c); push(p1, y1, u1, 1, c); push(p0, y1, u0, 1, c);
      }
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  g.setAttribute('color', new Float32BufferAttribute(cols, 3));
  g.computeVertexNormals();
  return smoothSeams(g);
}
