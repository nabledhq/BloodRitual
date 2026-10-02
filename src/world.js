import * as THREE from 'three';

export const SKY_COLOR = 0x9fc6d8;
export const WORLD_SIZE = 120;

/**
 * Small deterministic PRNG (mulberry32) so the world layout is identical on
 * every launch and in tests.
 */
export function createRng(seed = 1) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function standard(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0, ...extra });
}

function createLights() {
  const lights = new THREE.Group();
  lights.name = 'lights';

  const hemi = new THREE.HemisphereLight(0xdcefff, 0x4a5a2a, 1.2);
  hemi.name = 'skyLight';
  lights.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff1d6, 2.4);
  sun.name = 'sun';
  sun.position.set(8, 14, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -15;
  sun.shadow.camera.right = 15;
  sun.shadow.camera.top = 15;
  sun.shadow.camera.bottom = -15;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 40;
  sun.shadow.bias = -0.0005;
  lights.add(sun);

  return lights;
}

function createGround() {
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(WORLD_SIZE / 2, 64),
    standard(0x6b7f3a),
  );
  ground.name = 'ground';
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  return ground;
}

function createPond() {
  const pond = new THREE.Mesh(
    new THREE.CircleGeometry(4.5, 40),
    standard(0x3d6e7a, { roughness: 0.15, metalness: 0.1 }),
  );
  pond.name = 'pond';
  pond.rotation.x = -Math.PI / 2;
  pond.position.set(-7, 0.01, -6);
  pond.scale.set(1.4, 1, 1);
  pond.receiveShadow = true;
  return pond;
}

/** A chickee: the open-sided, palmetto-thatched shelter used by the Seminole. */
export function createChickee() {
  const chickee = new THREE.Group();
  chickee.name = 'chickee';
  const postMat = standard(0x6e4b2a);
  const width = 3.2;
  const depth = 2.4;
  const postHeight = 2.4;

  for (const x of [-width / 2, width / 2]) {
    for (const z of [-depth / 2, depth / 2]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, postHeight, 8), postMat);
      post.position.set(x, postHeight / 2, z);
      post.castShadow = true;
      chickee.add(post);
    }
  }

  // Raised sleeping platform.
  const platform = new THREE.Mesh(new THREE.BoxGeometry(width, 0.1, depth), standard(0x8a6a43));
  platform.name = 'platform';
  platform.position.y = 0.75;
  platform.castShadow = true;
  platform.receiveShadow = true;
  chickee.add(platform);

  // Four-sided thatched roof (a cone with 4 radial segments is a pyramid).
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1, 1.6, 4, 1), standard(0xb59a5a));
  roof.name = 'roof';
  roof.rotation.y = Math.PI / 4;
  roof.scale.set(width * 0.85, 1, depth * 0.85);
  roof.position.y = postHeight + 0.75;
  roof.castShadow = true;
  roof.receiveShadow = true;
  chickee.add(roof);

  return chickee;
}

function createCypress(rng) {
  const tree = new THREE.Group();
  tree.name = 'cypress';
  const height = 4 + rng() * 3;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.35, height, 8), standard(0x5a4632));
  trunk.position.y = height / 2;
  trunk.castShadow = true;
  tree.add(trunk);

  const foliageMat = standard(0x3f5f2a);
  for (let i = 0; i < 3; i++) {
    const clump = new THREE.Mesh(new THREE.SphereGeometry(0.9 + rng() * 0.5, 8, 6), foliageMat);
    clump.position.set((rng() - 0.5) * 1.2, height - 0.2 + i * 0.5, (rng() - 0.5) * 1.2);
    clump.scale.y = 0.6;
    clump.castShadow = true;
    tree.add(clump);
  }
  return tree;
}

function createSawgrass(rng, count) {
  const grass = new THREE.Group();
  grass.name = 'sawgrass';
  const blade = new THREE.ConeGeometry(0.05, 0.7, 4);
  const mat = standard(0x8f9a3c);
  for (let i = 0; i < count; i++) {
    const angle = rng() * Math.PI * 2;
    // Keep a clearing around the character at the origin.
    const radius = 4 + rng() * (WORLD_SIZE / 2 - 8);
    const tuft = new THREE.Group();
    tuft.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
    const blades = 3 + Math.floor(rng() * 3);
    for (let b = 0; b < blades; b++) {
      const m = new THREE.Mesh(blade, mat);
      const h = 0.7 + rng() * 0.6;
      m.scale.y = h / 0.7;
      m.position.set((rng() - 0.5) * 0.25, h / 2, (rng() - 0.5) * 0.25);
      m.rotation.set((rng() - 0.5) * 0.5, 0, (rng() - 0.5) * 0.5);
      tuft.add(m);
    }
    grass.add(tuft);
  }
  return grass;
}

/**
 * Populates `scene` with the starting camp: lights, ground, a pond, a
 * chickee, cypress trees and sawgrass. Returns the group that was added.
 */
export function createWorld(scene, { seed = 1907 } = {}) {
  const rng = createRng(seed);
  scene.background = new THREE.Color(SKY_COLOR);
  scene.fog = new THREE.Fog(SKY_COLOR, 25, 70);

  const world = new THREE.Group();
  world.name = 'world';
  world.add(createLights(), createGround(), createPond());

  const chickee = createChickee();
  chickee.position.set(4.5, 0, -3.5);
  chickee.rotation.y = -0.4;
  world.add(chickee);

  const trees = new THREE.Group();
  trees.name = 'trees';
  for (let i = 0; i < 14; i++) {
    const tree = createCypress(rng);
    const angle = rng() * Math.PI * 2;
    const radius = 12 + rng() * 30;
    tree.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
    trees.add(tree);
  }
  world.add(trees);

  world.add(createSawgrass(rng, 160));

  scene.add(world);
  return world;
}
