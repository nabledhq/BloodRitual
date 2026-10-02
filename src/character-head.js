import { BufferGeometry, CircleGeometry, Float32BufferAttribute, MathUtils, SphereGeometry, TorusGeometry, Vector3, mergeGeometries } from './procedural/index.js';
import { valueNoise, smoothstep, lerp } from './noise.js';
import { prepare, smoothSeams, colorAttribute, strip } from './character-geometry.js';

/**
 * Head geometry for procedural people: the sculpted parametric head, ears,
 * eyes, strand-card hair and eyebrows. Head-space units: the anatomical
 * head is 1 unit tall (chin at y = 0, crown at y = 1), centred on x = 0 with
 * the face towards +Z. Callers scale by the head height in metres.
 */

const TAU = Math.PI * 2;

// ---- Head -------------------------------------------------------------------

const gauss = (dx, dy, sx, sy) => Math.exp(-((dx / sx) ** 2) - (dy / sy) ** 2);

/**
 * Builds the sculpting function for a face. `face` is the face parameter
 * block from character-params.js. Returns helpers in head units.
 */
export function createHeadSculpt(face) {
  const a = face.asymmetry;
  const W = 0.72 * face.width;
  const D = 0.9;
  const chinW = 0.82 + 0.12 * face.jaw;
  const exBase = 0.135 + 0.03 * (face.eyeSpacing - 0.5);
  const eyBase = 0.53 + 0.02 * face.eyeHeight;
  const noseLen = 0.2 + 0.05 * (face.noseLength - 0.5);
  const noseTop = eyBase + 0.025;
  const tipY = noseTop - noseLen;
  const mouthY = tipY - 0.075;
  const mouthW = 0.1 + 0.025 * (face.mouthWidth - 0.5);
  const seed = face.noiseSeed;

  const eyeY = (s) => eyBase + s * a.eye * 0.5;
  const eyeX = exBase;

  /** Displaces a point of a radius-0.5 sphere into the sculpted head. */
  function sculpt(x, y, z) {
    const ny = y + 0.5;
    const taper = lerp(chinW, 1, smoothstep(0.08, 0.45, ny)) * (1 - 0.06 * smoothstep(0.75, 1, ny));
    let X = x * W * taper;
    let Z = z * D;
    if (z > 0) {
      // Flatter face plane, and a lower face that comes forward to the chin.
      Z = D * 0.5 * Math.pow(z / 0.5, 0.78);
      Z += 0.12 * Math.exp(-(((ny - 0.06) / 0.11) ** 2)) * smoothstep(0.0, 0.25, z);
    } else {
      // Rounded occiput above, narrowing into the nape below.
      Z *= (1 + 0.08 * smoothstep(0.45, 0.8, ny)) * lerp(0.55, 1, smoothstep(0.05, 0.5, ny));
    }
    const s = X >= 0 ? 1 : -1;
    const ax = Math.abs(X);
    const f = smoothstep(0.12, 0.4, Z);
    const ey = eyeY(s);

    // Eye sockets, brow ridge, cheekbones and the hollow below them.
    Z -= f * 0.04 * (0.5 + 0.5 * face.socket) * gauss(ax - eyeX, ny - ey, 0.08, 0.05);
    Z += f * 0.04 * (0.45 + face.brow) * gauss(ax - eyeX * 0.95, ny - (ey + 0.075 + s * a.brow), 0.13, 0.032);
    const cheek = face.cheek * (1 + s * a.cheek);
    const gc = gauss(ax - 0.25, ny - (ey - 0.11), 0.08, 0.065);
    X += s * 0.03 * cheek * gc;
    Z += f * 0.02 * cheek * gc;
    Z -= f * 0.012 * gauss(ax - 0.22, ny - (ey - 0.25), 0.06, 0.05);

    // Nose: bridge to tip, wider at the base, alae either side.
    const t = (noseTop - ny) / noseLen;
    if (t > -0.3 && t < 1.3) {
      const xn = X - a.nose * 0.03 * Math.max(t, 0);
      const ramp = t < 0 ? smoothstep(-0.3, 0, t) : 1;
      const proj = (0.018 * (0.5 + face.noseBridge) + 0.068 * Math.pow(Math.max(t, 0), 1.6)) * ramp * (1 - smoothstep(0.98, 1.18, t));
      const width = 0.02 + 0.024 * Math.max(t, 0) * (0.6 + 0.6 * face.noseWidth);
      Z += f * proj * Math.exp(-((xn / width) ** 2));
    }
    const alaX = 0.05 * (0.75 + 0.5 * face.noseWidth);
    const ga = gauss(ax - alaX, ny - (tipY + 0.02), 0.024, 0.022);
    Z += f * 0.03 * ga;
    X += s * 0.006 * ga;

    // Lips, the line between them and the mouth corners.
    const my = mouthY + a.mouth * 0.03 * X;
    const wx = 1 - smoothstep(mouthW * 0.55, mouthW, ax);
    const lips = 0.5 + face.lips;
    Z += f * 0.024 * lips * wx * gauss(0, ny - (my + 0.014), 1, 0.013);
    Z += f * 0.027 * lips * wx * gauss(0, ny - (my - 0.021), 1, 0.016);
    Z -= f * 0.012 * wx * gauss(0, ny - my, 1, 0.005);
    Z -= f * 0.01 * gauss(ax - mouthW, ny - my, 0.016, 0.014);
    // Philtrum groove.
    Z -= f * 0.004 * gauss(X, ny - (tipY - 0.035), 0.012, 0.025);

    // Chin and jaw angle.
    Z += f * 0.028 * (0.5 + face.chin) * gauss(X, ny - 0.075, 0.075, 0.05);
    Z -= f * 0.007 * gauss(X, ny - 0.15, 0.06, 0.012);
    X += s * 0.04 * face.jaw * (1 + s * a.jaw) * gauss(ax - 0.28, ny - 0.2, 0.08, 0.08) * (1 - 0.5 * f);

    // Fine individual irregularity.
    const n = valueNoise(x * 9 + 3, y * 9 + z * 5, 0, seed) - 0.5;
    const k = 1 + 0.012 * n;
    return [X * k, ny, Z * k];
  }

  /** Sphere-space direction for an approximate target on the face. */
  function surfaceAt(X, ny, front = 1) {
    const x = MathUtils.clamp(X / W, -0.49, 0.49);
    const y = ny - 0.5;
    const z = front * Math.sqrt(Math.max(0.0001, 0.25 - x * x - y * y));
    return sculpt(x, y, z);
  }

  return { sculpt, surfaceAt, W, D, eyeX, eyeY, tipY, mouthY, mouthW, noseTop };
}

