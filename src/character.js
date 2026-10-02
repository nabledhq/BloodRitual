import * as THREE from 'three';
import { fabricMaterial, skinMaterial, detailMaterial } from './materials.js';

/**
 * Procedural Seminole characters with realistic adult proportions (the head
 * is about 1/7.2 of standing height) and layered clothing of the early
 * 1900s, all in muted, naturally dyed colours.
 *
 * - `man`: knee-length banded "big shirt", belt and pouch, neckerchief,
 *   wrapped cloth turban, leggings and buckskin moccasins.
 * - `woman`: cape blouse over a bodice, long banded skirt and many strands
 *   of glass beads; hair worn in a bun.
 *
 * Every limb is a jointed group (hip/knee, shoulder/elbow, neck) so the
 * idle and walk animations can pose it.
 */

export const DEFAULT_PALETTE = Object.freeze({
  outfit: 'man',
  height: 1.74,
  skin: 0x8a5a3c,
  hair: 0x1a1411,
  eyes: 0x1c120c,
  // Hem trim, shirt body, skirt trim, bodice, chest trim, yoke.
  shirtBands: [0x8e3b2f, 0xd5c9ad, 0x34445e, 0xcfc2a4, 0xa8862f, 0xd5c9ad],
  belt: 0x4a3221,
  neckerchief: 0x8a2a24,
  turban: 0x5b4a6b,
  turbanBand: 0xa88a3a,
  legs: 0x3b332b,
  moccasins: 0x8a6a4a,
});

export const WOMAN_PALETTE = Object.freeze({
  outfit: 'woman',
  height: 1.6,
  skin: 0x8f5d40,
  hair: 0x161210,
  eyes: 0x1c120c,
  // Bodice and sleeves.
  shirtBands: [0x8e3b2f, 0x6f7c8a, 0x34445e, 0x6f7c8a, 0xa8862f, 0x6f7c8a],
  cape: 0xcdbf9f,
  capeBand: 0x8e3b2f,
  // Long skirt, from hem upward.
  skirtBands: [0x34445e, 0xa8862f, 0x7a3b2e, 0x4f5f3e, 0x8e3b2f, 0x6b5a7a],
  beads: [0x3e5f8a, 0x8a2f2a, 0x2f6f6a, 0xb08a3a],
  belt: 0x4a3221,
  legs: 0x8f5d40,
  moccasins: 0x8f5d40,
});

/** Standing height (with headwear) of the default character, in metres. */
export const CHARACTER_HEIGHT = 1.82;

const TAU = Math.PI * 2;

function mesh(geometry, material, name, { cast = true } = {}) {
  const m = new THREE.Mesh(geometry, material);
  m.name = name;
  m.castShadow = cast;
  m.receiveShadow = true;
  return m;
}

/** Rounded, tapering limb hanging from y = 0 down to y = -length. */
function limbGeometry(rTop, rBottom, length, bulge = 0.08) {
  const pts = [new THREE.Vector2(0, -length - rBottom * 0.55), new THREE.Vector2(rBottom * 0.75, -length - rBottom * 0.35)];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    const r = THREE.MathUtils.lerp(rBottom, rTop, t) * (1 + bulge * Math.sin(t * Math.PI));
    pts.push(new THREE.Vector2(r, -length + t * length));
  }
  pts.push(new THREE.Vector2(rTop * 0.8, rTop * 0.45), new THREE.Vector2(0, rTop * 0.65));
  return new THREE.LatheGeometry(pts, 14);
}

/** Lathe ring covering profile heights y0..y1 of `radiusAt(y)`. */
function ringGeometry(radiusAt, y0, y1, steps = 4) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const y = THREE.MathUtils.lerp(y0, y1, i / steps);
    pts.push(new THREE.Vector2(radiusAt(y), y));
  }
  return new THREE.LatheGeometry(pts, 22);
}

