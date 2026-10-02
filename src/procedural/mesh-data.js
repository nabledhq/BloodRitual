import { Vector3, Vector2, Matrix3, Matrix4 } from './math.js';

/**
 * Engine-neutral triangle mesh data: typed vertex attributes plus an
 * optional index. Procedural modules build and edit these on the CPU; the
 * engine layer (src/engine/AssetManager.js) uploads them as Babylon.js
 * VertexData. Primitive builders follow the usual conventions (Y up,
 * counter-clockwise front faces, UV v = 1 at the top).
 */

export class BufferAttribute {
  constructor(array, itemSize) {
    this.array = array;
    this.itemSize = itemSize;
    this.needsUpdate = false;
  }
  get count() {
    return this.array.length / this.itemSize;
  }
  getX(i) {
    return this.array[i * this.itemSize];
  }
  getY(i) {
    return this.array[i * this.itemSize + 1];
  }
  getZ(i) {
    return this.array[i * this.itemSize + 2];
  }
  setX(i, v) {
    this.array[i * this.itemSize] = v;
    return this;
  }
  setY(i, v) {
    this.array[i * this.itemSize + 1] = v;
    return this;
  }
  setZ(i, v) {
    this.array[i * this.itemSize + 2] = v;
    return this;
  }
  setXY(i, x, y) {
    this.array[i * this.itemSize] = x;
    this.array[i * this.itemSize + 1] = y;
    return this;
  }
  setXYZ(i, x, y, z) {
    const k = i * this.itemSize;
    this.array[k] = x;
    this.array[k + 1] = y;
    this.array[k + 2] = z;
    return this;
  }
  clone() {
    return new BufferAttribute(this.array.slice(), this.itemSize);
  }
}

export class Float32BufferAttribute extends BufferAttribute {
  constructor(array, itemSize) {
    super(new Float32Array(array), itemSize);
  }
}

export class BufferGeometry {
  constructor() {
    this.attributes = {};
    this.index = null;
    this.boundingBox = null;
  }
  setAttribute(name, attribute) {
    this.attributes[name] = attribute;
    return this;
  }
  getAttribute(name) {
    return this.attributes[name];
  }
  deleteAttribute(name) {
    delete this.attributes[name];
    return this;
  }
  setIndex(index) {
    if (index === null) this.index = null;
    else if (index instanceof BufferAttribute) this.index = index;
    else {
      const max = index.reduce((m, v) => (v > m ? v : m), 0);
      this.index = new BufferAttribute(max > 65535 ? new Uint32Array(index) : new Uint16Array(index), 1);
    }
    return this;
  }
  clearGroups() {}
  dispose() {}
  clone() {
    const g = new BufferGeometry();
    for (const [name, attribute] of Object.entries(this.attributes)) g.setAttribute(name, attribute.clone());
    if (this.index) g.index = this.index.clone();
    return g;
  }

  applyMatrix4(matrix) {
    const pos = this.attributes.position;
    const v = new Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(matrix);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    const nor = this.attributes.normal;
    if (nor) {
      const normalMatrix = new Matrix3().getNormalMatrix(matrix);
      for (let i = 0; i < nor.count; i++) {
        v.fromBufferAttribute(nor, i).applyMatrix3(normalMatrix).normalize();
        nor.setXYZ(i, v.x, v.y, v.z);
      }
    }
    // A mirroring transform flips the winding; swap it back so faces stay front-facing.
    if (matrix.determinant() < 0) {
      if (!this.index) this.setIndex(Array.from({ length: pos.count }, (_, i) => i));
      const idx = this.index.array;
      for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
    }
    this.boundingBox = null;
    return this;
  }
  translate(x, y, z) {
    return this.applyMatrix4(new Matrix4().makeTranslation(x, y, z));
  }
  scale(x, y, z) {
    return this.applyMatrix4(new Matrix4().makeScale(x, y, z));
  }
  rotateX(a) {
    return this.applyMatrix4(new Matrix4().makeRotationX(a));
  }
  rotateY(a) {
    return this.applyMatrix4(new Matrix4().makeRotationY(a));
  }
  rotateZ(a) {
    return this.applyMatrix4(new Matrix4().makeRotationZ(a));
  }

