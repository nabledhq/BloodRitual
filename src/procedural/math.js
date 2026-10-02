/**
 * Small, engine-neutral linear algebra used to author procedural content
 * (geometry, node transforms, colours). Conventions: right-handed, Y up,
 * column-major 4x4 matrices with the translation in elements 12-14 (the
 * same memory layout Babylon.js uses for `Matrix.m`), Euler angles applied
 * in X, then Y, then Z order (intrinsic 'XYZ').
 */

export const MathUtils = Object.freeze({
  clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
  lerp: (a, b, t) => a + (b - a) * t,
  degToRad: (d) => (d * Math.PI) / 180,
});

export class Vector2 {
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }
  set(x, y) {
    this.x = x;
    this.y = y;
    return this;
  }
  copy(v) {
    return this.set(v.x, v.y);
  }
  clone() {
    return new Vector2(this.x, this.y);
  }
}

export class Vector3 {
  constructor(x = 0, y = 0, z = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }
  set(x, y, z) {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }
  setX(x) {
    this.x = x;
    return this;
  }
  setY(y) {
    this.y = y;
    return this;
  }
  setZ(z) {
    this.z = z;
    return this;
  }
  copy(v) {
    return this.set(v.x, v.y, v.z);
  }
  clone() {
    return new Vector3(this.x, this.y, this.z);
  }
  toArray() {
    return [this.x, this.y, this.z];
  }
  add(v) {
    return this.set(this.x + v.x, this.y + v.y, this.z + v.z);
  }
  sub(v) {
    return this.set(this.x - v.x, this.y - v.y, this.z - v.z);
  }
  addVectors(a, b) {
    return this.set(a.x + b.x, a.y + b.y, a.z + b.z);
  }
  subVectors(a, b) {
    return this.set(a.x - b.x, a.y - b.y, a.z - b.z);
  }
  addScaledVector(v, s) {
    return this.set(this.x + v.x * s, this.y + v.y * s, this.z + v.z * s);
  }
  multiplyScalar(s) {
    return this.set(this.x * s, this.y * s, this.z * s);
  }
  negate() {
    return this.multiplyScalar(-1);
  }
  dot(v) {
    return this.x * v.x + this.y * v.y + this.z * v.z;
  }
  lengthSq() {
    return this.dot(this);
  }
  length() {
    return Math.sqrt(this.lengthSq());
  }
  normalize() {
    return this.multiplyScalar(1 / (this.length() || 1));
  }
  distanceTo(v) {
    return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z);
  }
  cross(v) {
    return this.crossVectors(this, v);
  }
  crossVectors(a, b) {
    return this.set(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
  }
  lerp(v, t) {
    return this.set(this.x + (v.x - this.x) * t, this.y + (v.y - this.y) * t, this.z + (v.z - this.z) * t);
  }
  min(v) {
    return this.set(Math.min(this.x, v.x), Math.min(this.y, v.y), Math.min(this.z, v.z));
  }
  max(v) {
    return this.set(Math.max(this.x, v.x), Math.max(this.y, v.y), Math.max(this.z, v.z));
  }
  applyMatrix4(m) {
    const e = m.elements;
    const { x, y, z } = this;
    const w = 1 / (e[3] * x + e[7] * y + e[11] * z + e[15] || 1);
    return this.set((e[0] * x + e[4] * y + e[8] * z + e[12]) * w, (e[1] * x + e[5] * y + e[9] * z + e[13]) * w, (e[2] * x + e[6] * y + e[10] * z + e[14]) * w);
  }
  applyMatrix3(m) {
    const e = m.elements;
    const { x, y, z } = this;
    return this.set(e[0] * x + e[3] * y + e[6] * z, e[1] * x + e[4] * y + e[7] * z, e[2] * x + e[5] * y + e[8] * z);
  }
  applyQuaternion(q) {
    const { x, y, z } = this;
    const tx = 2 * (q.y * z - q.z * y);
    const ty = 2 * (q.z * x - q.x * z);
    const tz = 2 * (q.x * y - q.y * x);
    return this.set(x + q.w * tx + q.y * tz - q.z * ty, y + q.w * ty + q.z * tx - q.x * tz, z + q.w * tz + q.x * ty - q.y * tx);
  }
  applyAxisAngle(axis, angle) {
    return this.applyQuaternion(new Quaternion().setFromAxisAngle(axis, angle));
  }
  setFromMatrixPosition(m) {
    return this.set(m.elements[12], m.elements[13], m.elements[14]);
  }
  fromBufferAttribute(attribute, index) {
    return this.set(attribute.getX(index), attribute.getY(index), attribute.getZ(index));
  }
}

