import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createCharacter, updateCharacterIdle, PLAYER_PARAMS } from './character.js';
import { generateCharacterParams } from './character-params.js';
import { createSkyTexture, SUN_DIRECTION } from './sky.js';
import { getMaterial } from './materials.js';

/**
 * Development page (characters.html, served by `npm run dev`): the player
 * and sample procedural characters of every variant standing in a row under the game's lighting, for
 * reviewing the character models. `?seed=N&variant=woman` shows a single
 * generated character instead; drag to orbit.
 */

const container = document.getElementById('lineup');
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const sky = createSkyTexture();
scene.background = sky;
scene.environment = sky;
scene.environmentIntensity = 0.85;
scene.add(new THREE.HemisphereLight(0xcfe0ea, 0x4d4a33, 0.35));
const sun = new THREE.DirectionalLight(0xfff0d8, 3.2);
sun.position.copy(SUN_DIRECTION).multiplyScalar(20);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 50 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02;
scene.add(sun);
const ground = new THREE.Mesh(new THREE.CircleGeometry(12, 48), getMaterial('stone'));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

/** Sample seeds for the procedural generator, one per variant (the camp's NPCs are premade models; see npcs.html). */
const SAMPLES = [
  { seed: 41, variant: 'woman' },
  { seed: 7, variant: 'elderWoman' },
  { seed: 23, variant: 'child', sex: 'female' },
  { seed: 12, variant: 'elderMan' },
  { seed: 62, variant: 'teen', sex: 'male' },
  { seed: 77, variant: 'man' },
];

const query = new URLSearchParams(window.location.search);
const entries = query.has('seed')
  ? [generateCharacterParams(Number(query.get('seed')), query.get('variant') ?? 'man')]
  : [PLAYER_PARAMS, ...SAMPLES.map((v) => generateCharacterParams(v.seed, v.variant, v.sex ? { sex: v.sex } : {}))];
const characters = entries.map((params, i) => {
  const character = createCharacter(params);
  character.position.x = (i - (entries.length - 1) / 2) * 0.9;
  scene.add(character);
  return character;
});

const camera = new THREE.PerspectiveCamera(30, container.clientWidth / container.clientHeight, 0.05, 100);
camera.position.set(0, 1.3, entries.length > 1 ? 9 : 3.2);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.95, 0);
controls.update();

/** Points the camera at character `index`: 'face' for a close-up, otherwise full length. */
function frame(index, shot = 'body', angle = 0) {
  const c = characters[index];
  const h = c.userData.dims.H;
  const target = c.position.clone().add(new THREE.Vector3(0, shot === 'face' ? h - c.userData.dims.headHeight * 0.45 : h * 0.52, 0));
  const distance = shot === 'face' ? 0.75 : h * 2.4;
  controls.target.copy(target);
  camera.position.copy(target).add(new THREE.Vector3(Math.sin(angle) * distance, shot === 'face' ? 0.02 : 0.1, Math.cos(angle) * distance));
  controls.update();
}

const timer = new THREE.Timer();
function render(elapsed = timer.getElapsed()) {
  for (const c of characters) updateCharacterIdle(c, elapsed);
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(() => {
  timer.update();
  render();
});
window.addEventListener('resize', () => {
  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.clientWidth, container.clientHeight);
});
window.lineup = { scene, camera, renderer, controls, characters, frame, render };
