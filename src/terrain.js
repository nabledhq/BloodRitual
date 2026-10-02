import { BufferAttribute, Mesh, MeshStandardMaterial, PlaneGeometry, Vector2 } from './procedural/index.js';
import { fbm, smoothstep, lerp, clamp01 } from './noise.js';
import { getTextureSet } from './textures.js';
import { LAYOUT } from './layout.js';

/** Side length of the square terrain in metres. */
export const WORLD_SIZE = 160;
/** Grid resolution of the terrain mesh (segments per side). */
export const TERRAIN_SEGMENTS = 160;
/** Ground layers blended by the terrain shader, in splat-weight order. */
export const GROUND_LAYERS = Object.freeze(['grass', 'dirt', 'mud']);
/** Metres covered by one repeat of a ground texture. */
const TEXTURE_METRES = 3.5;

/**
 * Normalised distance from the pond centre (1 is roughly the shoreline),
 * with a little noise so the bank is not a perfect ellipse.
 */
export function pondDistance(x, z) {
  const { pond } = LAYOUT;
  const d = Math.hypot((x - pond.x) / pond.rx, (z - pond.z) / pond.rz);
  return d + (fbm(x * 0.3, z * 0.3, { octaves: 2, seed: 9 }) - 0.5) * 0.25;
}

/**
 * Ground height at world (x, z). Florida is flat, so the variation is
 * gentle: low hummocks and hollows of about a metre, a flat trodden camp
 * clearing around the origin (exactly y = 0 there) and a bowl for the pond.
 */
export function terrainHeight(x, z) {
  const broad = fbm(x * 0.025 + 100, z * 0.025 + 100, { octaves: 4, seed: 7 }) - 0.5;
  const detail = fbm(x * 0.2, z * 0.2, { octaves: 3, seed: 8 }) - 0.5;
  let h = broad * 2.8 + detail * 0.3;
  const r = Math.hypot(x, z);
  h = lerp(0, h, smoothstep(LAYOUT.campRadius - 0.5, LAYOUT.campRadius + 9, r));
  const bowl = 1 - smoothstep(0.55, 1.35, pondDistance(x, z));
  return lerp(h, -1.05, bowl);
}

function distanceToSegment(px, pz, ax, az, bx, bz) {
  const abx = bx - ax;
  const abz = bz - az;
  const t = clamp01(((px - ax) * abx + (pz - az) * abz) / (abx * abx + abz * abz));
  return Math.hypot(px - (ax + abx * t), pz - (az + abz * t));
}

/**
 * Blend weights [grass, dirt, mud] at (x, z): trodden dirt around the camp,
 * the chickee and the path to the pond, mud on the banks and in hollows,
 * grass everywhere else. The weights always sum to 1.
 */
export function groundWeights(x, z, height = terrainHeight(x, z)) {
  const wobble = (fbm(x * 0.35, z * 0.35, { octaves: 3, seed: 21 }) - 0.5) * 3;
  const pd = pondDistance(x, z);
  const { chickee, firePit, canoe } = LAYOUT;

  let mud = 1 - smoothstep(1.02, 1.5, pd + wobble * 0.05);
  mud = Math.max(mud, smoothstep(-0.3, -0.65, height) * 0.8);

  const camp = 1 - smoothstep(3.5, 7.5, Math.hypot(x, z) + wobble);
  const home = 1 - smoothstep(2.5, 4.5, Math.hypot(x - chickee.x, z - chickee.z) + wobble * 0.5);
  const fire = 1 - smoothstep(1.2, 2.6, Math.hypot(x - firePit.x, z - firePit.z));
  const path = 1 - smoothstep(0.5, 1.3, distanceToSegment(x, z, -1, -1.5, canoe.x, canoe.z) + wobble * 0.15);
  let dirt = Math.max(camp, home, fire, path) * (1 - mud);
  dirt = clamp01(dirt);
  const grass = Math.max(0, 1 - mud - dirt);
  const sum = grass + dirt + mud || 1;
  return [grass / sum, dirt / sum, mud / sum];
}

/**
 * The terrain material description. The ground layers are blended per
 * vertex by the `splat` attribute; the engine (src/engine/TerrainMaterial.js)
 * builds a Babylon.js PBR material whose shader samples every layer and
 * blends them by height. `map` / `normalMap` carry the tiling.
 */
export function createTerrainMaterial() {
  const textures = Object.fromEntries(GROUND_LAYERS.map((name) => [name, getTextureSet(name)]));
  const repeat = WORLD_SIZE / TEXTURE_METRES;
  const map = textures.grass.map.clone();
  const normalMap = textures.grass.normalMap.clone();
  for (const t of [map, normalMap]) {
    t.repeat.set(repeat, repeat);
    t.needsUpdate = true;
  }
  const material = new MeshStandardMaterial({
    name: 'terrain',
    map,
    normalMap,
    normalScale: new Vector2(1.2, 1.2),
    roughness: 1,
    metalness: 0,
  });
  material.userData.layers = [...GROUND_LAYERS];
  material.userData.splat = { textures, repeat };
  return material;
}

/** Builds the height-varied, texture-blended terrain mesh. */
export function createTerrain() {
  const geometry = new PlaneGeometry(WORLD_SIZE, WORLD_SIZE, TERRAIN_SEGMENTS, TERRAIN_SEGMENTS);
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.attributes.position;
  const splat = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const z = position.getZ(i);
    const h = terrainHeight(x, z);
    position.setY(i, h);
    const w = groundWeights(x, z, h);
    splat[i * 3] = w[0];
    splat[i * 3 + 1] = w[1];
    splat[i * 3 + 2] = w[2];
  }
  geometry.setAttribute('splat', new BufferAttribute(splat, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  const terrain = new Mesh(geometry, createTerrainMaterial());
  terrain.name = 'ground';
  terrain.receiveShadow = true;
  return terrain;
}