/** Piecewise-linear radius profile from [[y, r], ...] sorted by y. */
function profileFn(points) {
  return (y) => {
    if (y <= points[0][0]) return points[0][1];
    for (let i = 1; i < points.length; i++) {
      if (y <= points[i][0]) {
        const [y0, r0] = points[i - 1];
        const [y1, r1] = points[i];
        return THREE.MathUtils.lerp(r0, r1, (y - y0) / (y1 - y0));
      }
    }
    return points[points.length - 1][1];
  };
}

/** A group of colour bands stacked along a lathe profile (patchwork/applique look). */
function bandedGarment(name, colors, radiusAt, bounds, depthScale) {
  const garment = new THREE.Group();
  garment.name = name;
  colors.forEach((color, i) => {
    const band = mesh(ringGeometry(radiusAt, bounds[i], bounds[i + 1]), fabricMaterial(color), `${name}Band${i}`);
    garment.add(band);
  });
  garment.scale.z = depthScale;
  return garment;
}

function evenBounds(y0, y1, n) {
  return Array.from({ length: n + 1 }, (_, i) => THREE.MathUtils.lerp(y0, y1, i / n));
}

// Big shirt: flared knee-length skirt, belted waist, chest, sloping shoulders.
const SHIRT_PROFILE = profileFn([
  [-0.42, 0.31], [-0.2, 0.255], [0.0, 0.2], [0.12, 0.168], [0.25, 0.178], [0.38, 0.19], [0.47, 0.178], [0.52, 0.14], [0.56, 0.066],
]);
const SHIRT_BOUNDS = [-0.42, -0.35, -0.12, -0.06, 0.28, 0.34, 0.56];
// Woman's bodice (under the cape) and long skirt.
const BODICE_PROFILE = profileFn([[0.08, 0.166], [0.25, 0.172], [0.38, 0.18], [0.47, 0.17], [0.52, 0.135], [0.56, 0.064]]);
const SKIRT_PROFILE = profileFn([[-0.86, 0.36], [-0.5, 0.3], [-0.15, 0.235], [0.0, 0.2], [0.13, 0.172]]);
const CAPE_PROFILE = profileFn([[0.24, 0.33], [0.32, 0.3], [0.42, 0.25], [0.5, 0.18], [0.56, 0.075]]);

function createLeg(side, palette, bare) {
  const leg = new THREE.Group();
  leg.name = side < 0 ? 'leftLeg' : 'rightLeg';
  leg.position.set(0.095 * side, 0.9, 0);
  const cloth = bare ? skinMaterial(palette.skin) : fabricMaterial(palette.legs);

  leg.add(mesh(limbGeometry(0.078, 0.054, 0.44, 0.1), cloth, 'thigh'));
  const knee = new THREE.Group();
  knee.name = side < 0 ? 'leftKnee' : 'rightKnee';
  knee.position.y = -0.44;
  knee.add(mesh(limbGeometry(0.054, 0.035, 0.39, 0.14), cloth, 'shin'));

  const foot = mesh(new THREE.SphereGeometry(1, 14, 10), bare ? skinMaterial(palette.skin) : fabricMaterial(palette.moccasins), 'moccasin');
  foot.scale.set(0.048, 0.04, 0.125);
  foot.position.set(0, -0.42, 0.05);
  knee.add(foot);
  leg.add(knee);
  return leg;
}

