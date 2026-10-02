import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createSkyTexture, SUN_DIRECTION } from './sky.js';
import { getMaterial } from './materials.js';
import { loadNpcAssets, createNpcBody } from './npc/assets.js';
import { AnimationController } from './npc/animation-controller.js';
import { ROLES } from './npc/roles.js';

/**
 * Development page (npcs.html, served by `npm run dev`): every NPC role's
 * look in a row under the game's lighting. `?action=farm` plays one action
 * on all of them; `?t=0.5` freezes it at that fraction of the clip. Press
 * M to step through every registered action.
 */

const container = document.getElementById('lineup');
const info = document.getElementById('info');
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

const camera = new THREE.PerspectiveCamera(30, container.clientWidth / container.clientHeight, 0.05, 100);
camera.position.set(0, 1.4, 10);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.95, 0);
controls.update();

const query = new URLSearchParams(window.location.search);
const assets = await loadNpcAssets();
const roles = Object.entries(ROLES);
const npcs = roles.map(([name, role], i) => {
  const body = createNpcBody(assets, role.look);
  body.position.x = (i - (roles.length - 1) / 2) * 1.1;
  scene.add(body);
  const controller = new AnimationController(body, assets.models.get(role.look.model).library, { idleVariants: [] });
  return { name, body, controller };
});

const actions = npcs[0].controller.library.actionNames();
let index = -1;
function show(action) {
  for (const npc of npcs) {
    npc.controller.stop();
    if (action !== 'idle') npc.controller.play(action, { duration: 1e9 });
  }
  const r = npcs[0].controller.library.resolve(action);
  info.textContent = `${action} -> ${r.clip}${r.fallback ? ` (fallback via ${r.via.join(' > ')})` : ''}`;
}
if (query.has('action')) show(query.get('action'));
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyM') show(actions[(index = (index + 1) % actions.length)]);
});

const freeze = query.has('t') ? Number(query.get('t')) : null;
const timer = new THREE.Timer();
function render() {
  timer.update();
  const dt = timer.getDelta();
  for (const npc of npcs) {
    npc.controller.update(freeze === null ? dt : 0.5);
    if (freeze !== null) {
      for (const layer of npc.controller.state.layers) {
        layer.clipAction.weight = 1;
        layer.clipAction.time = freeze * layer.clipAction.getClip().duration;
      }
      npc.controller.mixer.update(0);
    }
  }
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(render);
window.addEventListener('resize', () => {
  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.clientWidth, container.clientHeight);
});
window.npcLineup = { scene, camera, renderer, controls, npcs, show, assets };
