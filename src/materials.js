import * as THREE from 'three';
import { getTextureSet, repeatedSet } from './textures.js';

/**
 * Shared physically based materials. Every material here is a
 * MeshStandardMaterial or MeshPhysicalMaterial with albedo, normal and
 * roughness maps, using muted natural colours.
 */

const cache = new Map();

function textured(setName, { repeat = null, color = 0xffffff, normalScale = 1, physical = false, ...extra } = {}) {
  const set = repeat ? repeatedSet(setName, ...[].concat(repeat)) : getTextureSet(setName);
  const params = {
    color,
    map: set.map,
    normalMap: set.normalMap,
    normalScale: new THREE.Vector2(normalScale, normalScale),
    roughnessMap: set.roughnessMap,
    roughness: 1,
    metalness: 0,
    ...extra,
  };
  return physical ? new THREE.MeshPhysicalMaterial(params) : new THREE.MeshStandardMaterial(params);
}

const FACTORIES = {
  thatch: () => textured('thatch', { repeat: [2, 1], side: THREE.DoubleSide }),
  thatchDark: () => textured('thatch', { repeat: [2, 1], color: 0xb8ad96, side: THREE.DoubleSide }),
  log: () => textured('bark', { repeat: [1, 2], color: 0xd9cfc2 }),
  wood: () => textured('wood', { repeat: [1, 1] }),
  pole: () => textured('wood', { repeat: [1, 0.25], color: 0xc9b8a0 }),
  charred: () => textured('charred'),
  palmTrunk: () => textured('bark', { repeat: [2, 6], color: 0xc4b8a6 }),
  cypressBark: () => textured('bark', { repeat: [2, 4], color: 0xe2cdb8 }),
  frond: () => textured('leaf', { side: THREE.DoubleSide }),
  frondDead: () => textured('leaf', { side: THREE.DoubleSide, color: 0xc49a6a }),
  palmetto: () => textured('leaf', { side: THREE.DoubleSide, color: 0xb9c2a0 }),
  sawgrass: () => textured('blade', { side: THREE.DoubleSide }),
  cypressFoliage: () => textured('foliage', { repeat: [2, 2] }),
  stone: () => textured('stone'),
  basket: () => textured('basket', { repeat: [2, 1] }),
  iron: () => textured('iron', { metalness: 0.6 }),
  blanket: () =>
    textured('fabric', { repeat: 3, color: 0x7a3b2e, physical: true, sheen: 0.6, sheenRoughness: 0.8, sheenColor: 0xd9b8a0 }),
  blanketBlue: () =>
    textured('fabric', { repeat: 3, color: 0x3c4a5e, physical: true, sheen: 0.6, sheenRoughness: 0.8, sheenColor: 0xb0b8c8 }),
  ember: () =>
    new THREE.MeshStandardMaterial({
      color: 0x2a140a,
      emissive: 0xff6a1a,
      emissiveIntensity: 2.2,
      roughness: 0.9,
      metalness: 0,
    }),
  flame: () =>
    new THREE.MeshStandardMaterial({
      color: 0x000000,
      emissive: 0xffa040,
      emissiveIntensity: 3,
      roughness: 1,
      metalness: 0,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    }),
  water: () => {
    const water = repeatedSet('water', 6);
    return new THREE.MeshPhysicalMaterial({
      // Tannin-stained Everglades water: dark tea colour, glossy surface.
      color: 0x27321f,
      roughness: 1,
      metalness: 0,
      map: water.map,
      normalMap: water.normalMap,
      roughnessMap: water.roughnessMap,
      normalScale: new THREE.Vector2(0.35, 0.35),
      transparent: true,
      opacity: 0.9,
      clearcoat: 0.6,
      clearcoatRoughness: 0.1,
    });
  },
};

export const MATERIAL_NAMES = Object.freeze(Object.keys(FACTORIES));

/** Returns the shared material called `name` (created on first use). */
export function getMaterial(name) {
  if (!FACTORIES[name]) throw new Error(`Unknown material "${name}"`);
  if (!cache.has(name)) {
    const material = FACTORIES[name]();
    material.name = name;
    cache.set(name, material);
  }
  return cache.get(name);
}

/**
 * Cotton cloth in the given colour (woven texture, soft sheen). Materials
 * are cached per colour so characters share them.
 */
export function fabricMaterial(color) {
  const key = `fabric:${color}`;
  if (!cache.has(key)) {
    const material = textured('fabric', {
      repeat: 2,
      color,
      physical: true,
      sheen: 0.5,
      sheenRoughness: 0.7,
      sheenColor: new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.5),
    });
    material.name = key;
    cache.set(key, material);
  }
  return cache.get(key);
}

/** Skin in the given tone (subtle pore texture, slightly glossy). */
export function skinMaterial(color) {
  const key = `skin:${color}`;
  if (!cache.has(key)) {
    const material = textured('skin', { repeat: 2, color, physical: true, sheen: 0.25, sheenRoughness: 0.5, sheenColor: 0xffd8c0 });
    material.name = key;
    cache.set(key, material);
  }
  return cache.get(key);
}

/** Plain smooth PBR material for small details (eyes, beads, hair). */
export function detailMaterial(color, roughness = 0.6) {
  const key = `detail:${color}:${roughness}`;
  if (!cache.has(key)) {
    const material = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });
    material.name = key;
    cache.set(key, material);
  }
  return cache.get(key);
}

/** True when `material` is lit and physically based. */
export function isPbrMaterial(material) {
  return Boolean(material && (material.isMeshStandardMaterial || material.isMeshPhysicalMaterial));
}

/**
 * Walks `root` and returns every mesh (including instanced meshes, lines and
 * points) whose material is not physically based. Objects flagged with
 * `userData.excludeFromMaterialAudit` (UI / debug helpers) are skipped.
 */
export function findNonPbrObjects(root) {
  const offenders = [];
  root.traverse((object) => {
    if (object.userData?.excludeFromMaterialAudit) return;
    if (!(object.isMesh || object.isLine || object.isPoints || object.isSprite)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    if (!materials.every(isPbrMaterial)) offenders.push(object);
  });
  return offenders;
}