function createArm(side, palette, sleeveColor, cuffColor) {
  const arm = new THREE.Group();
  arm.name = side < 0 ? 'leftArm' : 'rightArm';
  arm.position.set(0.205 * side, 1.43, 0);
  arm.userData.restZ = 0.12 * side;
  arm.rotation.z = arm.userData.restZ;

  const sleeve = fabricMaterial(sleeveColor);
  arm.add(mesh(limbGeometry(0.056, 0.045, 0.29), sleeve, 'sleeve'));

  const elbow = new THREE.Group();
  elbow.name = side < 0 ? 'leftElbow' : 'rightElbow';
  elbow.position.y = -0.29;
  elbow.rotation.x = -0.12;
  elbow.add(mesh(limbGeometry(0.047, 0.036, 0.24), sleeve, 'forearm'));
  const cuff = mesh(new THREE.CylinderGeometry(0.041, 0.041, 0.04, 14, 1, true), fabricMaterial(cuffColor), 'cuff');
  cuff.position.y = -0.225;
  elbow.add(cuff);

  const skin = skinMaterial(palette.skin);
  const hand = mesh(new THREE.SphereGeometry(1, 12, 10), skin, 'hand');
  hand.scale.set(0.024, 0.085, 0.045);
  hand.position.set(0, -0.33, 0.005);
  hand.rotation.y = side * 0.35;
  elbow.add(hand);
  const thumb = mesh(new THREE.CapsuleGeometry(0.011, 0.04, 3, 6), skin, 'thumb');
  thumb.position.set(-side * 0.012, -0.29, 0.03);
  thumb.rotation.x = 0.4;
  elbow.add(thumb);
  arm.add(elbow);
  return arm;
}

function createHead(palette) {
  const head = new THREE.Group();
  head.name = 'head';
  head.position.set(0, 1.47, -0.01);
  head.userData.baseY = 1.47;
  const skin = skinMaterial(palette.skin);

  const neck = mesh(new THREE.CylinderGeometry(0.048, 0.054, 0.11, 14), skin, 'neck');
  neck.position.y = 0.045;
  head.add(neck);

  // The anatomical head (chin to crown), measured by the proportion tests.
  const skull = new THREE.Group();
  skull.name = 'skull';
  const cranium = mesh(new THREE.SphereGeometry(0.098, 24, 18), skin, 'cranium');
  cranium.scale.set(0.82, 1, 0.98);
  cranium.position.y = 0.172;
  const face = mesh(new THREE.SphereGeometry(0.072, 20, 16), skin, 'face');
  face.scale.set(0.82, 1.05, 0.95);
  face.position.set(0, 0.105, 0.018);
  skull.add(cranium, face);

  const nose = mesh(new THREE.ConeGeometry(0.014, 0.04, 4), skin, 'nose');
  nose.rotation.x = -0.35;
  nose.position.set(0, 0.13, 0.092);
  skull.add(nose);
  for (const side of [-1, 1]) {
    const ear = mesh(new THREE.SphereGeometry(0.024, 10, 8), skin, side < 0 ? 'leftEar' : 'rightEar');
    ear.scale.set(0.4, 1, 0.7);
    ear.position.set(0.08 * side, 0.15, -0.005);
    skull.add(ear);
    const white = mesh(new THREE.SphereGeometry(0.012, 10, 8), detailMaterial(0xd8d0c0, 0.3), 'eyeWhite', { cast: false });
    white.position.set(0.031 * side, 0.158, 0.077);
    const iris = mesh(new THREE.SphereGeometry(0.0075, 8, 6), detailMaterial(palette.eyes, 0.2), side < 0 ? 'leftEye' : 'rightEye', { cast: false });
    iris.position.set(0.031 * side, 0.158, 0.087);
    const brow = mesh(new THREE.BoxGeometry(0.03, 0.006, 0.01), detailMaterial(palette.hair, 0.8), 'brow', { cast: false });
    brow.position.set(0.031 * side, 0.177, 0.087);
    brow.rotation.z = -0.12 * side;
    skull.add(white, iris, brow);
  }
  const mouth = mesh(new THREE.BoxGeometry(0.032, 0.005, 0.008), detailMaterial(0x4a2a22, 0.5), 'mouth', { cast: false });
  mouth.position.set(0, 0.083, 0.083);
  skull.add(mouth);
  head.add(skull);
  return head;
}

