import * as THREE from 'three';
import { generateCharacterParams } from './character-params.js';
import {
  characterSkinMaterial,
  hairMaterial,
  scleraMaterial,
  irisMaterial,
  corneaMaterial,
  cottonMaterial,
  woolMaterial,
  leatherMaterial,
  beadMaterial,
} from './character-materials.js';
import {
  PartBuilder,
  createHeadSculpt,
  headGeometry,
  earGeometry,
  eyeGeometries,
  hairGeometries,
  browGeometry,
  handGeometry,
  footGeometry,
  limbGeometry,
  profileFn,
  garmentSurface,
  garmentBand,
  patchworkBand,
} from './character-geometry.js';
import { createRng } from './rng.js';

/**
 * Realistic, procedurally built Seminole people of around 1900.
 *
 * `createCharacter(params)` turns the seeded parameters from
 * character-params.js into a jointed figure:
 *
 *   character
 *   └ body (pelvis: weight shift and bob)
 *     ├ leftLeg / rightLeg (hip) → leftKnee / rightKnee → leftFoot / rightFoot
 *     └ torso (waist: stoop, twist)
 *       ├ garments (shirt, cape, skirt, sash, beads: breathing)
 *       ├ leftArm / rightArm (shoulder) → leftElbow / rightElbow → leftHand / rightHand
 *       └ head (neck) → skull (face, eyes, hair) → headwear (turban)
 *
 * Pieces of each segment are merged into one mesh per material, so a whole
 * character costs roughly 25 draw calls.
 */

export const PLAYER_SEED = 1900;
/** The player: a man of about thirty in a big shirt and turban. */
export const PLAYER_PARAMS = generateCharacterParams(PLAYER_SEED, 'man', { age: 30, height: 1.72 });
/** Standing height of the player including the turban, in metres. */
export const CHARACTER_HEIGHT = 1.82;

const TAU = Math.PI * 2;

/** Every length the body is built from, in metres, derived from the parameters. */
export function bodyDimensions(params) {
  const { body, sex, age } = params;
  const female = sex === 'female';
  const H = body.height;
  const hh = body.headHeight;
  const ankleY = 0.045 * H;
  const hipY = body.legRatio * H;
  const kneeY = ankleY + (hipY - ankleY) * 0.48;
  const chinY = H - hh;
  const neck = body.neckLength * hh;
  const shoulderY = chinY - neck;
  const waistY = hipY + 0.035 * H;
  const shoulderHalf = (body.shoulderWidth * H) / 2;
  const armLength = (body.armSpanRatio * H - 2 * shoulderHalf) / 2;
  const chestR = shoulderHalf * 0.94 * (1 + body.build * 0.05);
  return {
    H,
    headHeight: hh,
    ankleY,
    hipY,
    kneeY,
    chinY,
    neck,
    shoulderY,
    waistY,
    torso: shoulderY - waistY,
    shoulderHalf,
    hipHalf: (body.hipWidth * H) / 2,
    armLength,
    upperArm: armLength * 0.4,
    forearm: armLength * 0.345,
    hand: armLength * 0.255,
    thigh: hipY - kneeY,
    shin: kneeY - ankleY,
    chestR,
    waistR: chestR * (female ? 0.84 : 0.92) * (1 + body.build * 0.14),
    neckR: hh * (female ? 0.23 : 0.27),
    footLength: 0.152 * H,
    footWidth: (age < 12 ? 0.06 : 0.055) * H,
    limb: (k) => k * H * (1 + body.build * 0.1),
  };
}

function nameFor(side, part) {
  return `${side < 0 ? 'left' : 'right'}${part}`;
}

function group(name, parent, x = 0, y = 0, z = 0) {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(x, y, z);
  parent?.add(g);
  return g;
}

function bandSteps(y0, y1, H) {
  return Math.max(2, Math.round(Math.abs(y1 - y0) / (0.045 * H)));
}

/**
 * Adds a garment made of horizontal pieces (bottom to top) to `parts`.
 * Each piece is `{ y0, y1, color }` (a plain band) or
 * `{ y0, y1, patchwork }` (a row of simple patchwork).
 */
function addGarment(parts, material, surface, pieces, H, label, segments = 44) {
  for (const piece of pieces) {
    if (piece.y1 <= piece.y0) continue;
    if (piece.patchwork) {
      const { colors, pattern, blocks } = piece.patchwork;
      parts.add(material, patchworkBand(surface, piece.y0, piece.y1, { blocks, colors, pattern }), { label });
    } else {
      parts.add(material, garmentBand(surface, piece.y0, piece.y1, { steps: bandSteps(piece.y0, piece.y1, H), segments, uRepeat: 1 }), {
        color: piece.color,
        label,
      });
    }
  }
}