export class Quaternion {
  constructor(x = 0, y = 0, z = 0, w = 1) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;
  }
  set(x, y, z, w) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;
    return this;
  }
  copy(q) {
    return this.set(q.x, q.y, q.z, q.w);
  }
  clone() {
    return new Quaternion(this.x, this.y, this.z, this.w);
  }
  setFromEuler(euler) {
    const c1 = Math.cos(euler.x / 2);
    const c2 = Math.cos(euler.y / 2);
    const c3 = Math.cos(euler.z / 2);
    const s1 = Math.sin(euler.x / 2);
    const s2 = Math.sin(euler.y / 2);
    const s3 = Math.sin(euler.z / 2);
    // Intrinsic X, then Y, then Z.
    return this.set(
      s1 * c2 * c3 + c1 * s2 * s3,
      c1 * s2 * c3 - s1 * c2 * s3,
      c1 * c2 * s3 + s1 * s2 * c3,
      c1 * c2 * c3 - s1 * s2 * s3,
    );
  }
  setFromAxisAngle(axis, angle) {
    const s = Math.sin(angle / 2);
    return this.set(axis.x * s, axis.y * s, axis.z * s, Math.cos(angle / 2));
  }
  setFromUnitVectors(from, to) {
    let r = from.dot(to) + 1;
    let x;
    let y;
    let z;
    if (r < 1e-8) {
      r = 0;
      if (Math.abs(from.x) > Math.abs(from.z)) [x, y, z] = [-from.y, from.x, 0];
      else [x, y, z] = [0, -from.z, from.y];
    } else {
      x = from.y * to.z - from.z * to.y;
      y = from.z * to.x - from.x * to.z;
      z = from.x * to.y - from.y * to.x;
    }
    const l = Math.hypot(x, y, z, r) || 1;
    return this.set(x / l, y / l, z / l, r / l);
  }
  multiply(q) {
    return this.multiplyQuaternions(this, q);
  }
  multiplyQuaternions(a, b) {
    return this.set(
      a.x * b.w + a.w * b.x + a.y * b.z - a.z * b.y,
      a.y * b.w + a.w * b.y + a.z * b.x - a.x * b.z,
      a.z * b.w + a.w * b.z + a.x * b.y - a.y * b.x,
      a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    );
  }
}

export class Euler {
  constructor(x = 0, y = 0, z = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.order = 'XYZ';
  }
  set(x, y, z) {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }
  copy(e) {
    return this.set(e.x, e.y, e.z);
  }
  clone() {
    return new Euler(this.x, this.y, this.z);
  }
}

export class Matrix3 {
  constructor() {
    this.elements = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  }
  /** Inverse transpose of the upper 3x3 of `m` (transforms normals). */
  getNormalMatrix(m) {
    const e = m.elements;
    const [a, b, c, d, f, g, h, i, j] = [e[0], e[4], e[8], e[1], e[5], e[9], e[2], e[6], e[10]];
    const A = f * j - g * i;
    const B = g * h - d * j;
    const C = d * i - f * h;
    const det = a * A + b * B + c * C || 1;
    const inv = 1 / det;
    // Inverse (row-major) then transposed, stored column-major.
    const r = [
      A, c * i - b * j, b * g - c * f,
      B, a * j - c * h, c * d - a * g,
      C, b * h - a * i, a * f - b * d,
    ].map((v) => v * inv);
    // `r` is the inverse in row-major order, which is its transpose in column-major order.
    this.elements = r;
    return this;
  }
}