  /** Area-weighted smooth normals (indexed) or flat normals (non-indexed). */
  computeVertexNormals() {
    const pos = this.attributes.position;
    const normals = new Float32Array(pos.count * 3);
    const a = new Vector3();
    const b = new Vector3();
    const c = new Vector3();
    const n = new Vector3();
    const e = new Vector3();
    const triangles = this.index ? this.index.count / 3 : pos.count / 3;
    for (let t = 0; t < triangles; t++) {
      const ia = this.index ? this.index.getX(t * 3) : t * 3;
      const ib = this.index ? this.index.getX(t * 3 + 1) : t * 3 + 1;
      const ic = this.index ? this.index.getX(t * 3 + 2) : t * 3 + 2;
      a.fromBufferAttribute(pos, ia);
      b.fromBufferAttribute(pos, ib);
      c.fromBufferAttribute(pos, ic);
      n.subVectors(c, b).cross(e.subVectors(a, b));
      for (const i of [ia, ib, ic]) {
        normals[i * 3] += n.x;
        normals[i * 3 + 1] += n.y;
        normals[i * 3 + 2] += n.z;
      }
    }
    for (let i = 0; i < pos.count; i++) {
      const l = Math.hypot(normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2]) || 1;
      normals[i * 3] /= l;
      normals[i * 3 + 1] /= l;
      normals[i * 3 + 2] /= l;
    }
    this.setAttribute('normal', new BufferAttribute(normals, 3));
    return this;
  }

  computeBoundingBox() {
    const pos = this.attributes.position;
    const min = new Vector3(Infinity, Infinity, Infinity);
    const max = new Vector3(-Infinity, -Infinity, -Infinity);
    const v = new Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      min.min(v);
      max.max(v);
    }
    this.boundingBox = { min, max };
    return this;
  }
  computeBoundingSphere() {
    return this;
  }
}

/** Builds a geometry from plain arrays. */
export function geometryFromArrays({ positions, normals = null, uvs = null, indices = null }) {
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(positions, 3));
  if (normals) g.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  if (uvs) g.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  if (indices) g.setIndex(indices);
  return g;
}

// ---- Primitives ---------------------------------------------------------------------

/** Indices for a (cols + 1) x (rows + 1) vertex grid, row by row. */
function gridIndices(cols, rows, start = 0, out = []) {
  for (let iy = 0; iy < rows; iy++) {
    for (let ix = 0; ix < cols; ix++) {
      const a = start + ix + (cols + 1) * iy;
      const b = start + ix + (cols + 1) * (iy + 1);
      const c = start + ix + 1 + (cols + 1) * (iy + 1);
      const d = start + ix + 1 + (cols + 1) * iy;
      out.push(a, b, d, b, c, d);
    }
  }
  return out;
}

export class PlaneGeometry extends BufferGeometry {
  constructor(width = 1, height = 1, widthSegments = 1, heightSegments = 1) {
    super();
    const positions = [];
    const normals = [];
    const uvs = [];
    for (let iy = 0; iy <= heightSegments; iy++) {
      const y = (iy / heightSegments) * height - height / 2;
      for (let ix = 0; ix <= widthSegments; ix++) {
        const x = (ix / widthSegments) * width - width / 2;
        positions.push(x, -y, 0);
        normals.push(0, 0, 1);
        uvs.push(ix / widthSegments, 1 - iy / heightSegments);
      }
    }
    Object.assign(this, geometryFromArrays({ positions, normals, uvs, indices: gridIndices(widthSegments, heightSegments) }));
  }
}

export class BoxGeometry extends BufferGeometry {
  constructor(width = 1, height = 1, depth = 1, widthSegments = 1, heightSegments = 1, depthSegments = 1) {
    super();
    const positions = [];
    const normals = [];
    const uvs = [];
    const indices = [];
    const plane = (u, v, w, udir, vdir, pw, ph, pd, gx, gy) => {
      const start = positions.length / 3;
      for (let iy = 0; iy <= gy; iy++) {
        const y = (iy / gy) * ph - ph / 2;
        for (let ix = 0; ix <= gx; ix++) {
          const x = (ix / gx) * pw - pw / 2;
          const p = { x: 0, y: 0, z: 0 };
          p[u] = x * udir;
          p[v] = y * vdir;
          p[w] = pd / 2;
          positions.push(p.x, p.y, p.z);
          const n = { x: 0, y: 0, z: 0 };
          n[w] = pd > 0 ? 1 : -1;
          normals.push(n.x, n.y, n.z);
          uvs.push(ix / gx, 1 - iy / gy);
        }
      }
      gridIndices(gx, gy, start, indices);
    };
    const [w, h, d] = [width, height, depth];
    const [ws, hs, ds] = [widthSegments, heightSegments, depthSegments];
    plane('z', 'y', 'x', -1, -1, d, h, w, ds, hs);
    plane('z', 'y', 'x', 1, -1, d, h, -w, ds, hs);
    plane('x', 'z', 'y', 1, 1, w, d, h, ws, ds);
    plane('x', 'z', 'y', 1, -1, w, d, -h, ws, ds);
    plane('x', 'y', 'z', 1, -1, w, h, d, ws, hs);
    plane('x', 'y', 'z', -1, -1, w, h, -d, ws, hs);
    Object.assign(this, geometryFromArrays({ positions, normals, uvs, indices }));
  }
}