// ---- Head ---------------------------------------------------------------------

function buildHead(params, dims, mats, torso) {
  const hh = dims.headHeight;
  const head = group('head', torso, 0, dims.torso, 0);
  head.userData.baseY = dims.torso;
  const neckParts = new PartBuilder();
  const neck = limbGeometry(dims.neckR, dims.neckR * 1.08, dims.neck + 0.06 * dims.H, { bulge: -0.05, segments: 12 });
  neckParts.add(mats.skin, neck, { matrix: new THREE.Matrix4().makeTranslation(0, dims.neck + 0.3 * hh, -0.06 * hh), label: 'neck' });
  neckParts.build(head);

  const skull = group('skull', head, 0, dims.neck, 0.015 * hh);
  const scale = new THREE.Matrix4().makeScale(hh, hh, hh);
  const sculptor = createHeadSculpt(params.face);
  const parts = new PartBuilder();
  const headGeom = headGeometry(sculptor, params.face, params.skin.redness);
  parts.add(mats.skin, headGeom.clone(), { matrix: scale, label: 'face' });

  // Ears at the sides, between brow and nose base.
  for (const side of [-1, 1]) {
    const [sx, , sz] = sculptor.surfaceAt(side * sculptor.W * 0.5, 0.47, 0.05);
    const ear = earGeometry(side, params.face.earSize);
    ear.translate(sx + side * 0.012, 0.47, Math.min(sz, 0) - 0.02);
    parts.add(mats.skin, ear, { matrix: scale, label: nameFor(side, 'Ear') });
  }

  // Eyes in their sockets, with lids, lashes and brows.
  const eyeR = 0.052 * (0.92 + 0.16 * params.face.eyeSize) * (params.age < 12 ? 1.1 : 1);
  const irisColor = new THREE.Color(params.eyes.iris);
  for (const side of [-1, 1]) {
    const ey = sculptor.eyeY(side);
    const [ex, , ez] = sculptor.surfaceAt(side * sculptor.eyeX, ey);
    const m = new THREE.Matrix4()
      .multiplyMatrices(scale, new THREE.Matrix4().makeTranslation(ex, ey, ez + 0.3 * eyeR - eyeR))
      .multiply(new THREE.Matrix4().makeRotationY(-side * 0.06));
    const eye = eyeGeometries(eyeR, params.face.lidOpen, irisColor);
    parts.add(mats.sclera, eye.sclera, { matrix: m, label: nameFor(side, 'Eye') });
    parts.add(mats.iris, eye.iris, { matrix: m, label: nameFor(side, 'Iris') });
    parts.add(mats.cornea, eye.cornea, { matrix: m, label: nameFor(side, 'Cornea') });
    for (const lid of eye.lids) parts.add(mats.skin, lid, { matrix: m, label: 'eyelid' });
    parts.add(mats.hair, eye.lashes, { matrix: m, label: 'eyelashes' });
    parts.add(mats.hair, browGeometry(sculptor, side, params.sex === 'male' ? 0.034 : 0.026), { matrix: scale, label: 'eyebrow' });
  }

  // Hair: scalp layer plus strand cards.
  const rng = createRng(params.seed * 31 + 7);
  for (const g of hairGeometries(headGeom, sculptor, params.hair, rng)) parts.add(mats.hair, g, { matrix: scale, label: 'hair' });
  parts.build(skull);

  const headwear = group('headwear', skull);
  if (params.clothing.turban) buildTurban(params, sculptor, mats, headwear, hh);
  return { head, skull, headwear };
}

