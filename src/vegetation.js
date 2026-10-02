import { Color, ConeGeometry, CylinderGeometry, Group, InstancedMesh, LatheGeometry, Matrix4, Quaternion, Vector2, Vector3 } from './procedural/index.js';
import { MeshBuilder, compose, between, blob } from './geometry.js';
import { getMaterial } from './materials.js';
import { createRng } from './rng.js';
import { terrainHeight, pondDistance, groundWeights, WORLD_SIZE } from './terrain.js';
import { LAYOUT } from './layout.js';

/**
 * Native south Florida plants, each with several procedurally generated
 * variants. Every variant/material pair is one InstancedMesh, so hundreds
 * of plants cost only a handful of draw calls.
 */

const UP = new Vector3(0, 1, 0);

/** A palm fan (cabbage palm / saw palmetto): petiole plus radiating leaflets. */
function addFan(builder, petioleBuilder, rng, { base, yaw, pitch, petiole, leaflets, length, spread, droop, width = 0.05 }) {
  const forward = new Vector3(Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch), Math.cos(pitch) * Math.cos(yaw));
  const hastula = base.clone().addScaledVector(forward, petiole);
  if (petioleBuilder) {
    petioleBuilder.addGeometry(new CylinderGeometry(0.012, 0.02, 1, 5, 1), between(base, hastula, 1));
  }
  const side = new Vector3().crossVectors(forward, UP).normalize();
  if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
  const lift = new Vector3().crossVectors(side, forward).normalize();
  for (let i = 0; i < leaflets; i++) {
    const a = (i / (leaflets - 1) - 0.5) * spread + (rng() - 0.5) * 0.06;
    const dir = forward.clone().multiplyScalar(Math.cos(a)).addScaledVector(side, Math.sin(a)).addScaledVector(lift, 0.3 * Math.cos(a));
    dir.normalize();
    const len = length * (0.75 + 0.25 * Math.cos(a)) * (0.9 + rng() * 0.2);
    const sag = droop * (0.6 + 0.8 * Math.abs(Math.sin(a))) * (0.8 + rng() * 0.4);
    const points = [];
    for (let k = 0; k <= 3; k++) {
      const t = k / 3;
      points.push(hastula.clone().addScaledVector(dir, len * t).addScaledVector(UP, -sag * len * t * t));
    }
    const sideDir = new Vector3().crossVectors(dir, UP).normalize();
    if (sideDir.lengthSq() < 1e-6) sideDir.copy(side);
    builder.addStrip(points, sideDir, (t) => len * width * (t < 0.2 ? 0.3 + t * 3.5 : 1 - (t - 0.2) * 1.15));
  }
}

function cypressVariant(seed, { height, crown, spread }) {
  const rng = createRng(seed);
  const bark = new MeshBuilder();
  const leaves = new MeshBuilder();

  // Buttressed, tapering trunk (bald cypress flare at the base).
  const r0 = 0.22 + rng() * 0.08;
  const profile = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    const r = r0 * (1 + 1.4 * Math.exp(-t * 14)) * (1 - 0.8 * t) + 0.02;
    profile.push(new Vector2(r, t * height));
  }
  bark.addGeometry(new LatheGeometry(profile, 10));

  // Cypress knees poking out of the ground around the trunk.
  const knees = 3 + Math.floor(rng() * 4);
  for (let i = 0; i < knees; i++) {
    const a = rng() * Math.PI * 2;
    const d = 0.7 + rng() * 0.9;
    const h = 0.15 + rng() * 0.3;
    bark.addGeometry(new ConeGeometry(0.07 + rng() * 0.05, h, 6), compose([Math.cos(a) * d, h / 2 - 0.03, Math.sin(a) * d], [rng() * 0.3, 0, rng() * 0.3]));
  }

  // Branches and feathery foliage clumps on the upper trunk.
  const branches = 6 + Math.floor(rng() * 4);
  for (let i = 0; i < branches; i++) {
    const t = 0.45 + (i / branches) * 0.5;
    const y = t * height;
    const a = i * 2.4 + rng() * 0.6;
    const reach = spread * (1.1 - t * 0.7) * (0.7 + rng() * 0.5);
    const start = new Vector3(0, y, 0);
    const end = new Vector3(Math.cos(a) * reach, y + reach * 0.45, Math.sin(a) * reach);
    bark.addGeometry(new CylinderGeometry(0.025, 0.06, 1, 5), between(start, end));
    const size = crown * (0.75 + rng() * 0.5) * (1.15 - t * 0.4);
    const clump = blob(size, { detail: 1, amount: 0.5, seed: seed * 7 + i });
    leaves.addGeometry(clump, compose([end.x, end.y + size * 0.2, end.z], [0, rng() * 3, 0], [1.2, 0.62, 1.2]));
  }
  const top = crown * (0.8 + rng() * 0.3);
  leaves.addGeometry(blob(top, { detail: 1, amount: 0.5, seed: seed * 13 }), compose([0, height + top * 0.1, 0], [0, 0, 0], [1.1, 0.7, 1.1]));

  return [
    { geometry: bark.build(), material: 'cypressBark' },
    { geometry: leaves.build(), material: 'cypressFoliage' },
  ];
}