function addManClothing(character, palette, torso, head) {
  torso.add(bandedGarment('shirt', palette.shirtBands, SHIRT_PROFILE, SHIRT_BOUNDS, 0.74));

  const belt = mesh(new THREE.CylinderGeometry(0.172, 0.174, 0.05, 22, 1, true), fabricMaterial(palette.belt), 'belt');
  belt.scale.z = 0.76;
  belt.position.y = 0.12;
  const pouch = mesh(new THREE.BoxGeometry(0.09, 0.11, 0.035), fabricMaterial(palette.belt), 'pouch');
  pouch.position.set(0.15, 0.06, 0.07);
  pouch.rotation.y = 0.9;
  torso.add(belt, pouch);

  const scarf = fabricMaterial(palette.neckerchief);
  const neckerchief = mesh(new THREE.CylinderGeometry(0.068, 0.14, 0.09, 20, 1, true), scarf, 'neckerchief');
  neckerchief.scale.z = 0.85;
  neckerchief.position.y = 0.52;
  const knot = mesh(new THREE.ConeGeometry(0.06, 0.12, 3), scarf, 'neckerchiefTip');
  knot.rotation.set(Math.PI, 0, 0);
  knot.position.set(0, 0.43, 0.13);
  knot.scale.z = 0.3;
  torso.add(neckerchief, knot);

  // Short hair, mostly hidden under the turban.
  const hair = mesh(new THREE.SphereGeometry(0.101, 20, 14, 0, TAU, 0, Math.PI * 0.62), detailMaterial(palette.hair, 0.75), 'hair');
  hair.scale.set(0.84, 1, 1);
  hair.position.set(0, 0.174, -0.006);
  hair.rotation.x = -0.45;
  head.getObjectByName('skull').add(hair);

  // A shawl wrapped into a turban: a core plus layered wraps.
  const headwear = new THREE.Group();
  headwear.name = 'headwear';
  const turban = mesh(new THREE.CylinderGeometry(0.122, 0.11, 0.15, 24), fabricMaterial(palette.turban), 'turban');
  turban.scale.z = 1.08;
  turban.position.y = 0.265;
  headwear.add(turban);
  [0.21, 0.25, 0.29, 0.325].forEach((y, i) => {
    const wrap = mesh(new THREE.TorusGeometry(0.115 + i * 0.004, 0.022, 8, 28), fabricMaterial(i % 2 ? palette.turbanBand : palette.turban), `turbanWrap${i}`);
    wrap.rotation.set(Math.PI / 2 + (i % 2 ? 0.08 : -0.06), 0, 0);
    wrap.scale.y = 1.08;
    wrap.position.y = y;
    headwear.add(wrap);
  });
  const top = mesh(new THREE.CylinderGeometry(0.105, 0.118, 0.016, 24), fabricMaterial(palette.turban), 'turbanTop');
  top.position.y = 0.342;
  headwear.add(top);
  head.add(headwear);
}