/** A turban of wool shawls wound in overlapping, slightly tilted wraps. */
function buildTurban(params, sculptor, mats, headwear, hh) {
  const { colors, wraps } = params.clothing.turban;
  const parts = new PartBuilder();
  const rx = sculptor.W * 0.5 + 0.05;
  const depth = 0.53 / rx;
  const bottom = 0.66;
  const top = 1.26;
  const h = (top - bottom) / wraps;
  const m = new THREE.Matrix4()
    .makeScale(hh, hh, hh)
    .multiply(new THREE.Matrix4().makeTranslation(0, 0.85, -0.03))
    .multiply(new THREE.Matrix4().makeRotationX(-0.18))
    .multiply(new THREE.Matrix4().makeTranslation(0, -0.85, 0));
  for (let i = 0; i < wraps; i++) {
    // Each wrap overlaps the one below, like a shawl wound round and round.
    const y0 = bottom + i * h - 0.25 * h;
    const y1 = bottom + (i + 1) * h + 0.05 * h;
    const r = rx * (1 + 0.025 * i) * (1 + 0.012 * (i % 2));
    const profile = (y) => r * (1 + 0.05 * Math.sin(Math.PI * THREE.MathUtils.clamp((y - y0) / (y1 - y0), 0, 1)));
    const surface = garmentSurface(profile, { depth, count: 9, folds: () => 0.015, phase: 0.4 });
    const g = garmentBand(surface, y0, y1, { steps: 4, segments: 28 });
    parts.add(mats.wool, g, { matrix: m, color: colors[i % colors.length], label: 'turban' });
  }
  const capR = rx * (1 + 0.025 * wraps) * 0.97;
  const crown = garmentSurface((y) => capR * Math.sqrt(Math.max(0, 1 - ((y - top + 0.02) / 0.12) ** 2)) + 0.001, { depth, count: 5, folds: () => 0.03 });
  parts.add(mats.wool, garmentBand(crown, top - 0.02, top + 0.1, { steps: 4, segments: 28 }), { matrix: m, color: colors[0], label: 'turban' });
  parts.build(headwear);
}

// ---- Torso and garments -------------------------------------------------------

function buildMaleGarments(params, dims, mats, parts) {
  const { H, torso: ts, chestR, waistR, neckR } = dims;
  const c = params.clothing;
  const hem = dims.kneeY + 0.02 * H - c.shirtLength * H - dims.waistY;
  const profile = profileFn([
    [hem, chestR * 1.5],
    [hem * 0.55, chestR * 1.24],
    [-0.04 * H, waistR * 1.1],
    [0, waistR],
    [0.3 * ts, (waistR + chestR) / 2],
    [0.6 * ts, chestR * 1.03],
    [0.86 * ts, chestR],
    [1.0 * ts, chestR * 1.0],
    [1.06 * ts, chestR * 0.8],
    [1.12 * ts, neckR * 1.15],
  ]);
  const surface = garmentSurface(profile, { depth: 0.74, count: 11, folds: (y) => (y < 0 ? 0.045 * Math.min(1, y / hem) : 0.01) });
  const [b0, b1, b2] = c.bands;
  const k = 0.01 * H;
  addGarment(parts, mats.cotton, surface, [
    { y0: hem, y1: hem + 2.5 * k, color: b0 },
    { y0: hem + 2.5 * k, y1: hem + 4.5 * k, color: c.shirt },
    { y0: hem + 4.5 * k, y1: hem + 7 * k, patchwork: c.patchwork },
    { y0: hem + 7 * k, y1: hem + 8 * k, color: b1 },
    { y0: hem + 8 * k, y1: 0.47 * ts, color: c.shirt },
    { y0: 0.47 * ts, y1: 0.5 * ts, color: b2 },
    { y0: 0.5 * ts, y1: 0.57 * ts, patchwork: c.patchwork },
    { y0: 0.57 * ts, y1: 0.6 * ts, color: b0 },
    { y0: 0.6 * ts, y1: 1.12 * ts, color: c.shirt },
  ], H, 'shirt');

  // Waist: finger-woven wool sash with hanging ends, or a buckskin belt and pouch.
  const outer = garmentSurface((y) => profile(y) * 1.035, { depth: 0.76 });
  if (c.sash) {
    parts.add(mats.wool, garmentBand(outer, -0.025 * H, 0.02 * H, { steps: 2, segments: 32 }), { color: c.sash[0], label: 'sash' });
    for (const [x, rot] of [[0.6, 0.08], [0.75, -0.05]]) {
      const tail = new THREE.BoxGeometry(0.035 * H, 0.17 * H, 0.006 * H, 1, 3, 1);
      tail.translate(0, -0.085 * H, 0);
      tail.rotateZ(rot);
      tail.rotateY(x);
      tail.translate(Math.sin(x) * waistR * 1.06, -0.01 * H, Math.cos(x) * waistR * 0.8);
      parts.add(mats.wool, tail, { color: c.sash[1], label: 'sash' });
    }
  } else {
    parts.add(mats.leather, garmentBand(outer, -0.012 * H, 0.012 * H, { steps: 1, segments: 32 }), { color: c.belt, label: 'belt' });
  }
  if (params.age >= 18) {
    const pouch = new THREE.BoxGeometry(0.05 * H, 0.065 * H, 0.018 * H, 1, 1, 1);
    pouch.translate(0, -0.04 * H, 0);
    pouch.rotateY(-1.1);
    pouch.translate(-waistR * 0.95, 0, waistR * 0.3);
    parts.add(mats.leather, pouch, { color: c.leather, label: 'pouch' });
  }
  if (c.neckerchief) {
    const scarf = garmentSurface(profileFn([[0.93 * ts, chestR * 0.8], [1.03 * ts, chestR * 0.6], [1.1 * ts, neckR * 1.32]]), { depth: 0.85, count: 6, folds: () => 0.03 });
    parts.add(mats.cotton, garmentBand(scarf, 0.93 * ts, 1.1 * ts, { steps: 3, segments: 28 }), { color: c.neckerchief, label: 'neckerchief' });
    const tip = new THREE.ConeGeometry(0.045 * H, 0.08 * H, 3, 1);
    tip.rotateX(Math.PI);
    tip.scale(1, 1, 0.25);
    tip.translate(0, 0.86 * ts, chestR * 0.68);
    parts.add(mats.cotton, tip, { color: c.neckerchief, label: 'neckerchief' });
  }
  return profile;
}