function cabbagePalmVariant(seed, { height, lean, fans }) {
  const rng = createRng(seed);
  const trunk = new MeshBuilder();
  const fronds = new MeshBuilder();
  const dead = new MeshBuilder();

  const profile = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    profile.push(new Vector2(0.19 + 0.04 * Math.exp(-t * 8) + 0.03 * t * t, t * height));
  }
  const trunkGeometry = new LatheGeometry(profile, 9);
  // Bend the trunk so it leans gently, as wind-swept cabbage palms do.
  const pos = trunkGeometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getY(i) / height;
    pos.setX(i, pos.getX(i) + lean * t * t * height);
  }
  trunkGeometry.computeVertexNormals();
  trunk.addGeometry(trunkGeometry);
  const crownTop = new Vector3(lean * height, height, 0);
  // Ragged leaf boots just below the crown.
  trunk.addGeometry(blob(0.32, { detail: 1, amount: 0.6, seed }), compose([crownTop.x, height - 0.15, 0], [0, 0, 0], [1, 1.4, 1]));

  for (let i = 0; i < fans; i++) {
    const yaw = (i / fans) * Math.PI * 2 * 2.618 + rng() * 0.4;
    const pitch = 0.9 - (i / fans) * 1.25 + (rng() - 0.5) * 0.2;
    addFan(fronds, fronds, rng, {
      base: crownTop.clone().add(new Vector3(0, 0.1, 0)),
      yaw,
      pitch,
      petiole: 0.9 + rng() * 0.5,
      leaflets: 22,
      length: 1.0 + rng() * 0.25,
      spread: 2.6,
      droop: 0.55,
      width: 0.045,
    });
  }
  // A few dead, hanging fronds forming the beginnings of a skirt.
  for (let i = 0; i < 4; i++) {
    addFan(dead, dead, rng, {
      base: crownTop.clone().add(new Vector3(0, -0.1, 0)),
      yaw: rng() * Math.PI * 2,
      pitch: -1.1 - rng() * 0.3,
      petiole: 0.5,
      leaflets: 18,
      length: 0.9,
      spread: 1.6,
      droop: 0.25,
      width: 0.04,
    });
  }
  return [
    { geometry: trunk.build(), material: 'palmTrunk' },
    { geometry: fronds.build(), material: 'frond' },
    { geometry: dead.build(), material: 'frondDead' },
  ];
}

function palmettoVariant(seed, { fans, size }) {
  const rng = createRng(seed);
  const leaves = new MeshBuilder();
  for (let i = 0; i < fans; i++) {
    const yaw = rng() * Math.PI * 2;
    addFan(leaves, leaves, rng, {
      base: new Vector3((rng() - 0.5) * 0.3, 0.02, (rng() - 0.5) * 0.3),
      yaw,
      pitch: 0.55 + rng() * 0.6,
      petiole: size * (0.5 + rng() * 0.5),
      leaflets: 17,
      length: size * (0.55 + rng() * 0.2),
      spread: 2.9,
      droop: 0.15,
      width: 0.05,
    });
  }
  return [{ geometry: leaves.build(), material: 'palmetto' }];
}