export class Matrix4 {
  constructor() {
    this.elements = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  }
  identity() {
    this.elements = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    return this;
  }
  copy(m) {
    this.elements = m.elements.slice();
    return this;
  }
  clone() {
    return new Matrix4().copy(this);
  }
  makeTranslation(x, y, z) {
    this.identity();
    this.elements[12] = x;
    this.elements[13] = y;
    this.elements[14] = z;
    return this;
  }
  makeScale(x, y, z) {
    this.identity();
    this.elements[0] = x;
    this.elements[5] = y;
    this.elements[10] = z;
    return this;
  }
  makeRotationX(a) {
    const c = Math.cos(a);
    const s = Math.sin(a);
    this.elements = [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1];
    return this;
  }
  makeRotationY(a) {
    const c = Math.cos(a);
    const s = Math.sin(a);
    this.elements = [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1];
    return this;
  }
  makeRotationZ(a) {
    const c = Math.cos(a);
    const s = Math.sin(a);
    this.elements = [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    return this;
  }
  multiply(m) {
    return this.multiplyMatrices(this, m);
  }
  premultiply(m) {
    return this.multiplyMatrices(m, this);
  }
  multiplyMatrices(a, b) {
    const ae = a.elements;
    const be = b.elements;
    const out = new Array(16);
    for (let c = 0; c < 4; c++) {
      for (let r = 0; r < 4; r++) {
        out[c * 4 + r] = ae[r] * be[c * 4] + ae[4 + r] * be[c * 4 + 1] + ae[8 + r] * be[c * 4 + 2] + ae[12 + r] * be[c * 4 + 3];
      }
    }
    this.elements = out;
    return this;
  }
  compose(position, q, scale) {
    const { x, y, z, w } = q;
    const x2 = x + x;
    const y2 = y + y;
    const z2 = z + z;
    const xx = x * x2;
    const xy = x * y2;
    const xz = x * z2;
    const yy = y * y2;
    const yz = y * z2;
    const zz = z * z2;
    const wx = w * x2;
    const wy = w * y2;
    const wz = w * z2;
    const { x: sx, y: sy, z: sz } = scale;
    this.elements = [
      (1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
      (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
      (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0,
      position.x, position.y, position.z, 1,
    ];
    return this;
  }
  /** Splits an affine matrix into position, rotation and (positive or mirrored) scale. */
  decompose(position, quaternion, scale) {
    const e = this.elements;
    let sx = Math.hypot(e[0], e[1], e[2]);
    const sy = Math.hypot(e[4], e[5], e[6]);
    const sz = Math.hypot(e[8], e[9], e[10]);
    if (this.determinant() < 0) sx = -sx;
    position.set(e[12], e[13], e[14]);
    const m = [e[0] / sx, e[1] / sx, e[2] / sx, e[4] / sy, e[5] / sy, e[6] / sy, e[8] / sz, e[9] / sz, e[10] / sz];
    const [m11, m21, m31, m12, m22, m32, m13, m23, m33] = m;
    const trace = m11 + m22 + m33;
    if (trace > 0) {
      const s = 0.5 / Math.sqrt(trace + 1);
      quaternion.set((m32 - m23) * s, (m13 - m31) * s, (m21 - m12) * s, 0.25 / s);
    } else if (m11 > m22 && m11 > m33) {
      const s = 2 * Math.sqrt(1 + m11 - m22 - m33);
      quaternion.set(0.25 * s, (m12 + m21) / s, (m13 + m31) / s, (m32 - m23) / s);
    } else if (m22 > m33) {
      const s = 2 * Math.sqrt(1 + m22 - m11 - m33);
      quaternion.set((m12 + m21) / s, 0.25 * s, (m23 + m32) / s, (m13 - m31) / s);
    } else {
      const s = 2 * Math.sqrt(1 + m33 - m11 - m22);
      quaternion.set((m13 + m31) / s, (m23 + m32) / s, 0.25 * s, (m21 - m12) / s);
    }
    scale.set(sx, sy, sz);
    return this;
  }
  determinant() {
    const e = this.elements;
    return e[0] * (e[5] * e[10] - e[9] * e[6]) - e[4] * (e[1] * e[10] - e[9] * e[2]) + e[8] * (e[1] * e[6] - e[5] * e[2]);
  }
}

// ---- Colour ---------------------------------------------------------------------

export const SRGBColorSpace = 'srgb';
export const LinearSRGBColorSpace = 'srgb-linear';
export const NoColorSpace = '';

export const srgbToLinear = (c) => (c < 0.04045 ? c * 0.0773993808 : Math.pow(c * 0.9478672986 + 0.0521327014, 2.4));
export const linearToSrgb = (c) => (c < 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 0.41666) - 0.055);

function hue2rgb(p, q, t) {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * 6 * (2 / 3 - t);
  return p;
}

/**
 * An RGB colour stored in linear space. Hex values (and `SRGBColorSpace`
 * arguments) are treated as sRGB and converted, so `new Color(0x808080)` is
 * the same mid-grey a designer picked.
 */
export class Color {
  constructor(r, g, b) {
    this.isColor = true;
    this.r = 1;
    this.g = 1;
    this.b = 1;
    if (g === undefined && r !== undefined) this.set(r);
    else if (r !== undefined) this.setRGB(r, g, b);
  }
  set(value) {
    if (value && value.isColor) return this.copy(value);
    return this.setHex(value);
  }
  setHex(hex) {
    hex = Math.floor(hex);
    return this.setRGB(((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255, SRGBColorSpace);
  }
  setRGB(r, g, b, colorSpace = LinearSRGBColorSpace) {
    if (colorSpace === SRGBColorSpace) [r, g, b] = [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)];
    this.r = r;
    this.g = g;
    this.b = b;
    return this;
  }
  setHSL(h, s, l, colorSpace = LinearSRGBColorSpace) {
    h = ((h % 1) + 1) % 1;
    s = MathUtils.clamp(s, 0, 1);
    l = MathUtils.clamp(l, 0, 1);
    if (s === 0) return this.setRGB(l, l, l, colorSpace);
    const p = l <= 0.5 ? l * (1 + s) : l + s - l * s;
    const q = 2 * l - p;
    return this.setRGB(hue2rgb(q, p, h + 1 / 3), hue2rgb(q, p, h), hue2rgb(q, p, h - 1 / 3), colorSpace);
  }
  getHSL(target, colorSpace = LinearSRGBColorSpace) {
    const [r, g, b] = colorSpace === SRGBColorSpace ? [linearToSrgb(this.r), linearToSrgb(this.g), linearToSrgb(this.b)] : [this.r, this.g, this.b];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (min + max) / 2;
    let h = 0;
    let s = 0;
    if (min !== max) {
      const d = max - min;
      s = l <= 0.5 ? d / (max + min) : d / (2 - max - min);
      if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h /= 6;
    }
    target.h = h;
    target.s = s;
    target.l = l;
    return target;
  }
  getHex(colorSpace = SRGBColorSpace) {
    const k = colorSpace === SRGBColorSpace ? linearToSrgb : (c) => c;
    const ch = (c) => Math.round(MathUtils.clamp(k(c), 0, 1) * 255);
    return (ch(this.r) << 16) | (ch(this.g) << 8) | ch(this.b);
  }
  copy(c) {
    this.r = c.r;
    this.g = c.g;
    this.b = c.b;
    return this;
  }
  clone() {
    return new Color().copy(this);
  }
  add(c) {
    this.r += c.r;
    this.g += c.g;
    this.b += c.b;
    return this;
  }
  multiplyScalar(s) {
    this.r *= s;
    this.g *= s;
    this.b *= s;
    return this;
  }
  lerp(c, t) {
    this.r += (c.r - this.r) * t;
    this.g += (c.g - this.g) * t;
    this.b += (c.b - this.b) * t;
    return this;
  }
}