function buildFemaleGarments(params, dims, mats, parts) {
  const { H, torso: ts, chestR, waistR, neckR, age } = { ...dims, age: params.age };
  const c = params.clothing;
  const capeBottom = 0.36 * ts;

  // Blouse bodice (visible below the cape).
  const bodice = profileFn([[-0.03 * H, waistR * 1.02], [0, waistR], [0.3 * ts, waistR * 1.05], [0.55 * ts, chestR * 1.06], [0.8 * ts, chestR]]);
  addGarment(parts, mats.cotton, garmentSurface(bodice, { depth: 0.78, folds: () => 0.01 }), [{ y0: -0.02 * H, y1: capeBottom + 0.04 * H, color: c.blouse }], H, 'blouse', 32);

  // Long skirt of horizontal bands with patchwork rows; folds grow towards the hem.
  const hem = dims.ankleY + 0.012 * H - dims.waistY;
  const top = 0.025 * H;
  const skirtProfile = profileFn([[hem, 0.2 * H * (1 + params.body.build * 0.08)], [hem * 0.55, 0.165 * H], [-0.07 * H, waistR * 1.25], [0, waistR * 1.04], [top, waistR * 1.02]]);
  const L = top - hem;
  const skirt = garmentSurface(skirtProfile, { depth: 0.82, count: 13, folds: (y) => 0.012 + 0.05 * Math.max(0, 1 - (y - hem) / (L * 0.8)) });
  const cuts = [0, 0.12, 0.18, 0.26, 0.56, 0.62, 0.7, 1].map((t) => hem + t * L);
  const [s0, s1, s2, s3, s4] = c.skirt;
  addGarment(parts, mats.cotton, skirt, [
    { y0: cuts[0], y1: cuts[1], color: s0 },
    { y0: cuts[1], y1: cuts[2], patchwork: c.patchwork },
    { y0: cuts[2], y1: cuts[3], color: s1 },
    { y0: cuts[3], y1: cuts[4], color: s2 },
    age >= 12 ? { y0: cuts[4], y1: cuts[5], patchwork: { ...c.patchwork, colors: [...c.patchwork.colors].reverse() } } : { y0: cuts[4], y1: cuts[5], color: s2 },
    { y0: cuts[5], y1: cuts[6], color: s3 },
    { y0: cuts[6], y1: cuts[7], color: s4 },
  ], H, 'skirt', 40);
  parts.add(mats.leather, garmentBand(garmentSurface((y) => skirtProfile(y) * 1.02, { depth: 0.84 }), top - 0.012 * H, top, { steps: 1, segments: 32 }), {
    color: c.belt,
    label: 'belt',
  });

  // Cape blouse: a wide, ruffled cape over the shoulders and upper arms.
  const capeProfile = profileFn([[capeBottom, chestR * 1.95], [0.5 * ts, chestR * 1.85], [0.72 * ts, chestR * 1.6], [0.9 * ts, chestR * 1.25], [1.0 * ts, chestR * 0.85], [1.08 * ts, neckR * 1.35]]);
  const cape = garmentSurface(capeProfile, { depth: 0.8, count: 14, folds: (y) => 0.01 + 0.06 * Math.max(0, 1 - (y - capeBottom) / (0.4 * ts)) });
  const k = 0.01 * H;
  addGarment(parts, mats.cotton, cape, [
    { y0: capeBottom, y1: capeBottom + 3 * k, color: c.capeBand },
    { y0: capeBottom + 3 * k, y1: capeBottom + 4.5 * k, color: c.cape },
    { y0: capeBottom + 4.5 * k, y1: capeBottom + 5.5 * k, color: c.capeBand },
    { y0: capeBottom + 5.5 * k, y1: 1.08 * ts, color: c.cape },
  ], H, 'cape', 40);

  // Strands of glass beads piled from the collar up the neck.
  const n = c.beadStrands;
  const available = dims.neck * 0.85;
  const spacing = Math.min(0.0085 * H / 1.6, available / n);
  const tube = Math.min(0.0048 * H / 1.6, spacing * 0.66);
  const tilt = 0.18;
  for (let i = 0; i < n; i++) {
    // Each strand rests on the cape (or the strands below it), lower at the front.
    const y = ts * 0.97 + i * spacing;
    const lowest = y - capeProfile(y) * Math.sin(tilt);
    const R = Math.max(neckR * 1.2, capeProfile(lowest) * 1.03 + tube);
    const strand = new THREE.TorusGeometry(R, tube, 4, 22);
    strand.rotateX(Math.PI / 2 + tilt);
    strand.scale(1, 1, 0.88);
    strand.translate(0, y, 0.004 * H);
    parts.add(mats.beads, strand, { color: c.beadColors[i % c.beadColors.length], label: 'beads' });
  }
  return (y) => Math.max(skirtProfile(y), y > capeBottom ? capeProfile(y) : 0);
}

