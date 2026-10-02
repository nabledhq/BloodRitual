import * as THREE from 'three';

/**
 * Default palette for the player character. The outfit is a simplified
 * take on the patchwork "big shirt", neckerchief and cloth turban worn by
 * Seminole men in the early 1900s.
 */
export const DEFAULT_PALETTE = Object.freeze({
  skin: 0x8d5a3b,
  hair: 0x1b1410,
  eyes: 0x111111,
  shirtBands: [0xc0392b, 0xf1c40f, 0x1f4e79, 0xf5ecd7, 0x2e7d32, 0xc0392b],
  belt: 0x5d3a1a,
  neckerchief: 0xb71c1c,
  turban: 0x6d4c8f,
  turbanBand: 0xf1c40f,
  legs: 0x3e2f23,
  moccasins: 0x7b5434,
});

/** Approximate standing height of the character in world units (metres). */
export const CHARACTER_HEIGHT = 1.9;

function material(color) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0 });
}

function mesh(geometry, color, name) {
  const m = new THREE.Mesh(geometry, material(color));
  m.name = name;
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/**
 * Builds a tapered tunic out of horizontal colour bands stacked from
 * `bottom` to `top`, which gives the characteristic patchwork look.
 */
function createShirt(bands, { bottom, top, radiusBottom, radiusTop }) {
  const shirt = new THREE.Group();
  shirt.name = 'shirt';
  const bandHeight = (top - bottom) / bands.length;
  bands.forEach((color, i) => {
    const t0 = i / bands.length;
    const t1 = (i + 1) / bands.length;
    const rBottom = THREE.MathUtils.lerp(radiusBottom, radiusTop, t0);
    const rTop = THREE.MathUtils.lerp(radiusBottom, radiusTop, t1);
    const band = mesh(
      new THREE.CylinderGeometry(rTop, rBottom, bandHeight, 20),
      color,
      `shirtBand${i}`,
    );
    band.position.y = bottom + bandHeight * (i + 0.5);
    shirt.add(band);
  });
  return shirt;
}

function createArm(side, palette) {
  // The arm group pivots at the shoulder so it can swing naturally.
  const arm = new THREE.Group();
  arm.name = side < 0 ? 'leftArm' : 'rightArm';
  arm.position.set(0.27 * side, 1.4, 0);

  const sleeve = mesh(new THREE.CylinderGeometry(0.065, 0.075, 0.42, 12), palette.shirtBands[3], 'sleeve');
  sleeve.position.y = -0.21;
  arm.add(sleeve);

  const cuff = mesh(new THREE.CylinderGeometry(0.077, 0.077, 0.05, 12), palette.shirtBands[0], 'cuff');
  cuff.position.y = -0.4;
  arm.add(cuff);

  const forearm = mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.14, 10), palette.skin, 'forearm');
  forearm.position.y = -0.48;
  arm.add(forearm);

  const hand = mesh(new THREE.SphereGeometry(0.055, 12, 10), palette.skin, 'hand');
  hand.position.y = -0.58;
  arm.add(hand);

  arm.rotation.z = 0.08 * side;
  return arm;
}

function createLeg(side, palette) {
  const leg = new THREE.Group();
  leg.name = side < 0 ? 'leftLeg' : 'rightLeg';
  leg.position.set(0.1 * side, 0, 0);

  const shin = mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.62, 12), palette.legs, 'shin');
  shin.position.y = 0.36;
  leg.add(shin);

  const moccasin = mesh(new THREE.BoxGeometry(0.12, 0.08, 0.24), palette.moccasins, 'moccasin');
  moccasin.position.set(0, 0.04, 0.04);
  leg.add(moccasin);

  return leg;
}