/** The sculpted head mesh (head units) with skin-tone variation in vertex colours. */
export function headGeometry(sculptor, face, redness) {
  const geometry = new SphereGeometry(0.5, 44, 34, -Math.PI / 2);
  const pos = geometry.attributes.position;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    const [X, Y, Z] = sculptor.sculpt(pos.getX(i), pos.getY(i), pos.getZ(i));
    pos.setXYZ(i, X, Y, Z);
    minY = Math.min(minY, Y);
    maxY = Math.max(maxY, Y);
  }
  // Exactly one unit from chin to crown.
  geometry.translate(0, -minY, 0);
  geometry.scale(1, 1 / (maxY - minY), 1);
  geometry.computeVertexNormals();
  smoothSeams(geometry);

  const { eyeX, eyeY, mouthY, mouthW, tipY } = sculptor;
  colorAttribute(geometry, (p) => {
    const s = p.x >= 0 ? 1 : -1;
    const ax = Math.abs(p.x);
    const front = smoothstep(0.15, 0.4, p.z);
    const cheek = gauss(ax - 0.2, p.y - (eyeY(s) - 0.15), 0.08, 0.07) * front * redness;
    const lip = (1 - smoothstep(mouthW * 0.5, mouthW * 1.05, ax)) * gauss(0, p.y - mouthY, 1, 0.032) * front;
    const under = gauss(ax - eyeX, p.y - (eyeY(s) - 0.05), 0.06, 0.03) * front;
    const nose = gauss(p.x, p.y - tipY, 0.04, 0.04) * front * redness;
    let r = 1 + 0.07 * cheek + 0.04 * nose;
    let g = 1 - 0.03 * cheek - 0.01 * nose;
    let b = 1 - 0.05 * cheek - 0.02 * nose;
    r = lerp(r, 0.64, lip);
    g = lerp(g, 0.4, lip);
    b = lerp(b, 0.38, lip);
    // Baked occlusion: mouth line, nostrils, eye corners and under the jaw.
    const line = (1 - smoothstep(mouthW * 0.5, mouthW, ax)) * gauss(0, p.y - mouthY, 1, 0.006) * front;
    const nostril = gauss(ax - 0.035, p.y - (tipY + 0.005), 0.015, 0.01) * front;
    const corner = gauss(ax - (eyeX - 0.06), p.y - eyeY(s), 0.02, 0.03) * front;
    const jaw = (1 - smoothstep(0.02, 0.14, p.y)) * (1 - smoothstep(0.25, 0.4, p.z));
    const shade = (1 - 0.12 * under) * (1 - 0.6 * line) * (1 - 0.35 * nostril) * (1 - 0.2 * corner) * (1 - 0.3 * jaw);
    return [r * shade, g * shade, b * shade];
  });
  return geometry;
}