// ---- Limbs ------------------------------------------------------------------------

function buildArm(side, params, dims, mats, torso, garmentRadius) {
  const c = params.clothing;
  const female = params.sex === 'female';
  const arm = group(nameFor(side, 'Arm'), torso, side * dims.shoulderHalf, dims.torso - 0.02 * dims.H, 0);
  arm.userData.baseY = arm.position.y;
  const sleeve = female ? c.blouse : c.shirt;
  const cuff = female ? c.capeBand : c.bands[0];
  // Hang the arms just clear of the shirt / skirt at hand height.
  const handY = dims.torso - dims.armLength * 0.88;
  const clearance = garmentRadius(handY) * 1.04 + dims.hand * 0.12;
  arm.userData.restZ = side * Math.asin(THREE.MathUtils.clamp((clearance - dims.shoulderHalf) / (dims.armLength * 0.88), 0.06, 0.4));
  arm.rotation.z = arm.userData.restZ;
  arm.userData.side = side;

  const upper = new PartBuilder();
  upper.add(mats.cotton, limbGeometry(dims.limb(0.027), dims.limb(0.024), dims.upperArm, { bulge: 0.06, cap: 0.45 }), { color: sleeve, label: 'sleeve' });
  upper.build(arm);

  const elbow = group(nameFor(side, 'Elbow'), arm, 0, -dims.upperArm, 0);
  elbow.userData.restX = -0.18;
  elbow.rotation.x = elbow.userData.restX;
  const fore = new PartBuilder();
  fore.add(mats.cotton, limbGeometry(dims.limb(0.026), dims.limb(0.021), dims.forearm * 0.97, { bulge: 0.05 }), { color: sleeve, label: 'sleeve' });
  const cuffBand = new THREE.CylinderGeometry(dims.limb(0.0225), dims.limb(0.0225), 0.025 * dims.H, 12, 1, true);
  cuffBand.translate(0, -dims.forearm * 0.92, 0);
  fore.add(mats.cotton, cuffBand, { color: cuff, label: 'cuff' });
  const wrist = limbGeometry(dims.limb(0.016), dims.limb(0.015), 0.04 * dims.H, { segments: 8 });
  wrist.translate(0, -dims.forearm * 0.92, 0);
  fore.add(mats.skin, wrist, { label: 'wrist' });
  fore.build(elbow, { castShadow: (material) => material.userData.kind !== 'skin' });

  const hand = group(nameFor(side, 'Hand'), elbow, 0, -dims.forearm, 0);
  hand.rotation.y = -side * Math.PI * 0.5 * 0.85;
  const hp = new PartBuilder();
  hp.add(mats.skin, handGeometry(dims.hand, side), { label: 'hand' });
  // Hands are small: skip them in the shadow pass.
  hp.build(hand, { castShadow: () => false });
  return arm;
}