function createHead(palette) {
  // The head group pivots at the neck so it can look around.
  const head = new THREE.Group();
  head.name = 'head';
  head.position.y = 1.5;

  const neck = mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.1, 12), palette.skin, 'neck');
  neck.position.y = 0.03;
  head.add(neck);

  const face = mesh(new THREE.SphereGeometry(0.125, 20, 16), palette.skin, 'face');
  face.scale.set(0.92, 1.08, 0.95);
  face.position.y = 0.17;
  head.add(face);

  const hair = mesh(new THREE.SphereGeometry(0.128, 20, 16, 0, Math.PI * 2, 0, Math.PI * 0.55), palette.hair, 'hair');
  hair.scale.set(0.93, 1.05, 0.97);
  hair.position.set(0, 0.175, -0.012);
  hair.rotation.x = -0.35;
  head.add(hair);

  for (const side of [-1, 1]) {
    const eye = mesh(new THREE.SphereGeometry(0.014, 8, 6), palette.eyes, side < 0 ? 'leftEye' : 'rightEye');
    eye.castShadow = false;
    eye.position.set(0.042 * side, 0.19, 0.112);
    head.add(eye);
  }

  const nose = mesh(new THREE.ConeGeometry(0.018, 0.045, 8), palette.skin, 'nose');
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, 0.155, 0.128);
  head.add(nose);

  // Cloth turban: a wrapped cylinder with a decorative band.
  const turban = mesh(new THREE.CylinderGeometry(0.15, 0.135, 0.13, 24), palette.turban, 'turban');
  turban.position.y = 0.3;
  head.add(turban);

  const turbanBand = mesh(new THREE.TorusGeometry(0.142, 0.014, 8, 28), palette.turbanBand, 'turbanBand');
  turbanBand.rotation.x = Math.PI / 2;
  turbanBand.position.y = 0.27;
  head.add(turbanBand);

  const turbanTop = mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.03, 24), palette.turban, 'turbanTop');
  turbanTop.position.y = 0.38;
  head.add(turbanTop);

  return head;
}

/**
 * Creates the player character as a THREE.Group standing on y = 0 and
 * facing +Z. Named child groups (head, torso, leftArm, rightArm, leftLeg,
 * rightLeg) can be animated individually.
 */
export function createCharacter(palette = DEFAULT_PALETTE) {
  const character = new THREE.Group();
  character.name = 'character';

  character.add(createLeg(-1, palette), createLeg(1, palette));

  // The torso group scales slightly while breathing, so pivot it at the hips.
  const torso = new THREE.Group();
  torso.name = 'torso';
  torso.position.y = 0.55;
  const shirt = createShirt(palette.shirtBands, {
    bottom: 0,
    top: 0.92,
    radiusBottom: 0.3,
    radiusTop: 0.21,
  });
  torso.add(shirt);

  const belt = mesh(new THREE.CylinderGeometry(0.262, 0.266, 0.05, 20), palette.belt, 'belt');
  belt.position.y = 0.42;
  torso.add(belt);

  const neckerchief = mesh(new THREE.ConeGeometry(0.17, 0.16, 20, 1, true), palette.neckerchief, 'neckerchief');
  neckerchief.position.y = 0.88;
  torso.add(neckerchief);
  character.add(torso);

  character.add(createArm(-1, palette), createArm(1, palette));
  character.add(createHead(palette));

  character.userData.height = CHARACTER_HEIGHT;
  return character;
}

/**
 * Applies a gentle idle animation (breathing, arm sway and looking around).
 * It is a pure function of `elapsed` seconds, so the same time always
 * produces the same pose.
 */
export function updateCharacterIdle(character, elapsed) {
  const torso = character.getObjectByName('torso');
  const head = character.getObjectByName('head');
  const leftArm = character.getObjectByName('leftArm');
  const rightArm = character.getObjectByName('rightArm');

  const breath = Math.sin(elapsed * 1.6);
  if (torso) {
    torso.scale.set(1 + breath * 0.012, 1 + breath * 0.008, 1 + breath * 0.012);
  }
  if (head) {
    head.position.y = 1.5 + breath * 0.006;
    head.rotation.y = Math.sin(elapsed * 0.35) * 0.35;
    head.rotation.x = Math.sin(elapsed * 0.5) * 0.04;
  }
  const sway = Math.sin(elapsed * 1.6 + 0.6) * 0.03;
  if (leftArm) {
    leftArm.rotation.z = -0.08 - sway;
    leftArm.rotation.x = sway * 0.5;
  }
  if (rightArm) {
    rightArm.rotation.z = 0.08 + sway;
    rightArm.rotation.x = -sway * 0.5;
  }
}
