import * as THREE from 'three';
import { MeshBuilder, compose, between, blob } from './geometry.js';
import { getMaterial } from './materials.js';
import { createRng } from './rng.js';
import { terrainHeight } from './terrain.js';
import { LAYOUT } from './layout.js';

/**
 * Small lived-in props for the camp: the star-shaped cooking fire with an
 * iron kettle, a sofkee mortar and pestle, baskets, a firewood pile and a
 * dugout canoe at the water's edge.
 */

function mesh(geometry, material, name, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geometry, typeof material === 'string' ? getMaterial(material) : material);
  m.name = name;
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

function placeOnGround(object, x, z, rotation = 0) {
  object.position.set(x, terrainHeight(x, z), z);
  object.rotation.y = rotation;
  return object;
}

/** Lathe profile helper: [[radius, y], ...] -> Vector2[] */
function profile(points) {
  return points.map(([r, y]) => new THREE.Vector2(r, y));
}

/**
 * The Seminole "star fire": long logs laid like spokes with their ends
 * meeting in the middle, pushed inwards as they burn. Includes a ring of
 * stones, glowing embers, flickering flames and an iron kettle.
 */
export function createFirePit(seed = 5) {
  const rng = createRng(seed);
  const fire = new THREE.Group();
  fire.name = 'firePit';

  const stones = new MeshBuilder();
  const ring = 11;
  for (let i = 0; i < ring; i++) {
    const a = (i / ring) * Math.PI * 2 + rng() * 0.2;
    const r = 0.13 + rng() * 0.06;
    stones.addGeometry(blob(r, { detail: 1, amount: 0.5, seed: seed + i }), compose([Math.cos(a) * 0.75, r * 0.4, Math.sin(a) * 0.75], [rng(), rng() * 3, rng()], [1.2, 0.7, 1]));
  }
  fire.add(mesh(stones.build(), 'stone', 'fireStones'));

  // Spoke logs: bark on the outer part, charred near the centre.
  const bark = new MeshBuilder();
  const charred = new MeshBuilder();
  const spokes = 5;
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2 + rng() * 0.2;
    const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const r = 0.06 + rng() * 0.02;
    const inner = dir.clone().multiplyScalar(0.12).setY(r + 0.04);
    const mid = dir.clone().multiplyScalar(0.55).setY(r + 0.02);
    const outer = dir.clone().multiplyScalar(1.5 + rng() * 0.4).setY(r);
    charred.addGeometry(new THREE.CylinderGeometry(r * 0.8, r, 1, 8), between(inner, mid));
    bark.addGeometry(new THREE.CylinderGeometry(r, r, 1, 8), between(mid, outer));
  }
  fire.add(mesh(bark.build(), 'log', 'fireLogs'), mesh(charred.build(), 'charred', 'fireLogsCharred'));

  const embers = mesh(blob(0.22, { detail: 1, amount: 0.6, seed: seed * 3 }), 'ember', 'embers', { cast: false });
  embers.scale.set(1.3, 0.35, 1.3);
  embers.position.y = 0.04;
  fire.add(embers);

  const flames = new THREE.Group();
  flames.name = 'flames';
  for (let i = 0; i < 5; i++) {
    const flame = mesh(new THREE.ConeGeometry(0.06 + rng() * 0.04, 0.35 + rng() * 0.25, 7, 1, true), 'flame', `flame${i}`, { cast: false, receive: false });
    const a = rng() * Math.PI * 2;
    flame.position.set(Math.cos(a) * 0.08, 0.2, Math.sin(a) * 0.08);
    flame.userData.phase = rng() * 10;
    flames.add(flame);
  }
  fire.add(flames);

  // Cast-iron kettle resting on the log ends.
  const kettle = new THREE.Group();
  kettle.name = 'kettle';
  const body = mesh(
    new THREE.LatheGeometry(profile([[0.0, 0], [0.12, 0.01], [0.2, 0.08], [0.22, 0.17], [0.19, 0.26], [0.2, 0.28], [0.18, 0.28]]), 20),
    'iron',
    'kettleBody',
  );
  const handle = mesh(new THREE.TorusGeometry(0.19, 0.008, 5, 20, Math.PI), 'iron', 'kettleHandle');
  handle.position.y = 0.28;
  kettle.add(body, handle);
  kettle.position.y = 0.16;
  fire.add(kettle);

  const light = new THREE.PointLight(0xff9b4a, 6, 7, 2);
  light.name = 'fireLight';
  light.position.y = 0.5;
  fire.add(light);

  fire.userData.interactive = { label: 'Cooking fire', prompt: 'A star fire: logs are pushed inward as they burn' };
  return fire;
}