function buildLeg(side, params, dims, mats, body) {
  const c = params.clothing;
  const female = params.sex === 'female';
  const leg = group(nameFor(side, 'Leg'), body, side * dims.hipHalf, 0, 0);
  const cover = c.leggings ? { material: mats.wool, color: c.leggings, label: 'leggings' } : { material: mats.skin, color: null, label: 'leg' };
  if (!female) {
    const thigh = new PartBuilder();
    thigh.add(cover.material, limbGeometry(dims.limb(0.05), dims.limb(0.032), dims.thigh, { bulge: 0.1 }), { color: cover.color, label: cover.label });
    thigh.build(leg);
  }
  const knee = group(nameFor(side, 'Knee'), leg, 0, -dims.thigh, 0);
  const shin = new PartBuilder();
  shin.add(cover.material, limbGeometry(dims.limb(0.033), dims.limb(0.02), dims.shin, { bulge: 0.14 }), { color: cover.color, label: cover.label });
  if (c.leggings) {
    // Garter tied below the knee.
    const garter = new THREE.TorusGeometry(dims.limb(0.032), 0.004 * dims.H, 4, 14);
    garter.rotateX(Math.PI / 2);
    garter.translate(0, -0.03 * dims.H, 0);
    shin.add(mats.wool, garter, { color: c.leggings === c.bands?.[0] ? c.bands[1] : c.bands?.[0] ?? c.leggings, label: 'garter' });
  }
  shin.build(knee);

  const foot = group(nameFor(side, 'Foot'), knee, 0, -dims.shin, 0);
  const moccasin = c.footwear === 'moccasins';
  const fp = new PartBuilder();
  fp.add(
    moccasin ? mats.leather : mats.skin,
    footGeometry({ length: dims.footLength, width: dims.footWidth, ankleHeight: dims.ankleY, ankleRadius: dims.limb(0.021), moccasin }),
    { color: moccasin ? c.leather : null, label: moccasin ? 'moccasin' : 'foot' },
  );
  fp.build(foot);
  return leg;
}

// ---- Assembly ---------------------------------------------------------------------

function materialsFor(params) {
  return {
    skin: characterSkinMaterial(params.skin.tone, params.skin.ageBucket, params.skin.detail),
    hair: hairMaterial(params.hair.color),
    sclera: scleraMaterial(),
    iris: irisMaterial(),
    cornea: corneaMaterial(),
    cotton: cottonMaterial(),
    wool: woolMaterial(),
    leather: leatherMaterial(),
    beads: beadMaterial(),
  };
}

/**
 * Creates a character as a THREE.Group standing on y = 0 and facing +Z.
 * Accepts parameters from `generateCharacterParams` (defaults to the
 * player) or `{ seed, variant }`.
 */
export function createCharacter(params = PLAYER_PARAMS) {
  const p = params.body ? params : generateCharacterParams(params.seed ?? 1, params.variant ?? 'man', params.overrides);
  const dims = bodyDimensions(p);
  const mats = materialsFor(p);

  const character = new THREE.Group();
  character.name = 'character';
  const body = group('body', character, 0, dims.hipY, 0);
  body.userData.baseY = dims.hipY;
  const torso = group('torso', body, 0, dims.waistY - dims.hipY, 0);
  torso.userData.stoop = p.body.stoop;
  torso.rotation.x = p.body.stoop;

  const garments = group('garments', torso);
  const garmentParts = new PartBuilder();
  const female = p.sex === 'female';
  const garmentRadius = female ? buildFemaleGarments(p, dims, mats, garmentParts) : buildMaleGarments(p, dims, mats, garmentParts);
  garmentParts.build(garments);

  const arms = [-1, 1].map((side) => buildArm(side, p, dims, mats, torso, garmentRadius));
  const legs = [-1, 1].map((side) => buildLeg(side, p, dims, mats, body));
  const { head, skull, headwear } = buildHead(p, dims, mats, torso);
  head.userData.restX = -p.body.stoop * 0.8;
  head.rotation.x = head.userData.restX;

  const get = (name) => character.getObjectByName(name);
  character.userData.rig = {
    body,
    torso,
    garments,
    head,
    skull,
    headwear,
    leftArm: arms[0],
    rightArm: arms[1],
    leftElbow: get('leftElbow'),
    rightElbow: get('rightElbow'),
    leftLeg: legs[0],
    rightLeg: legs[1],
    leftKnee: get('leftKnee'),
    rightKnee: get('rightKnee'),
    leftFoot: get('leftFoot'),
    rightFoot: get('rightFoot'),
  };
  character.userData.params = p;
  character.userData.dims = dims;
  character.userData.variant = p.variant;
  character.userData.phase = ((p.seed * 0.6180339) % 1) * TAU;
  character.userData.strideLength = dims.hipY * 1.65;

  updateCharacterIdle(character, 0);
  const box = new THREE.Box3().setFromObject(character);
  character.userData.height = box.max.y;
  return character;
}

