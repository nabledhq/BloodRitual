import { ArcRotateCamera, Engine, Vector3 } from '@babylonjs/core';
import { CircleGeometry, DirectionalLight, HemisphereLight, Mesh, Scene as AuthoredScene } from './procedural/index.js';
import { createCharacter, PLAYER_PARAMS } from './character.js';
import { VILLAGERS } from './villagers.js';
import { generateCharacterParams } from './character-params.js';
import { createSky, SUN_DIRECTION } from './sky.js';
import { getMaterial } from './materials.js';
import { SceneManager } from './engine/SceneManager.js';
import { AnimationController } from './engine/AnimationController.js';

/**
 * Development page (characters.html, served by `npm run dev`): the player
 * and every villager standing in a row under the game's lighting, for
 * reviewing the character models. `?seed=N&variant=woman` shows a single
 * generated character instead; drag to orbit.
 */

const container = document.getElementById('lineup');
const canvas = document.createElement('canvas');
canvas.style.cssText = 'width:100%;height:100%;display:block;outline:none';
container.appendChild(canvas);
const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true }, true);
engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio || 1, 2));

const authored = new AuthoredScene();
authored.environment = authored.background = createSky();
authored.environmentIntensity = 0.85;
authored.add(new HemisphereLight(0xcfe0ea, 0x4d4a33, 0.35));
const sun = new DirectionalLight(0xfff0d8, 3.2);
sun.name = 'sun';
sun.position.copy(SUN_DIRECTION).multiplyScalar(20);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 50 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02;
authored.add(sun);
const ground = new Mesh(new CircleGeometry(12, 48), getMaterial('stone'));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
authored.add(ground);

const query = new URLSearchParams(window.location.search);
const entries = query.has('seed')
  ? [generateCharacterParams(Number(query.get('seed')), query.get('variant') ?? 'man')]
  : [PLAYER_PARAMS, ...VILLAGERS.map((v) => generateCharacterParams(v.seed, v.variant, v.sex ? { sex: v.sex } : {}))];
const characters = entries.map((params, i) => {
  const character = createCharacter(params);
  character.position.x = (i - (entries.length - 1) / 2) * 0.9;
  authored.add(character);
  return character;
});

const manager = new SceneManager(engine);
const { scene } = manager;
manager.build(authored);
manager.flushShadowCasters();
const animations = characters.map((c) => AnimationController.forCharacter(scene, c, manager.nodes));

const camera = new ArcRotateCamera('camera', Math.PI / 2, Math.PI / 2 - 0.04, entries.length > 1 ? 9 : 3.2, new Vector3(0, 0.95, 0), scene);
camera.fov = (30 * Math.PI) / 180;
camera.minZ = 0.05;
camera.maxZ = 250;
camera.attachControl(canvas, true);

/** Points the camera at character `index`: 'face' for a close-up, otherwise full length. */
function frame(index, shot = 'body', angle = 0) {
  const c = characters[index];
  const h = c.userData.dims.H;
  const target = new Vector3(c.position.x, shot === 'face' ? h - c.userData.dims.headHeight * 0.45 : h * 0.52, c.position.z);
  camera.target.copyFrom(target);
  camera.radius = shot === 'face' ? 0.75 : h * 2.4;
  camera.alpha = Math.PI / 2 + angle;
  camera.beta = Math.PI / 2 - (shot === 'face' ? 0.03 : 0.04);
}

engine.runRenderLoop(() => {
  for (const a of animations) a.update(engine.getDeltaTime() / 1000, { speed: 0 });
  scene.render();
});
window.addEventListener('resize', () => engine.resize());
window.lineup = { scene, camera, engine, characters, frame };