function tuftVariant(seed, { blades, height, splay, width, material }) {
  const rng = createRng(seed);
  const builder = new MeshBuilder();
  for (let i = 0; i < blades; i++) {
    const a = rng() * Math.PI * 2;
    const out = new Vector3(Math.cos(a), 0, Math.sin(a));
    const base = out.clone().multiplyScalar(rng() * 0.08);
    const h = height * (0.6 + rng() * 0.5);
    const tilt = splay * (0.3 + rng() * 0.7);
    const points = [];
    for (let k = 0; k <= 3; k++) {
      const t = k / 3;
      points.push(base.clone().addScaledVector(out, tilt * h * t * t).add(new Vector3(0, h * t * (1 - tilt * 0.3 * t), 0)));
    }
    const side = new Vector3(-out.z, 0, out.x).applyAxisAngle(out, (rng() - 0.5) * 0.8);
    builder.addStrip(points, side, (t) => width * (1 - t * 0.92));
  }
  return [{ geometry: builder.build(), material }];
}

/** Plant types, their variants and placement rules. */
export const PLANT_TYPES = Object.freeze({
  cypress: {
    group: 'trees',
    count: 44,
    spacing: 3.5,
    minRadius: 13,
    castShadow: true,
    scale: [0.8, 1.25],
    variants: () => [
      cypressVariant(101, { height: 10, crown: 1.3, spread: 2.2 }),
      cypressVariant(202, { height: 7, crown: 1.0, spread: 1.4 }),
      cypressVariant(303, { height: 12, crown: 1.5, spread: 2.8 }),
    ],
    // Cypress grow in wet ground: favour the pond and low hollows.
    suitability: (x, z, h) => (pondDistance(x, z) < 2.6 ? 1 : h < 0.1 ? 0.6 : 0.15),
  },
  cabbagePalm: {
    group: 'trees',
    count: 36,
    spacing: 3,
    minRadius: 9.5,
    castShadow: true,
    scale: [0.8, 1.2],
    variants: () => [
      cabbagePalmVariant(404, { height: 7.5, lean: 0.05, fans: 18 }),
      cabbagePalmVariant(505, { height: 5.5, lean: 0.18, fans: 15 }),
      cabbagePalmVariant(606, { height: 9, lean: -0.1, fans: 20 }),
    ],
    suitability: (x, z, h) => (h > -0.1 ? 1 : 0.2),
  },
  palmetto: {
    group: 'shrubs',
    count: 150,
    spacing: 1.6,
    minRadius: 8.5,
    castShadow: false,
    scale: [0.75, 1.3],
    variants: () => [palmettoVariant(707, { fans: 7, size: 1.0 }), palmettoVariant(808, { fans: 11, size: 1.25 })],
    suitability: (x, z, h) => (h > -0.2 ? 1 : 0.1),
  },
  sawgrass: {
    group: 'grasses',
    count: 340,
    spacing: 0.9,
    minRadius: 8,
    allowShallows: true,
    castShadow: false,
    scale: [0.7, 1.3],
    variants: () => [
      tuftVariant(909, { blades: 26, height: 1.5, splay: 0.35, width: 0.016, material: 'sawgrass' }),
      tuftVariant(1010, { blades: 18, height: 1.1, splay: 0.5, width: 0.014, material: 'sawgrass' }),
      tuftVariant(1111, { blades: 32, height: 1.8, splay: 0.25, width: 0.018, material: 'sawgrass' }),
    ],
    // Sawgrass marsh: wet margins and low ground.
    suitability: (x, z, h) => (pondDistance(x, z) < 2.2 ? 1 : h < -0.1 ? 0.8 : 0.08),
  },
  grassTuft: {
    group: 'grasses',
    count: 900,
    spacing: 0.55,
    minRadius: 4.5,
    castShadow: false,
    scale: [0.7, 1.4],
    variants: () => [
      tuftVariant(1212, { blades: 12, height: 0.35, splay: 0.6, width: 0.012, material: 'sawgrass' }),
      tuftVariant(1313, { blades: 16, height: 0.5, splay: 0.45, width: 0.01, material: 'sawgrass' }),
    ],
    suitability: (x, z, h) => groundWeights(x, z, h)[0],
  },
});

