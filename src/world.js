import * as THREE from 'three';
import { createRng } from './rng.js';
import { createSkyTexture, HORIZON_COLOR, SUN_DIRECTION } from './sky.js';
import { createTerrain, terrainHeight, WORLD_SIZE } from './terrain.js';
import { createVegetation } from './vegetation.js';
import { createChickee } from './structures.js';
import { createProps, updateFirePit } from './props.js';
import { getMaterial } from './materials.js';
import { LAYOUT, WATER_LEVEL } from './layout.js';

export { createRng, createChickee, terrainHeight, WORLD_SIZE };

/** Hazy horizon colour, shared by the sky and the fog (sRGB hex). */
export const SKY_COLOR = HORIZON_COLOR;
/** Linear fog distances: mild haze for depth, fully fogged before the terrain edge. */
export const FOG_NEAR = 22;
export const FOG_FAR = 78;

function createLights() {
  const lights = new THREE.Group();
  lights.name = 'lights';

  // Weak bounce fill; most ambient light comes from the sky environment map.
  const hemi = new THREE.HemisphereLight(0xcfe0ea, 0x4d4a33, 0.35);
  hemi.name = 'skyLight';
  lights.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff0d8, 3.2);
  sun.name = 'sun';
  const focus = new THREE.Vector3(0.5, 0, -2.5);
  sun.position.copy(focus).addScaledVector(SUN_DIRECTION, 35);
  sun.target.position.copy(focus);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const extent = 17;
  sun.shadow.camera.left = -extent;
  sun.shadow.camera.right = extent;
  sun.shadow.camera.top = extent;
  sun.shadow.camera.bottom = -extent;
  sun.shadow.camera.near = 5;
  sun.shadow.camera.far = 70;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.025;
  // Soft penumbra (PCF with a wider kernel).
  sun.shadow.radius = 3;
  sun.shadow.blurSamples = 12;
  lights.add(sun, sun.target);

  return lights;
}

function createPond() {
  const { pond } = LAYOUT;
  const water = new THREE.Mesh(new THREE.CircleGeometry(1, 64), getMaterial('water'));
  water.name = 'pond';
  water.rotation.x = -Math.PI / 2;
  water.position.set(pond.x, WATER_LEVEL, pond.z);
  water.scale.set(pond.rx * 1.5, pond.rz * 1.5, 1);
  water.receiveShadow = true;
  return water;
}

/**
 * Populates `scene` with the starting camp: sky and environment lighting,
 * fog, the sun, height-varied terrain, a pond, a chickee, camp props and
 * scattered native vegetation. Returns the group that was added.
 */
export function createWorld(scene, { seed = 1907 } = {}) {
  const sky = createSkyTexture();
  scene.background = sky;
  scene.environment = sky;
  scene.environmentIntensity = 0.85;
  scene.fog = new THREE.Fog(SKY_COLOR, FOG_NEAR, FOG_FAR);

  const world = new THREE.Group();
  world.name = 'world';
  world.add(createLights(), createTerrain(), createPond());

  const chickee = createChickee();
  const { x, z, rotation } = LAYOUT.chickee;
  chickee.position.set(x, terrainHeight(x, z), z);
  chickee.rotation.y = rotation;
  world.add(chickee);

  world.add(createProps());
  world.add(createVegetation(seed));

  scene.add(world);
  return world;
}

/** Per-frame ambient animation (fire flicker, water ripples). */
export function updateWorld(world, elapsed) {
  const fire = world.getObjectByName('firePit');
  if (fire) updateFirePit(fire, elapsed);
  const pond = world.getObjectByName('pond');
  if (pond) {
    // Drift the ripples (and the floating silt with them).
    for (const key of ['map', 'normalMap', 'roughnessMap']) {
      pond.material[key]?.offset.set(elapsed * 0.012, elapsed * 0.007);
    }
  }
}