export class CylinderGeometry extends BufferGeometry {
  constructor(radiusTop = 1, radiusBottom = 1, height = 1, radialSegments = 32, heightSegments = 1, openEnded = false, thetaStart = 0, thetaLength = Math.PI * 2) {
    super();
    const positions = [];
    const normals = [];
    const uvs = [];
    const indices = [];
    const half = height / 2;
    const slope = (radiusBottom - radiusTop) / height;
    for (let y = 0; y <= heightSegments; y++) {
      const v = y / heightSegments;
      const radius = v * (radiusBottom - radiusTop) + radiusTop;
      for (let x = 0; x <= radialSegments; x++) {
        const u = x / radialSegments;
        const theta = u * thetaLength + thetaStart;
        const s = Math.sin(theta);
        const c = Math.cos(theta);
        positions.push(radius * s, -v * height + half, radius * c);
        const n = new Vector3(s, slope, c).normalize();
        normals.push(n.x, n.y, n.z);
        uvs.push(u, 1 - v);
      }
    }
    gridIndices(radialSegments, heightSegments, 0, indices);
    if (!openEnded) {
      for (const top of [true, false]) {
        const radius = top ? radiusTop : radiusBottom;
        if (radius <= 0) continue;
        const sign = top ? 1 : -1;
        const centre = positions.length / 3;
        positions.push(0, half * sign, 0);
        normals.push(0, sign, 0);
        uvs.push(0.5, 0.5);
        const ring = positions.length / 3;
        for (let x = 0; x <= radialSegments; x++) {
          const theta = (x / radialSegments) * thetaLength + thetaStart;
          positions.push(radius * Math.sin(theta), half * sign, radius * Math.cos(theta));
          normals.push(0, sign, 0);
          uvs.push(Math.cos(theta) * 0.5 + 0.5, Math.sin(theta) * 0.5 * sign + 0.5);
        }
        for (let x = 0; x < radialSegments; x++) {
          if (top) indices.push(ring + x, ring + x + 1, centre);
          else indices.push(ring + x + 1, ring + x, centre);
        }
      }
    }
    Object.assign(this, geometryFromArrays({ positions, normals, uvs, indices }));
  }
}

export class ConeGeometry extends CylinderGeometry {
  constructor(radius = 1, height = 1, radialSegments = 32, heightSegments = 1, openEnded = false) {
    super(0, radius, height, radialSegments, heightSegments, openEnded);
  }
}

export class SphereGeometry extends BufferGeometry {
  constructor(radius = 1, widthSegments = 32, heightSegments = 16, phiStart = 0, phiLength = Math.PI * 2, thetaStart = 0, thetaLength = Math.PI) {
    super();
    const thetaEnd = Math.min(thetaStart + thetaLength, Math.PI);
    const positions = [];
    const normals = [];
    const uvs = [];
    const indices = [];
    const grid = [];
    let index = 0;
    for (let iy = 0; iy <= heightSegments; iy++) {
      const row = [];
      const v = iy / heightSegments;
      let uOffset = 0;
      if (iy === 0 && thetaStart === 0) uOffset = 0.5 / widthSegments;
      else if (iy === heightSegments && thetaEnd === Math.PI) uOffset = -0.5 / widthSegments;
      for (let ix = 0; ix <= widthSegments; ix++) {
        const u = ix / widthSegments;
        const phi = phiStart + u * phiLength;
        const theta = thetaStart + v * thetaLength;
        const x = -radius * Math.cos(phi) * Math.sin(theta);
        const y = radius * Math.cos(theta);
        const z = radius * Math.sin(phi) * Math.sin(theta);
        positions.push(x, y, z);
        const l = Math.hypot(x, y, z) || 1;
        normals.push(x / l, y / l, z / l);
        uvs.push(u + uOffset, 1 - v);
        row.push(index++);
      }
      grid.push(row);
    }
    for (let iy = 0; iy < heightSegments; iy++) {
      for (let ix = 0; ix < widthSegments; ix++) {
        const a = grid[iy][ix + 1];
        const b = grid[iy][ix];
        const c = grid[iy + 1][ix];
        const d = grid[iy + 1][ix + 1];
        if (iy !== 0 || thetaStart > 0) indices.push(a, b, d);
        if (iy !== heightSegments - 1 || thetaEnd < Math.PI) indices.push(b, c, d);
      }
    }
    Object.assign(this, geometryFromArrays({ positions, normals, uvs, indices }));
  }
}