/** Every distinct material used by a character, keyed by `userData.kind`. */
export function characterMaterials(character) {
  const found = {};
  character.traverse((o) => {
    if (o.isMesh) found[o.material.userData.kind] = o.material;
  });
  return found;
}

/** Labels of every garment / body item (e.g. 'turban', 'skirt', 'beads'). */
export function characterItems(character) {
  const items = new Set();
  character.traverse((o) => o.isMesh && o.userData.parts?.forEach((label) => items.add(label)));
  return items;
}

function withHidden(character, predicate, fn) {
  const hidden = [];
  character.traverse((o) => {
    if (o.visible && predicate(o)) {
      o.visible = false;
      hidden.push(o);
    }
  });
  try {
    return fn();
  } finally {
    for (const o of hidden) o.visible = true;
  }
}

function visibleBox(root) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  root.traverseVisible((o) => {
    if (o.isMesh) box.expandByObject(o, true);
  });
  return box;
}

/**
 * Measures the anatomical head (chin to crown) against the standing height
 * (feet to crown, without hair or headwear), and the full height.
 */
export function measureProportions(character) {
  character.updateMatrixWorld(true);
  const skull = new THREE.Box3().setFromObject(character.getObjectByName('skull-skin'), true);
  const body = withHidden(character, (o) => o.name === 'headwear' || o.material?.userData.kind === 'hair', () => visibleBox(character));
  const full = new THREE.Box3().setFromObject(character, true);
  const headHeight = skull.max.y - skull.min.y;
  const bodyHeight = body.max.y - body.min.y;
  return {
    headHeight,
    bodyHeight,
    totalHeight: full.max.y - full.min.y,
    headsTall: bodyHeight / headHeight,
    headRatio: headHeight / bodyHeight,
  };
}

/** Fingertip-to-fingertip span with the arms raised sideways, in metres. */
export function measureArmSpan(character) {
  const { leftArm, rightArm, leftElbow, rightElbow, torso, head } = character.userData.rig;
  const saved = [leftArm, rightArm, leftElbow, rightElbow, torso].map((o) => o.rotation.clone());
  leftArm.rotation.set(0, 0, -Math.PI / 2);
  rightArm.rotation.set(0, 0, Math.PI / 2);
  leftElbow.rotation.set(0, 0, 0);
  rightElbow.rotation.set(0, 0, 0);
  torso.rotation.set(0, 0, 0);
  const box = withHidden(character, (o) => o === head || o.name === 'garments', () => visibleBox(character));
  [leftArm, rightArm, leftElbow, rightElbow, torso].forEach((o, i) => o.rotation.copy(saved[i]));
  return box.max.x - box.min.x;
}

// ---- Animation ----------------------------------------------------------------------

function setRest(rig) {
  for (const key of ['leftLeg', 'rightLeg', 'leftKnee', 'rightKnee', 'leftFoot', 'rightFoot']) rig[key].rotation.set(0, 0, 0);
}

/**
 * Relaxed idle: breathing, a slow weight shift from foot to foot, small arm
 * sway and the head looking around. A pure function of `elapsed` seconds
 * (plus the character's own phase), so the same time gives the same pose.
 */