/** Flicker the flames and fire light. Pure function of time. */
export function updateFirePit(fire, elapsed) {
  const flames = fire.getObjectByName('flames');
  if (flames) {
    for (const flame of flames.children) {
      const p = flame.userData.phase;
      const s = 0.85 + Math.sin(elapsed * 9 + p) * 0.12 + Math.sin(elapsed * 23 + p * 2) * 0.06;
      flame.scale.set(1, s, 1);
      flame.rotation.y = elapsed * 0.7 + p;
    }
  }
  const light = fire.getObjectByName('fireLight');
  if (light) light.intensity = 6 + Math.sin(elapsed * 11) * 0.8 + Math.sin(elapsed * 27.3) * 0.5;
}

/** Sofkee mortar (a hollowed cypress log) with its long pestle. */
export function createMortar() {
  const group = new THREE.Group();
  group.name = 'mortar';
  const mortar = mesh(
    new THREE.LatheGeometry(profile([[0.0, 0.5], [0.12, 0.5], [0.15, 0.68], [0.2, 0.7], [0.19, 0.4], [0.17, 0.2], [0.2, 0.02], [0.0, 0]]), 14),
    'log',
    'mortarLog',
  );
  const pestle = mesh(
    new THREE.LatheGeometry(profile([[0.0, 0], [0.04, 0.02], [0.035, 0.9], [0.07, 1.0], [0.08, 1.25], [0.05, 1.32], [0, 1.33]]), 10),
    'wood',
    'pestle',
  );
  pestle.position.set(0.02, 0.55, 0.0);
  pestle.rotation.z = 0.12;
  group.add(mortar, pestle);
  group.userData.interactive = { label: 'Sofkee mortar', prompt: 'Corn is pounded here for sofkee' };
  return group;
}

/** Woven palmetto/cane basket. */
export function createBasket(radius = 0.22, height = 0.3, name = 'basket') {
  const group = new THREE.Group();
  group.name = name;
  const body = mesh(
    new THREE.LatheGeometry(profile([[0, 0], [radius * 0.75, 0.0], [radius, height * 0.4], [radius * 0.92, height], [radius * 0.96, height * 1.04]]), 18),
    'basket',
    `${name}Body`,
  );
  const rim = mesh(new THREE.TorusGeometry(radius * 0.95, 0.015, 5, 18), 'basket', `${name}Rim`);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = height;
  group.add(body, rim);
  return group;
}

/** A neat pile of split firewood. */
export function createWoodpile(seed = 8) {
  const rng = createRng(seed);
  const builder = new MeshBuilder();
  const rows = [5, 4, 3];
  rows.forEach((count, row) => {
    for (let i = 0; i < count; i++) {
      const r = 0.07 + rng() * 0.02;
      const x = (i - (count - 1) / 2) * 0.17;
      builder.addGeometry(new THREE.CylinderGeometry(r, r, 1.1 + rng() * 0.2, 7), compose([x, 0.08 + row * 0.14, (rng() - 0.5) * 0.1], [Math.PI / 2, 0, rng() * 0.6]));
    }
  });
  const pile = mesh(builder.build(), 'log', 'woodpile');
  const group = new THREE.Group();
  group.name = 'woodpile';
  group.add(pile);
  return group;
}