/** One ear (head units) for side -1 / +1, attached to the side of the head. */
export function earGeometry(side, size) {
  const h = 0.27 * (0.88 + 0.3 * size);
  const parts = [];
  const concha = new SphereGeometry(1, 10, 8);
  concha.scale(0.035, h * 0.5, h * 0.32);
  parts.push(concha);
  const helix = new TorusGeometry(h * 0.33, 0.016, 5, 14, Math.PI * 1.55);
  helix.rotateZ(-Math.PI * 0.32);
  helix.scale(1, 1.45, 1);
  helix.rotateY(Math.PI / 2);
  helix.translate(0.012, 0.01, -0.01);
  parts.push(helix);
  const lobe = new SphereGeometry(h * 0.13, 8, 6);
  lobe.scale(0.45, 1, 0.9);
  lobe.translate(0.004, -h * 0.4, 0.005);
  parts.push(lobe);
  const ear = mergeGeometries(parts.map((g) => prepare(g)), false);
  // Tilt back and stand slightly away from the head.
  ear.rotateX(-0.25);
  ear.rotateY(side * 0.3);
  if (side < 0) ear.scale(-1, 1, 1);
  return ear;
}

/**
 * An eye (head units, centred on the eyeball): sclera with a front
 * opening, flat textured iris and a glossy cornea dome, plus skin eyelids
 * and an eyelash card. Returns geometries per material key.
 */