export function updateCharacterIdle(character, elapsed) {
  const rig = character.userData.rig;
  if (!rig) return;
  const t = elapsed + character.userData.phase * 3;
  const { body, torso, garments, head, leftArm, rightArm, leftElbow, rightElbow, leftKnee, rightKnee, leftLeg, rightLeg } = rig;
  setRest(rig);
  const breath = Math.sin((t * TAU) / 4.2);
  garments.scale.set(1 + breath * 0.008, 1 + breath * 0.004, 1 + breath * 0.016);

  // Weight shift: the pelvis drifts over one foot, tilts, and the other knee softens.
  const w = Math.sin((t * TAU) / 9.5) * 0.8 + Math.sin((t * TAU) / 23) * 0.2;
  body.position.set(w * 0.016, body.userData.baseY - Math.abs(w) * 0.004, 0);
  body.rotation.set(0, w * 0.04, -w * 0.035);
  leftLeg.rotation.z = w * 0.035 - w * 0.012;
  rightLeg.rotation.z = w * 0.035 + w * 0.012;
  leftKnee.rotation.x = Math.max(0, -w) * 0.09;
  rightKnee.rotation.x = Math.max(0, w) * 0.09;
  leftLeg.rotation.x = -Math.max(0, -w) * 0.04;
  rightLeg.rotation.x = -Math.max(0, w) * 0.04;
  torso.rotation.set(torso.userData.stoop + breath * 0.008, -w * 0.03, w * 0.05);

  head.position.y = head.userData.baseY + breath * 0.002;
  head.rotation.set(
    head.userData.restX + Math.sin(t * 0.43) * 0.04,
    Math.sin(t * 0.29) * 0.3 + Math.sin(t * 0.71) * 0.05,
    -w * 0.03,
  );

  const sway = Math.sin((t * TAU) / 4.2 + 0.6) * 0.02;
  leftArm.rotation.set(sway * 0.6 + 0.03, 0, leftArm.userData.restZ - sway * 0.5 - w * 0.03);
  rightArm.rotation.set(-sway * 0.6 + 0.03, 0, rightArm.userData.restZ + sway * 0.5 - w * 0.03);
  leftArm.position.y = rightArm.position.y = leftArm.userData.baseY + breath * 0.002;
  leftElbow.rotation.x = leftElbow.userData.restX - sway;
  rightElbow.rotation.x = rightElbow.userData.restX + sway;
}

/**
 * Walk / run cycle. `distance` is how far the character has travelled in
 * metres; `run` (0..1) blends from a walk to a run (longer stride, more
 * knee lift, forward lean, bent arms). Returns the vertical bob the caller
 * may add to the character's position.
 */
export function updateCharacterWalk(character, distance, elapsed = 0, { run = 0 } = {}) {
  const rig = character.userData.rig;
  if (!rig) return 0;
  const { body, torso, garments, head, leftArm, rightArm, leftElbow, rightElbow, leftLeg, rightLeg, leftKnee, rightKnee, leftFoot, rightFoot } = rig;
  const k = THREE.MathUtils.clamp(run, 0, 1);
  const stride = character.userData.strideLength * (1 + 0.45 * k);
  const phase = (distance / stride) * TAU;
  const s = Math.sin(phase);
  const lerp = THREE.MathUtils.lerp;

  const swing = lerp(0.42, 0.7, k);
  leftLeg.rotation.set(-s * swing - k * 0.1, 0, 0);
  rightLeg.rotation.set(s * swing - k * 0.1, 0, 0);
  // Knees flex as each leg swings through, more when running.
  const kneeLift = lerp(0.65, 1.35, k);
  leftKnee.rotation.x = Math.max(0, Math.sin(phase + Math.PI * 0.5)) * kneeLift + 0.05;
  rightKnee.rotation.x = Math.max(0, Math.sin(phase - Math.PI * 0.5)) * kneeLift + 0.05;
  // Feet stay roughly parallel to the ground, with a little toe-off behind the body.
  leftFoot.rotation.x = -(leftLeg.rotation.x + leftKnee.rotation.x) * 0.85 + Math.max(0, -s) * 0.15;
  rightFoot.rotation.x = -(rightLeg.rotation.x + rightKnee.rotation.x) * 0.85 + Math.max(0, s) * 0.15;

  const armSwing = lerp(0.35, 0.7, k);
  leftArm.rotation.set(s * armSwing, 0, leftArm.userData.restZ);
  rightArm.rotation.set(-s * armSwing, 0, rightArm.userData.restZ);
  leftArm.position.y = rightArm.position.y = leftArm.userData.baseY;
  leftElbow.rotation.x = lerp(-0.3, -1.35, k) - Math.max(0, s) * 0.25;
  rightElbow.rotation.x = lerp(-0.3, -1.35, k) - Math.max(0, -s) * 0.25;

  garments.scale.set(1, 1, 1);
  body.position.set(0, body.userData.baseY, 0);
  body.rotation.set(0, s * 0.08, Math.cos(phase) * 0.02);
  torso.rotation.set(torso.userData.stoop + lerp(0.03, 0.2, k), -s * 0.1, 0);
  head.position.y = head.userData.baseY;
  head.rotation.set(head.userData.restX - lerp(0.02, 0.15, k), s * 0.05 + Math.sin(elapsed * 0.3) * 0.08, 0);
  return Math.abs(Math.cos(phase)) * lerp(0.025, 0.06, k);
}