function addWomanClothing(character, palette, torso, head) {
  torso.add(bandedGarment('shirt', palette.shirtBands.slice(3), BODICE_PROFILE, [0.08, 0.3, 0.36, 0.56], 0.74));
  torso.add(bandedGarment('skirt', palette.skirtBands, SKIRT_PROFILE, evenBounds(-0.86, 0.13, palette.skirtBands.length), 0.8));
  const belt = mesh(new THREE.CylinderGeometry(0.17, 0.172, 0.03, 22, 1, true), fabricMaterial(palette.belt), 'belt');
  belt.scale.z = 0.78;
  belt.position.y = 0.12;
  torso.add(belt);

  const cape = bandedGarment('cape', [palette.capeBand, palette.cape], CAPE_PROFILE, [0.24, 0.28, 0.56], 0.8);
  torso.add(cape);

  // Many strands of glass beads stacked up the neck.
  const beads = new THREE.Group();
  beads.name = 'beads';
  for (let i = 0; i < 7; i++) {
    const strand = mesh(new THREE.TorusGeometry(0.098 - i * 0.006, 0.011, 6, 26), detailMaterial(palette.beads[i % palette.beads.length], 0.25), `beads${i}`);
    strand.rotation.x = Math.PI / 2 - 0.15;
    strand.scale.y = 0.9;
    strand.position.set(0, 0.52 + i * 0.012, 0.01);
    beads.add(strand);
  }
  torso.add(beads);

  const hairMat = detailMaterial(palette.hair, 0.55);
  const hair = mesh(new THREE.SphereGeometry(0.103, 20, 14, 0, TAU, 0, Math.PI * 0.6), hairMat, 'hair');
  hair.scale.set(0.86, 1.02, 1.02);
  hair.position.set(0, 0.174, -0.008);
  hair.rotation.x = -0.5;
  const skull = head.getObjectByName('skull');
  skull.add(hair);
  const bun = mesh(new THREE.SphereGeometry(0.05, 14, 10), hairMat, 'bun');
  bun.position.set(0, 0.2, -0.095);
  skull.add(bun);
  const headwear = new THREE.Group();
  headwear.name = 'headwear';
  head.add(headwear);
}

/**
 * Creates a character as a THREE.Group standing on y = 0 and facing +Z.
 * Named child groups (head, skull, headwear, torso, leftArm, rightArm,
 * leftElbow, rightElbow, leftLeg, rightLeg, leftKnee, rightKnee) can be
 * animated individually. `palette.outfit` selects 'man' or 'woman'.
 */
export function createCharacter(palette = DEFAULT_PALETTE) {
  const p = { ...DEFAULT_PALETTE, ...palette };
  const woman = p.outfit === 'woman';
  const character = new THREE.Group();
  character.name = 'character';

  // Everything is modelled for a 1.74 m adult and scaled to the requested height.
  const body = new THREE.Group();
  body.name = 'body';
  const scale = p.height / DEFAULT_PALETTE.height;
  body.scale.setScalar(scale);
  character.add(body);

  body.add(createLeg(-1, p, woman), createLeg(1, p, woman));

  const torso = new THREE.Group();
  torso.name = 'torso';
  torso.position.y = 0.92;
  body.add(torso);

  const sleeve = woman ? p.shirtBands[3] : p.shirtBands[1];
  body.add(createArm(-1, p, sleeve, p.shirtBands[0]), createArm(1, p, sleeve, p.shirtBands[0]));
  const head = createHead(p);
  body.add(head);

  if (woman) addWomanClothing(character, p, torso, head);
  else addManClothing(character, p, torso, head);

  const box = new THREE.Box3().setFromObject(character);
  character.userData.height = box.max.y;
  character.userData.outfit = p.outfit;
  return character;
}

/**
 * Measures the anatomical head (chin to crown, excluding headwear) against
 * the standing height without headwear, and also against the full height.
 */
export function measureProportions(character) {
  character.updateMatrixWorld(true);
  // Precise (vertex-based) boxes: rotated parts would otherwise inflate them.
  const skull = new THREE.Box3().setFromObject(character.getObjectByName('skull'), true);
  const headwear = character.getObjectByName('headwear');
  const visible = headwear ? headwear.visible : true;
  if (headwear) headwear.visible = false;
  const body = new THREE.Box3();
  character.traverseVisible((o) => {
    if (o.isMesh) body.expandByObject(o, true);
  });
  if (headwear) headwear.visible = visible;
  const full = new THREE.Box3().setFromObject(character, true);
  const headHeight = skull.max.y - skull.min.y;
  const bodyHeight = body.max.y - body.min.y;
  return {
    headHeight,
    bodyHeight,
    totalHeight: full.max.y - full.min.y,
    headsTall: bodyHeight / headHeight,
    headRatio: headHeight / bodyHeight,
    headRatioWithHeadwear: headHeight / (full.max.y - full.min.y),
  };
}

