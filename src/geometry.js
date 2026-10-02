import { BufferAttribute, BufferGeometry, Euler, Float32BufferAttribute, IcosahedronGeometry, Matrix3, Matrix4, Quaternion, Vector3, mergeVertices } from './procedural/index.js';
import { fbm } from './noise.js';

/**
 * Accumulates many small pieces (primitives, strips) into one indexed
 * BufferGeometry so a whole plant or roof is a single draw call.
 */
export class MeshBuilder {
  constructor() {
    this.positions = [];
    this.normals = [];
    this.uvs = [];
    this.indices = [];
  }

  get vertexCount() {
    return this.positions.length / 3;
  }

  /** Appends `geometry` transformed by `matrix` (a Matrix4). */
  addGeometry(geometry, matrix = new Matrix4()) {
    const pos = geometry.attributes.position;
    const nor = geometry.attributes.normal;
    const uv = geometry.attributes.uv;
    const normalMatrix = new Matrix3().getNormalMatrix(matrix);
    const offset = this.vertexCount;
    const v = new Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(matrix);
      this.positions.push(v.x, v.y, v.z);
      if (nor) v.fromBufferAttribute(nor, i).applyMatrix3(normalMatrix).normalize();
      else v.set(0, 1, 0);
      this.normals.push(v.x, v.y, v.z);
      this.uvs.push(uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0);
    }
    if (geometry.index) {
      for (let i = 0; i < geometry.index.count; i++) this.indices.push(offset + geometry.index.getX(i));
    } else {
      for (let i = 0; i < pos.count; i++) this.indices.push(offset + i);
    }
    return this;
  }

  /**
   * Appends a ribbon along `points` (Vector3[]). `side` gives the width
   * direction (a Vector3 or a function of the point index) and `widths` the
   * half-width per point. UVs run u across (0..1) and v along (0..1).
   */
  addStrip(points, side, widths) {
    const offset = this.vertexCount;
    const n = points.length;
    const t = new Vector3();
    const s = new Vector3();
    const normal = new Vector3();
    for (let i = 0; i < n; i++) {
      const p = points[i];
      t.subVectors(points[Math.min(i + 1, n - 1)], points[Math.max(i - 1, 0)]).normalize();
      s.copy(typeof side === 'function' ? side(i) : side).normalize();
      normal.crossVectors(s, t).normalize();
      const w = typeof widths === 'function' ? widths(i / (n - 1)) : widths[i];
      for (const dir of [-1, 1]) {
        this.positions.push(p.x + s.x * w * dir, p.y + s.y * w * dir, p.z + s.z * w * dir);
        this.normals.push(normal.x, normal.y, normal.z);
        this.uvs.push(dir < 0 ? 0 : 1, i / (n - 1));
      }
    }
    for (let i = 0; i < n - 1; i++) {
      const a = offset + i * 2;
      this.indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    return this;
  }

  build() {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('normal', new Float32BufferAttribute(this.normals, 3));
    geometry.setAttribute('uv', new Float32BufferAttribute(this.uvs, 2));
    geometry.setIndex(this.indices);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }
}

/** Builds a Matrix4 from a position, Euler rotation (x, y, z) and scale. */
export function compose(position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1]) {
  const s = typeof scale === 'number' ? [scale, scale, scale] : scale;
  return new Matrix4().compose(
    new Vector3(...position),
    new Quaternion().setFromEuler(new Euler(...rotation)),
    new Vector3(...s),
  );
}

/** Matrix that places a unit-height Y-aligned primitive between points a and b. */
export function between(a, b, radiusScale = 1) {
  const dir = new Vector3().subVectors(b, a);
  const length = dir.length();
  const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir.normalize());
  const mid = new Vector3().addVectors(a, b).multiplyScalar(0.5);
  return new Matrix4().compose(mid, q, new Vector3(radiusScale, length, radiusScale));
}

/**
 * Displaces each vertex along its normal by `amount * (noise - 0.5)`.
 * Vertices that share a position move together, so surfaces stay closed.
 */
export function roughen(geometry, amount, { frequency = 3, seed = 0 } = {}) {
  const pos = geometry.attributes.position;
  const nor = geometry.attributes.normal;
  const v = new Vector3();
  const n = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    n.fromBufferAttribute(nor, i);
    const d = (fbm(v.x * frequency + v.y * 1.7, v.z * frequency - v.y * 1.3, { octaves: 3, seed }) - 0.5) * amount;
    pos.setXYZ(i, v.x + n.x * d, v.y + n.y * d, v.z + n.z * d);
  }
  pos.needsUpdate = true;
  return geometry;
}

/** A lumpy, closed, smooth-shaded blob (stones, foliage clumps). */
export function blob(radius, { detail = 2, amount = 0.35, frequency = 2.5, seed = 0 } = {}) {
  let geometry = new IcosahedronGeometry(radius, detail);
  geometry.deleteAttribute('uv');
  geometry.deleteAttribute('normal');
  geometry = mergeVertices(geometry);
  geometry.computeVertexNormals();
  roughen(geometry, radius * amount, { frequency: frequency / radius, seed });
  geometry.computeVertexNormals();
  // Simple planar-ish UVs; the textures used on blobs are isotropic.
  const pos = geometry.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = (pos.getX(i) + pos.getZ(i) * 0.7) / radius;
    uv[i * 2 + 1] = (pos.getY(i) - pos.getZ(i) * 0.4) / radius;
  }
  geometry.setAttribute('uv', new BufferAttribute(uv, 2));
  return geometry;
}