export class CircleGeometry extends BufferGeometry {
  constructor(radius = 1, segments = 32, thetaStart = 0, thetaLength = Math.PI * 2) {
    super();
    const positions = [0, 0, 0];
    const normals = [0, 0, 1];
    const uvs = [0.5, 0.5];
    const indices = [];
    for (let s = 0; s <= segments; s++) {
      const theta = thetaStart + (s / segments) * thetaLength;
      const x = radius * Math.cos(theta);
      const y = radius * Math.sin(theta);
      positions.push(x, y, 0);
      normals.push(0, 0, 1);
      uvs.push((x / radius + 1) / 2, (y / radius + 1) / 2);
    }
    for (let i = 1; i <= segments; i++) indices.push(i, i + 1, 0);
    Object.assign(this, geometryFromArrays({ positions, normals, uvs, indices }));
  }
}

/** Revolves `points` (Vector2: x = radius, y = height) around the Y axis. */
export class LatheGeometry extends BufferGeometry {
  constructor(points, segments = 12, phiStart = 0, phiLength = Math.PI * 2) {
    super();
    const positions = [];
    const uvs = [];
    const indices = [];
    const n = points.length;
    for (let i = 0; i <= segments; i++) {
      const phi = phiStart + (i / segments) * phiLength;
      const s = Math.sin(phi);
      const c = Math.cos(phi);
      for (let j = 0; j < n; j++) {
        positions.push(points[j].x * s, points[j].y, points[j].x * c);
        uvs.push(i / segments, j / (n - 1));
      }
    }
    for (let i = 0; i < segments; i++) {
      for (let j = 0; j < n - 1; j++) {
        const base = j + i * n;
        const a = base;
        const b = base + n;
        const c = base + n + 1;
        const d = base + 1;
        indices.push(a, b, d, c, d, b);
      }
    }
    Object.assign(this, geometryFromArrays({ positions, uvs, indices }));
    this.computeVertexNormals();
    if (Math.abs(phiLength - Math.PI * 2) < 1e-6) {
      // Close the seam: the first and last columns share positions.
      const nor = this.attributes.normal;
      for (let j = 0; j < n; j++) {
        const a = j;
        const b = segments * n + j;
        const v = new Vector3(nor.getX(a) + nor.getX(b), nor.getY(a) + nor.getY(b), nor.getZ(a) + nor.getZ(b)).normalize();
        nor.setXYZ(a, v.x, v.y, v.z);
        nor.setXYZ(b, v.x, v.y, v.z);
      }
    }
  }
}

/** A capsule along Y: `length` is the straight middle section. */
export class CapsuleGeometry extends LatheGeometry {
  constructor(radius = 1, length = 1, capSegments = 4, radialSegments = 8) {
    const points = [];
    for (let i = 0; i <= capSegments; i++) {
      const a = -Math.PI / 2 + (i / capSegments) * (Math.PI / 2);
      points.push(new Vector2(Math.cos(a) * radius, Math.sin(a) * radius - length / 2));
    }
    for (let i = 0; i <= capSegments; i++) {
      const a = (i / capSegments) * (Math.PI / 2);
      points.push(new Vector2(Math.cos(a) * radius, Math.sin(a) * radius + length / 2));
    }
    super(points, radialSegments);
  }
}

export class TorusGeometry extends BufferGeometry {
  constructor(radius = 1, tube = 0.4, radialSegments = 12, tubularSegments = 48, arc = Math.PI * 2) {
    super();
    const positions = [];
    const normals = [];
    const uvs = [];
    const indices = [];
    for (let j = 0; j <= radialSegments; j++) {
      for (let i = 0; i <= tubularSegments; i++) {
        const u = (i / tubularSegments) * arc;
        const v = (j / radialSegments) * Math.PI * 2;
        const x = (radius + tube * Math.cos(v)) * Math.cos(u);
        const y = (radius + tube * Math.cos(v)) * Math.sin(u);
        const z = tube * Math.sin(v);
        positions.push(x, y, z);
        const n = new Vector3(x - radius * Math.cos(u), y - radius * Math.sin(u), z).normalize();
        normals.push(n.x, n.y, n.z);
        uvs.push(i / tubularSegments, j / radialSegments);
      }
    }
    for (let j = 1; j <= radialSegments; j++) {
      for (let i = 1; i <= tubularSegments; i++) {
        const a = (tubularSegments + 1) * j + i - 1;
        const b = (tubularSegments + 1) * (j - 1) + i - 1;
        const c = (tubularSegments + 1) * (j - 1) + i;
        const d = (tubularSegments + 1) * j + i;
        indices.push(a, b, d, b, c, d);
      }
    }
    Object.assign(this, geometryFromArrays({ positions, normals, uvs, indices }));
  }
}

