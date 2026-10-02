import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import { createWorld, createRng, createChickee, SKY_COLOR, updateWorld } from '../src/world.js';
import { findNonPbrObjects } from '../src/materials.js';
import { terrainHeight, groundWeights, applySplatShader, GROUND_LAYERS, WORLD_SIZE } from '../src/terrain.js';
import { PLANT_TYPES } from '../src/vegetation.js';
import { getTextureSet, TEXTURE_SET_NAMES } from '../src/textures.js';
import { LAYOUT } from '../src/layout.js';

describe('createRng', () => {
  it('is deterministic per seed and stays in [0, 1)', () => {
    const a = createRng(42);
    const b = createRng(42);
    const c = createRng(43);
    const seqA = Array.from({ length: 100 }, a);
    const seqB = Array.from({ length: 100 }, b);
    expect(seqA).toEqual(seqB);
    expect(Array.from({ length: 100 }, c)).not.toEqual(seqA);
    for (const v of seqA) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('createWorld', () => {
  let scene;
  let world;
  beforeAll(() => {
    scene = new THREE.Scene();
    world = createWorld(scene);
  });

  it('adds ground, lights and scenery to the scene', () => {
    expect(scene.children).toContain(world);
    for (const name of ['ground', 'pond', 'chickee', 'vegetation', 'trees', 'shrubs', 'grasses', 'props', 'sun', 'skyLight']) {
      expect(world.getObjectByName(name), name).toBeDefined();
    }
    expect(scene.fog).toBeInstanceOf(THREE.Fog);
    expect(scene.fog.color.getHex()).toBe(SKY_COLOR);
  });

  it('lights the scene with an HDR sky environment', () => {
    expect(scene.background).toBeInstanceOf(THREE.DataTexture);
    expect(scene.background.mapping).toBe(THREE.EquirectangularReflectionMapping);
    expect(scene.background.type).toBe(THREE.HalfFloatType);
    expect(scene.environment).toBe(scene.background);
  });

  it('has a sun with soft shadows that terrain, buildings and props receive and cast', () => {
    const sun = world.getObjectByName('sun');
    expect(sun.castShadow).toBe(true);
    expect(sun.shadow.mapSize.x).toBeGreaterThanOrEqual(2048);
    expect(sun.shadow.radius).toBeGreaterThan(1);
    expect(world.getObjectByName('ground').receiveShadow).toBe(true);
    const chickee = world.getObjectByName('chickee');
    for (const part of ['roof', 'posts', 'platform']) {
      const meshes = [];
      chickee.getObjectByName(part).traverse((o) => o.isMesh && meshes.push(o));
      expect(meshes.length, part).toBeGreaterThan(0);
      expect(meshes.every((m) => m.castShadow && m.receiveShadow), part).toBe(true);
    }
    const trees = [];
    world.getObjectByName('trees').traverse((o) => o.isInstancedMesh && trees.push(o));
    expect(trees.every((t) => t.castShadow)).toBe(true);
  });

  it('uses only lit, physically based materials on world objects', () => {
    const offenders = findNonPbrObjects(world).map((o) => `${o.name} (${o.material.type})`);
    expect(offenders).toEqual([]);
  });

  it('leaves a clearing around the origin for the character', () => {
    for (const group of world.getObjectByName('vegetation').children) {
      for (const plants of group.children) {
        for (const p of plants.userData.instances) {
          expect(Math.hypot(p.x, p.z)).toBeGreaterThan(3);
        }
      }
    }
  });

  it('produces the same layout for the same seed', () => {
    const a = createWorld(new THREE.Scene(), { seed: 7 });
    const b = createWorld(new THREE.Scene(), { seed: 7 });
    const layout = (w) => w.getObjectByName('cypress').userData.instances.map((p) => [p.x, p.z, p.variant]);
    expect(layout(b)).toEqual(layout(a));
  });

  it('animates the fire and the water', () => {
    updateWorld(world, 0);
    const flame = world.getObjectByName('flame0');
    const s0 = flame.scale.y;
    const offset0 = world.getObjectByName('pond').material.normalMap.offset.x;
    updateWorld(world, 1.3);
    expect(flame.scale.y).not.toBeCloseTo(s0, 4);
    expect(world.getObjectByName('pond').material.normalMap.offset.x).not.toBe(offset0);
  });

  it('places lived-in props near the chickee', () => {
    for (const name of ['firePit', 'kettle', 'mortar', 'baskets', 'woodpile', 'canoe', 'stumpSeat']) {
      expect(world.getObjectByName(name), name).toBeDefined();
    }
    const chickee = world.getObjectByName('chickee').position;
    const near = ['firePit', 'mortar', 'woodpile', 'basket1'].filter((n) => world.getObjectByName(n).position.distanceTo(chickee) < 9);
    expect(near.length).toBe(4);
  });
});

describe('terrain', () => {
  let ground;
  beforeAll(() => {
    ground = createWorld(new THREE.Scene()).getObjectByName('ground');
  });

  it('has non-flat height variation but a flat camp clearing', () => {
    const pos = ground.geometry.attributes.position;
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      min = Math.min(min, pos.getY(i));
      max = Math.max(max, pos.getY(i));
    }
    expect(max - min).toBeGreaterThan(1);
    expect(terrainHeight(0, 0)).toBeCloseTo(0, 5);
    expect(terrainHeight(2, -2)).toBeCloseTo(0, 5);
    // The pond sits in a hollow.
    expect(terrainHeight(LAYOUT.pond.x, LAYOUT.pond.z)).toBeLessThan(-0.5);
  });

  it('blends at least two ground materials through a splat attribute', () => {
    expect(ground.material.isMeshStandardMaterial).toBe(true);
    expect(ground.material.userData.layers).toEqual(GROUND_LAYERS);
    expect(GROUND_LAYERS.length).toBeGreaterThanOrEqual(2);
    const splat = ground.geometry.attributes.splat;
    expect(splat.itemSize).toBe(GROUND_LAYERS.length);
    const dominant = new Array(GROUND_LAYERS.length).fill(0);
    let blended = 0;
    for (let i = 0; i < splat.count; i++) {
      const w = [splat.getX(i), splat.getY(i), splat.getZ(i)];
      expect(w[0] + w[1] + w[2]).toBeCloseTo(1, 4);
      dominant[w.indexOf(Math.max(...w))]++;
      if (Math.max(...w) < 0.9) blended++;
    }
    for (const count of dominant) expect(count).toBeGreaterThan(100);
    expect(blended).toBeGreaterThan(100);
  });

  it('puts dirt in the camp, mud by the pond and grass in the wild', () => {
    expect(groundWeights(0, 0)[1]).toBeGreaterThan(0.8);
    const shore = groundWeights(LAYOUT.pond.x + LAYOUT.pond.rx, LAYOUT.pond.z);
    expect(shore[2]).toBeGreaterThan(0.5);
    expect(groundWeights(40, 40)[0]).toBeGreaterThan(0.5);
  });

  it('patches the standard shader to blend the layers', () => {
    const shader = {
      uniforms: THREE.UniformsUtils.clone(THREE.ShaderLib.standard.uniforms),
      vertexShader: THREE.ShaderLib.standard.vertexShader,
      fragmentShader: THREE.ShaderLib.standard.fragmentShader,
    };
    const sets = Object.fromEntries(GROUND_LAYERS.map((n) => [n, getTextureSet(n)]));
    applySplatShader(shader, sets);
    expect(shader.vertexShader).toContain('vSplat = splat;');
    expect(shader.fragmentShader).not.toContain('#include <map_fragment>');
    expect(shader.fragmentShader).not.toContain('#include <roughnessmap_fragment>');
    expect(shader.fragmentShader).toContain('gN * 2.0 - 1.0');
    expect(shader.uniforms.mudMap.value).toBe(sets.mud.map);
  });
});

describe('vegetation', () => {
  let vegetation;
  beforeAll(() => {
    vegetation = createWorld(new THREE.Scene()).getObjectByName('vegetation');
  });

  it('has at least two variants of every plant type, all of them used', () => {
    for (const type of Object.keys(PLANT_TYPES)) {
      const group = vegetation.getObjectByName(type);
      expect(group, type).toBeDefined();
      expect(group.userData.variantCount, type).toBeGreaterThanOrEqual(2);
      const used = new Set(group.userData.instances.map((p) => p.variant));
      expect(used.size, type).toBeGreaterThanOrEqual(2);
      expect(group.children.every((c) => c.isInstancedMesh)).toBe(true);
    }
  });

  it('randomises transforms so no two neighbours are identical', () => {
    for (const type of Object.keys(PLANT_TYPES)) {
      const instances = vegetation.getObjectByName(type).userData.instances;
      expect(instances.length, type).toBeGreaterThan(5);
      for (const p of instances) {
        let nearest = null;
        let best = Infinity;
        for (const q of instances) {
          if (q === p) continue;
          const d = (p.x - q.x) ** 2 + (p.z - q.z) ** 2;
          if (d < best) {
            best = d;
            nearest = q;
          }
        }
        const identical = Math.abs(nearest.scale - p.scale) < 1e-6 && Math.abs(nearest.rotationY - p.rotationY) < 1e-6;
        expect(identical, type).toBe(false);
      }
      const scales = instances.map((p) => p.scale);
      expect(Math.max(...scales) - Math.min(...scales), type).toBeGreaterThan(0.2);
    }
  });

  it('keeps plants on the terrain, out of deep water and inside the world', () => {
    for (const type of Object.keys(PLANT_TYPES)) {
      for (const p of vegetation.getObjectByName(type).userData.instances) {
        expect(Math.abs(p.x)).toBeLessThan(WORLD_SIZE / 2);
        expect(Math.abs(p.z)).toBeLessThan(WORLD_SIZE / 2);
        expect(p.y).toBeCloseTo(terrainHeight(p.x, p.z) - 0.04, 5);
      }
    }
  });
});

describe('createChickee', () => {
  const chickee = createChickee();

  it('is built from distinct posts, a raised platform and a roof', () => {
    const posts = chickee.getObjectByName('posts').children.filter((c) => c.isMesh);
    expect(posts.length).toBeGreaterThanOrEqual(4);
    const platform = chickee.getObjectByName('platform');
    expect(platform.getObjectByName('floor')).toBeDefined();
    const floorBox = new THREE.Box3().setFromObject(platform.getObjectByName('floor'));
    expect(floorBox.min.y).toBeGreaterThan(0.5);
    const roof = chickee.getObjectByName('roof');
    for (const name of ['thatchNorth', 'thatchSouth', 'ridgeCap']) expect(roof.getObjectByName(name), name).toBeDefined();
    expect(chickee.getObjectByName('frame')).toBeDefined();
    // Not a single box or cylinder.
    let meshes = 0;
    chickee.traverse((o) => o.isMesh && meshes++);
    expect(meshes).toBeGreaterThan(10);
  });

  it('has a pitched roof with visible thickness above the platform', () => {
    for (const name of ['thatchNorth', 'thatchSouth']) {
      const slope = chickee.getObjectByName(name);
      slope.geometry.computeBoundingBox();
      const box = slope.geometry.boundingBox;
      // Local y is the thickness direction of the slope.
      expect(box.max.y - box.min.y, name).toBeGreaterThanOrEqual(0.15);
      expect(Math.abs(slope.rotation.x), name).toBeGreaterThan(0.5);
    }
    const roofBox = new THREE.Box3().setFromObject(chickee.getObjectByName('roof'));
    const floorBox = new THREE.Box3().setFromObject(chickee.getObjectByName('floor'));
    expect(roofBox.min.y).toBeGreaterThan(floorBox.max.y + 0.5);
    expect(roofBox.max.y - roofBox.min.y).toBeGreaterThan(1.5);
  });
});

describe('procedural textures', () => {
  it('provides albedo, normal and roughness maps no larger than 2K', () => {
    for (const name of TEXTURE_SET_NAMES) {
      const set = getTextureSet(name);
      for (const kind of ['map', 'normalMap', 'roughnessMap']) {
        const tex = set[kind];
        expect(tex.isTexture, `${name}.${kind}`).toBe(true);
        expect(tex.image.width).toBeLessThanOrEqual(2048);
        expect(tex.image.height).toBeLessThanOrEqual(2048);
      }
      expect(set.map.colorSpace).toBe(THREE.SRGBColorSpace);
      expect(set.normalMap.colorSpace).toBe(THREE.NoColorSpace);
    }
  });
});