export function eyeGeometries(r, lidOpen, irisColor) {
  const sclera = new SphereGeometry(r, 12, 7, 0, TAU, 0.5, Math.PI - 0.5);
  sclera.rotateX(Math.PI / 2);
  const ri = r * Math.sin(0.5);
  const iris = new CircleGeometry(ri, 20);
  iris.translate(0, 0, r * Math.cos(0.5) + 0.0005);
  colorAttribute(iris, () => [irisColor.r, irisColor.g, irisColor.b]);
  const cornea = new SphereGeometry(r * 1.01, 12, 3, 0, TAU, 0, 0.62);
  cornea.rotateX(Math.PI / 2);
  cornea.scale(1, 1, 1.05);

  // Eyelids: shells around the eyeball, open by `lidOpen`.
  const open = lerp(1.22, 1.45, lidOpen);
  const upper = new SphereGeometry(r * 1.1, 14, 6, -0.25, Math.PI + 0.5, 0, open);
  const lower = new SphereGeometry(r * 1.07, 14, 3, -0.2, Math.PI + 0.4, Math.PI - 0.95, 0.95);
  upper.rotateX(0.12);

  // Lash card along the upper lid margin, angled out and up.
  const positions = [];
  const uvs = [];
  const indices = [];
  const steps = 10;
  for (let i = 0; i <= steps; i++) {
    const phi = 0.35 + ((Math.PI - 0.7) * i) / steps;
    const dir = new Vector3(-Math.cos(phi) * Math.sin(open), Math.cos(open), Math.sin(phi) * Math.sin(open));
    dir.applyAxisAngle(new Vector3(1, 0, 0), 0.12);
    const base = dir.clone().multiplyScalar(r * 1.1);
    const tip = base.clone().add(dir.clone().multiplyScalar(r * 0.18)).add(new Vector3(0, r * 0.22, 0));
    const len = Math.sin((i / steps) * Math.PI) * 0.6 + 0.4;
    tip.lerp(base, 1 - len);
    positions.push(base.x, base.y, base.z, tip.x, tip.y, tip.z);
    uvs.push(i / steps, 1, i / steps, 0.15);
    if (i < steps) {
      const k = i * 2;
      indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  const lashes = new BufferGeometry();
  lashes.setAttribute('position', new Float32BufferAttribute(positions, 3));
  lashes.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  lashes.setIndex(indices);
  lashes.computeVertexNormals();
  return { sclera, iris, cornea, lids: [upper, lower], lashes };
}

// ---- Hair -------------------------------------------------------------------

/** Height of the hairline (head units) around the head; `a` = 0 front, ±π back. */
export function hairlineHeight(a, style) {
  const aa = Math.abs(a);
  const back = style === 'short' || style === 'cropped' ? 0.3 : 0.26;
  if (aa < Math.PI / 2) return lerp(0.8, 0.6, Math.pow(aa / (Math.PI / 2), 1.6));
  return lerp(0.6, back, (aa - Math.PI / 2) / (Math.PI / 2));
}

/**
 * Hair as textured, layered geometry: a scalp layer copied from the head
 * surface (offset outwards) whose UVs run strand-wise towards `pole`, plus
 * alpha-tested strand cards. Head units.
 */
export function hairGeometries(headGeom, sculptor, hair, rng) {
  const style = hair.style;
  const pole = new Vector3(0, style === 'bun' ? 0.35 : -0.55, -1).normalize();
  const centre = new Vector3(0, 0.55, 0);
  const pos = headGeom.attributes.position;
  const nor = headGeom.attributes.normal;
  const index = headGeom.index;
  const inside = [];
  const p = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    const a = Math.atan2(p.x, p.z);
    inside.push(p.y > hairlineHeight(a, style) + (Math.abs(p.x) > 0.25 && p.y < 0.62 && Math.abs(a) < 2.3 ? 0.08 : 0));
  }
  const positions = [];
  const uvs = [];
  const basis = new Vector3(1, 0, 0);
  const lift = 0.014;
  const d = new Vector3();
  const tmp = new Vector3();
  const uOf = (dir) => {
    tmp.copy(dir).addScaledVector(pole, -dir.dot(pole));
    const binormal = new Vector3().crossVectors(pole, basis);
    return (Math.atan2(tmp.dot(binormal), tmp.dot(basis)) / TAU) * 12;
  };
  for (let f = 0; f < index.count; f += 3) {
    const ids = [index.getX(f), index.getX(f + 1), index.getX(f + 2)];
    if (!ids.some((i) => inside[i])) continue;
    if (!ids.every((i) => inside[i]) && ids.filter((i) => inside[i]).length < 2) continue;
    const tri = ids.map((i) => {
      p.fromBufferAttribute(pos, i);
      d.copy(p).sub(centre).normalize();
      const along = Math.acos(MathUtils.clamp(-d.dot(pole), -1, 1)) / Math.PI;
      const a = Math.atan2(p.x, p.z);
      const fromLine = p.y - hairlineHeight(a, style);
      // Vertices just outside the hairline get the transparent strand tips, softening the edge.
      const v = MathUtils.clamp(0.32 + fromLine * 10 + along * 0.2, 0.02, 0.99);
      const q = p.clone().addScaledVector(new Vector3().fromBufferAttribute(nor, i), lift);
      return { q, u: uOf(d), v };
    });
    // Keep the strand-wise U continuous across the wrap-around.
    const maxU = Math.max(...tri.map((t) => t.u));
    for (const t of tri) if (maxU - t.u > 6) t.u += 12;
    for (const t of tri) {
      positions.push(t.q.x, t.q.y, t.q.z);
      uvs.push(t.u, t.v);
    }
  }
  const cap = new BufferGeometry();
  cap.setAttribute('position', new Float32BufferAttribute(positions, 3));
  cap.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  cap.computeVertexNormals();
  smoothSeams(cap);
  const result = [cap];

  // Strand cards lying over the scalp and flowing towards the pole.
  const { sculpt } = sculptor;
  const normalAt = (dir) => {
    const e = 0.01;
    const a0 = new Vector3(...sculpt(dir.x * 0.5, dir.y * 0.5, dir.z * 0.5));
    const t1 = new Vector3().crossVectors(dir, new Vector3(0, 1, 0.001)).normalize();
    const t2 = new Vector3().crossVectors(dir, t1).normalize();
    const b = new Vector3(...sculpt(...dir.clone().addScaledVector(t1, e).normalize().multiplyScalar(0.5).toArray()));
    const c = new Vector3(...sculpt(...dir.clone().addScaledVector(t2, e).normalize().multiplyScalar(0.5).toArray()));
    const n = new Vector3().crossVectors(b.sub(a0), c.sub(a0)).normalize();
    if (n.dot(dir) < 0) n.negate();
    return { point: a0, normal: n };
  };
  const cardCount = style === 'bun' ? 30 : style === 'long' ? 34 : 18;
  const cardLength = style === 'cropped' ? 0.5 : style === 'short' ? 0.75 : 1;
  for (let c = 0; c < Math.round(cardCount * hair.density); c++) {
    // Root on the hairline ring, spread around the head.
    const a = (c / cardCount) * TAU - Math.PI + (rng() - 0.5) * 0.3;
    const rootY = hairlineHeight(a, style) + 0.03 + rng() * 0.05;
    const start = new Vector3(Math.sin(a) * 0.45, (rootY - 0.5) * 2, Math.cos(a) * 0.9).normalize();
    // Hair is pulled back smoothly from the face: no cards across the front.
    if (Math.abs(a) < 0.9 || (style !== 'long' && start.dot(pole) > 0.7)) continue;
    const end = style === 'long' ? new Vector3(Math.sin(a) * 0.35, -0.6, -0.75).normalize() : pole.clone();
    const steps = 7;
    const points = [];
    const sides = [];
    const layer = 0.02 + rng() * 0.012;
    let last = null;
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * cardLength;
      const dir = start.clone().lerp(end, t).normalize();
      const { point, normal } = normalAt(dir);
      point.addScaledVector(normal, layer + 0.01 * Math.sin(t * Math.PI));
      points.push(point);
      if (last) {
        const along = point.clone().sub(last).normalize();
        sides.push(new Vector3().crossVectors(along, normal).normalize());
      }
      last = point;
    }
    // Loose long hair continues down the back.
    if (style === 'long') {
      const n = new Vector3(Math.sin(a) * 0.3, 0, -1).normalize();
      for (let i = 1; i <= 4; i++) {
        points.push(last.clone().add(new Vector3(Math.sin(a) * 0.02 * i, -0.17 * i, -0.015 * i)));
        sides.push(new Vector3().crossVectors(new Vector3(0, -1, 0), n).normalize());
      }
    }
    sides.unshift(sides[0]);
    const width = 0.11 + rng() * 0.05;
    result.push(strip(points, sides, (t) => width * (1 - 0.35 * t), { vStart: 0.02, vEnd: 0.98, uRepeat: 0.6 + rng() * 0.3 }));
  }

  if (style === 'bun') {
    const bun = new SphereGeometry(0.15, 14, 10);
    bun.scale(1.15, 0.95, 0.85);
    const uv = bun.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 4, 0.6 + 0.39 * uv.getY(i));
    const { point } = normalAt(pole.clone());
    bun.translate(point.x, point.y + 0.02, point.z - 0.06);
    result.push(bun);
  }
  return result;
}

/** Eyebrow card following the brow ridge (head units). */
export function browGeometry(sculptor, side, thickness) {
  const points = [];
  const sides = [];
  const ey = sculptor.eyeY(side);
  const steps = 8;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const X = side * (sculptor.eyeX - 0.06 + t * 0.15);
    const ny = ey + 0.07 + 0.016 * Math.sin(t * Math.PI * 0.9) - 0.012 * t;
    const [x, y, z] = sculptor.surfaceAt(X, ny);
    points.push(new Vector3(x, y, z + 0.006));
  }
  for (let i = 0; i <= steps; i++) {
    const a = points[Math.max(0, i - 1)];
    const b = points[Math.min(steps, i + 1)];
    const along = b.clone().sub(a).normalize();
    sides.push(new Vector3().crossVectors(along, new Vector3(0, 0, 1)).normalize().multiplyScalar(side));
  }
  return strip(points, sides, (t) => thickness * (1.1 - 0.7 * t), { vStart: 0.12, vEnd: 0.5, uRepeat: 0.35 });
}