/** A subdivided icosahedron projected onto a sphere (non-indexed, flat-faced). */
export class IcosahedronGeometry extends BufferGeometry {
  constructor(radius = 1, detail = 0) {
    super();
    const t = (1 + Math.sqrt(5)) / 2;
    const v = [-1, t, 0, 1, t, 0, -1, -t, 0, 1, -t, 0, 0, -1, t, 0, 1, t, 0, -1, -t, 0, 1, -t, t, 0, -1, t, 0, 1, -t, 0, -1, -t, 0, 1];
    const faces = [0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11, 1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8, 3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9, 4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1];
    const vert = (i) => new Vector3(v[i * 3], v[i * 3 + 1], v[i * 3 + 2]);
    const positions = [];
    const push = (p) => {
      const n = p.clone().normalize().multiplyScalar(radius);
      positions.push(n.x, n.y, n.z);
    };
    const cols = detail + 1;
    for (let f = 0; f < faces.length; f += 3) {
      const a = vert(faces[f]);
      const b = vert(faces[f + 1]);
      const c = vert(faces[f + 2]);
      const grid = [];
      for (let i = 0; i <= cols; i++) {
        const aj = a.clone().lerp(c, i / cols);
        const bj = b.clone().lerp(c, i / cols);
        const rows = cols - i;
        grid.push(Array.from({ length: rows + 1 }, (_, j) => (rows === 0 ? aj.clone() : aj.clone().lerp(bj, j / rows))));
      }
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < 2 * (cols - i) - 1; j++) {
          const k = Math.floor(j / 2);
          if (j % 2 === 0) [grid[i][k + 1], grid[i + 1][k], grid[i][k]].forEach(push);
          else [grid[i][k + 1], grid[i + 1][k + 1], grid[i + 1][k]].forEach(push);
        }
      }
    }
    Object.assign(this, geometryFromArrays({ positions }));
    this.computeVertexNormals();
  }
}

// ---- Merging ----------------------------------------------------------------------

/** Concatenates indexed geometries that share the same attribute set. */
export function mergeGeometries(geometries) {
  const names = Object.keys(geometries[0].attributes).filter((name) => geometries.every((g) => g.attributes[name]));
  const merged = new BufferGeometry();
  for (const name of names) {
    const itemSize = geometries[0].attributes[name].itemSize;
    const total = geometries.reduce((n, g) => n + g.attributes[name].array.length, 0);
    const array = new Float32Array(total);
    let offset = 0;
    for (const g of geometries) {
      array.set(g.attributes[name].array, offset);
      offset += g.attributes[name].array.length;
    }
    merged.setAttribute(name, new BufferAttribute(array, itemSize));
  }
  const indices = [];
  let base = 0;
  for (const g of geometries) {
    const count = g.attributes.position.count;
    if (g.index) for (let i = 0; i < g.index.count; i++) indices.push(g.index.getX(i) + base);
    else for (let i = 0; i < count; i++) indices.push(i + base);
    base += count;
  }
  merged.setIndex(indices);
  return merged;
}

/** Welds vertices whose attributes all match (to `tolerance`), producing an indexed geometry. */
export function mergeVertices(geometry, tolerance = 1e-4) {
  const names = Object.keys(geometry.attributes);
  const count = geometry.attributes.position.count;
  const scale = 1 / tolerance;
  const map = new Map();
  const remap = new Uint32Array(count);
  const out = Object.fromEntries(names.map((n) => [n, []]));
  let next = 0;
  for (let i = 0; i < count; i++) {
    let key = '';
    for (const n of names) {
      const a = geometry.attributes[n];
      for (let k = 0; k < a.itemSize; k++) key += `${Math.round(a.array[i * a.itemSize + k] * scale)},`;
    }
    if (map.has(key)) {
      remap[i] = map.get(key);
      continue;
    }
    map.set(key, next);
    remap[i] = next++;
    for (const n of names) {
      const a = geometry.attributes[n];
      for (let k = 0; k < a.itemSize; k++) out[n].push(a.array[i * a.itemSize + k]);
    }
  }
  const result = new BufferGeometry();
  for (const n of names) result.setAttribute(n, new Float32BufferAttribute(out[n], geometry.attributes[n].itemSize));
  const src = geometry.index ? Array.from(geometry.index.array) : Array.from({ length: count }, (_, i) => i);
  result.setIndex(src.map((i) => remap[i]));
  return result;
}