/** Areas kept free of plants: the camp, the chickee, the fire, the canoe and the walking path. */
export function isReserved(x, z) {
  const { chickee, firePit, canoe, walkPath, mortar, woodpile } = LAYOUT;
  if (Math.hypot(x - chickee.x, z - chickee.z) < 4.2) return true;
  if (Math.hypot(x - firePit.x, z - firePit.z) < 2.5) return true;
  if (Math.hypot(x - canoe.x, z - canoe.z) < 3) return true;
  if (Math.hypot(x - mortar.x, z - mortar.z) < 1.2) return true;
  if (Math.hypot(x - woodpile.x, z - woodpile.z) < 1.8) return true;
  const e = Math.hypot((x - walkPath.x) / (walkPath.rx + 1.2), (z - walkPath.z) / (walkPath.rz + 1.2));
  return e < 1;
}

function placeType(type, def, rng) {
  const placed = [];
  const half = WORLD_SIZE / 2 - 3;
  const variantCount = def.variantCount;
  let attempts = 0;
  while (placed.length < def.count && attempts < def.count * 60) {
    attempts++;
    // Denser near the camp (what the player sees), thinning out towards the fog.
    const radius = def.minRadius + Math.pow(rng(), def.falloff ?? 1.6) * (half * 1.3 - def.minRadius);
    const angle = rng() * Math.PI * 2;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    if (Math.abs(x) > half || Math.abs(z) > half) continue;
    if (Math.hypot(x, z) < def.minRadius || isReserved(x, z)) continue;
    const pd = pondDistance(x, z);
    if (pd < (def.allowShallows ? 0.95 : 1.2)) continue;
    const h = terrainHeight(x, z);
    if (rng() > def.suitability(x, z, h)) continue;
    if (placed.some((p) => (p.x - x) ** 2 + (p.z - z) ** 2 < def.spacing ** 2)) continue;
    placed.push({
      type,
      variant: Math.floor(rng() * variantCount),
      x,
      y: h - 0.04,
      z,
      rotationY: rng() * Math.PI * 2,
      scale: def.scale[0] + rng() * (def.scale[1] - def.scale[0]),
      tint: 0.86 + rng() * 0.22,
    });
  }
  return placed;
}

function buildInstanced(type, def, variants, instances) {
  const group = new Group();
  group.name = type;
  const matrix = new Matrix4();
  const color = new Color();
  variants.forEach((parts, variantIndex) => {
    const mine = instances.filter((p) => p.variant === variantIndex);
    if (mine.length === 0) return;
    for (const part of parts) {
      const mesh = new InstancedMesh(part.geometry, getMaterial(part.material), mine.length);
      mesh.name = `${type}-v${variantIndex}-${part.material}`;
      mine.forEach((p, i) => {
        matrix.compose(
          new Vector3(p.x, p.y, p.z),
          new Quaternion().setFromAxisAngle(UP, p.rotationY),
          new Vector3(p.scale, p.scale, p.scale),
        );
        mesh.setMatrixAt(i, matrix);
        color.setRGB(p.tint, p.tint * (0.97 + (p.tint - 0.86) * 0.15), p.tint * 0.95);
        mesh.setColorAt(i, color);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.castShadow = def.castShadow;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
  });
  group.userData = { type, variantCount: variants.length, instances };
  return group;
}

/**
 * Scatters every plant type across the terrain with randomised variant,
 * position, rotation, scale and tint. Returns a group containing `trees`,
 * `shrubs` and `grasses` groups, each holding one group per plant type.
 */
export function createVegetation(seed = 1907) {
  const rng = createRng(seed);
  const vegetation = new Group();
  vegetation.name = 'vegetation';
  const groups = {};
  for (const [type, spec] of Object.entries(PLANT_TYPES)) {
    const variants = spec.variants();
    const def = { ...spec, variantCount: variants.length };
    const instances = placeType(type, def, rng);
    if (!groups[spec.group]) {
      groups[spec.group] = new Group();
      groups[spec.group].name = spec.group;
      vegetation.add(groups[spec.group]);
    }
    groups[spec.group].add(buildInstanced(type, def, variants, instances));
  }
  return vegetation;
}