function parts(character) {
  const get = (name) => character.getObjectByName(name);
  return {
    torso: get('torso'),
    head: get('head'),
    leftArm: get('leftArm'),
    rightArm: get('rightArm'),
    leftElbow: get('leftElbow'),
    rightElbow: get('rightElbow'),
    leftLeg: get('leftLeg'),
    rightLeg: get('rightLeg'),
    leftKnee: get('leftKnee'),
    rightKnee: get('rightKnee'),
  };
}

/**
 * Applies a gentle idle animation (breathing, arm sway and looking around).
 * It is a pure function of `elapsed` seconds, so the same time always
 * produces the same pose.
 */
export function updateCharacterIdle(character, elapsed) {
  const { torso, head, leftArm, rightArm, leftElbow, rightElbow, leftLeg, rightLeg, leftKnee, rightKnee } = parts(character);
  const breath = Math.sin(elapsed * 1.6);
  if (torso) torso.scale.set(1 + breath * 0.012, 1 + breath * 0.006, 1 + breath * 0.014);
  if (head) {
    head.position.y = head.userData.baseY + breath * 0.004;
    head.rotation.y = Math.sin(elapsed * 0.35) * 0.35;
    head.rotation.x = Math.sin(elapsed * 0.5) * 0.04;
  }
  const sway = Math.sin(elapsed * 1.6 + 0.6) * 0.03;
  if (leftArm) {
    leftArm.rotation.z = leftArm.userData.restZ - sway;
    leftArm.rotation.x = sway * 0.5;
  }
  if (rightArm) {
    rightArm.rotation.z = rightArm.userData.restZ + sway;
    rightArm.rotation.x = -sway * 0.5;
  }
  if (leftElbow) leftElbow.rotation.x = -0.12 - sway;
  if (rightElbow) rightElbow.rotation.x = -0.12 + sway;
  for (const leg of [leftLeg, rightLeg]) if (leg) leg.rotation.x = 0;
  for (const knee of [leftKnee, rightKnee]) if (knee) knee.rotation.x = 0;
}

/**
 * Applies a walk cycle. `distance` is how far the character has walked in
 * metres (one full stride cycle is about 1.4 m). Returns the vertical bob
 * the caller may add to the character's position.
 */
export function updateCharacterWalk(character, distance, elapsed = 0) {
  const { torso, head, leftArm, rightArm, leftElbow, rightElbow, leftLeg, rightLeg, leftKnee, rightKnee } = parts(character);
  const phase = (distance / 1.4) * TAU;
  const s = Math.sin(phase);
  const swing = 0.42;
  if (leftLeg) leftLeg.rotation.x = -s * swing;
  if (rightLeg) rightLeg.rotation.x = s * swing;
  // Knees bend while the leg swings through.
  if (leftKnee) leftKnee.rotation.x = Math.max(0, Math.sin(phase + Math.PI * 0.5)) * 0.7;
  if (rightKnee) rightKnee.rotation.x = Math.max(0, Math.sin(phase - Math.PI * 0.5)) * 0.7;
  if (leftArm) {
    leftArm.rotation.x = s * 0.35;
    leftArm.rotation.z = leftArm.userData.restZ;
  }
  if (rightArm) {
    rightArm.rotation.x = -s * 0.35;
    rightArm.rotation.z = rightArm.userData.restZ;
  }
  if (leftElbow) leftElbow.rotation.x = -0.25 - Math.max(0, s) * 0.25;
  if (rightElbow) rightElbow.rotation.x = -0.25 - Math.max(0, -s) * 0.25;
  if (torso) {
    torso.scale.set(1, 1, 1);
    torso.rotation.y = s * 0.06;
  }
  if (head) {
    head.position.y = head.userData.baseY;
    head.rotation.y = -s * 0.05 + Math.sin(elapsed * 0.3) * 0.1;
    head.rotation.x = 0.04;
  }
  return Math.abs(Math.cos(phase)) * 0.025;
}