/** A cypress dugout canoe with a paddle, pulled up on the bank. */
export function createCanoe() {
  const group = new THREE.Group();
  group.name = 'canoe';
  const length = 4.2;
  const hull = new THREE.SphereGeometry(1, 28, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  const pos = hull.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    // Pointed, slightly upturned ends.
    const end = Math.abs(z);
    const taper = 1 - Math.pow(end, 3) * 0.75;
    pos.setXYZ(i, x * taper * 0.36, y * 0.32 + Math.pow(end, 4) * 0.12, z * (length / 2));
  }
  hull.computeVertexNormals();
  const hullMesh = mesh(hull, canoeMaterial(), 'hull');
  hullMesh.position.y = 0.3;
  const gunwale = new THREE.TorusGeometry(1, 0.03, 5, 40);
  gunwale.rotateX(Math.PI / 2);
  gunwale.scale(0.34, 1, length / 2 - 0.05);
  const rim = mesh(gunwale, 'pole', 'gunwale');
  rim.position.y = 0.31;
  const paddle = new MeshBuilder();
  paddle.addGeometry(new THREE.CylinderGeometry(0.02, 0.02, 1.3, 6), compose([0, 0, 0], [0, 0, Math.PI / 2]));
  paddle.addGeometry(new THREE.BoxGeometry(0.45, 0.015, 0.14), compose([0.85, 0, 0]));
  const paddleMesh = mesh(paddle.build(), 'wood', 'paddle');
  paddleMesh.position.set(0.05, 0.12, 0.3);
  paddleMesh.rotation.set(0, 1.4, 0.05);
  group.add(hullMesh, rim, paddleMesh);
  group.userData.interactive = { label: 'Dugout canoe', prompt: 'Hollowed from a single cypress log' };
  return group;
}

let canoeMat = null;
function canoeMaterial() {
  if (!canoeMat) {
    canoeMat = getMaterial('wood').clone();
    canoeMat.name = 'canoeWood';
    canoeMat.side = THREE.DoubleSide;
    canoeMat.color.set(0xb09a82);
  }
  return canoeMat;
}

/** Builds every camp prop, already placed on the terrain. */
export function createProps() {
  const props = new THREE.Group();
  props.name = 'props';
  const { firePit, mortar, woodpile, canoe, chickee } = LAYOUT;

  props.add(placeOnGround(createFirePit(), firePit.x, firePit.z));
  props.add(placeOnGround(createMortar(), mortar.x, mortar.z, 0.4));
  props.add(placeOnGround(createWoodpile(), woodpile.x, woodpile.z, woodpile.rotation));

  const boat = placeOnGround(createCanoe(), canoe.x, canoe.z, canoe.rotation);
  boat.position.y -= 0.12;
  boat.rotation.z = 0.04;
  props.add(boat);

  const baskets = new THREE.Group();
  baskets.name = 'baskets';
  const b1 = placeOnGround(createBasket(0.24, 0.32, 'basket1'), chickee.x - 2.2, chickee.z + 2.3, 0.3);
  const b2 = placeOnGround(createBasket(0.17, 0.22, 'basket2'), chickee.x - 1.75, chickee.z + 2.55, 1.2);
  const b3 = placeOnGround(createBasket(0.3, 0.18, 'basket3'), mortar.x + 0.55, mortar.z - 0.25, 0.7);
  baskets.add(b1, b2, b3);
  props.add(baskets);

  // A few spare logs and a stump seat by the fire.
  const stump = mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.42, 12), 'log', 'stumpSeat');
  stump.position.set(firePit.x - 1.6, terrainHeight(firePit.x - 1.6, firePit.z + 0.9) + 0.21, firePit.z + 0.9);
  props.add(stump);

  return props;
}
