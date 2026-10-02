import { Engine } from '@babylonjs/core';
import { Scene as AuthoredScene } from '../procedural/index.js';
import { createWorld, terrainHeight } from '../world.js';
import { collectColliders } from '../colliders.js';
import { SceneManager } from './SceneManager.js';
import { PhysicsManager } from './PhysicsManager.js';
import { InputManager } from './InputManager.js';
import { PlayerController } from './PlayerController.js';
import { CameraController } from './CameraController.js';
import { NPCManager } from './NPCManager.js';
import { InteractionSystem } from './InteractionSystem.js';

/**
 * The game: a Babylon.js engine and scene with the camp world, the player,
 * the villagers, the follow camera, physics and the main loop. Create one
 * with `await Game.create(container)` and call `start()`.
 */
export class Game {
  /**
   * `engine` defaults to a WebGL engine on a new canvas inside `container`
   * (tests pass a NullEngine); `havokOptions` are passed to the Havok
   * WebAssembly loader.
   */
  static async create(container, { promptElement = null, engine = null, havokOptions = undefined, keyTarget = globalThis.window } = {}) {
    let canvas = null;
    if (!engine) {
      canvas = document.createElement('canvas');
      canvas.className = 'game-canvas';
      container.appendChild(canvas);
      engine = new Engine(canvas, true, { stencil: true, powerPreference: 'high-performance' }, true);
      engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio || 1, 2));
    }
    const sceneManager = new SceneManager(engine);
    const physics = await PhysicsManager.create(sceneManager.scene, havokOptions);
    return new Game({ container, canvas, engine, sceneManager, physics, promptElement, keyTarget });
  }

  constructor({ container, canvas, engine, sceneManager, physics, promptElement, keyTarget }) {
    this.container = container;
    this.canvas = canvas;
    this.engine = engine;
    this.sceneManager = sceneManager;
    this.scene = sceneManager.scene;
    this.physics = physics;
    this.elapsed = 0;

    // World: authored as data, then built in Babylon with its colliders.
    this.authored = new AuthoredScene();
    this.world = createWorld(this.authored);
    sceneManager.build(this.authored);
    physics.addColliders(collectColliders(this.world), (node) => sceneManager.meshesFor(node));

    this.player = new PlayerController(sceneManager, physics);
    this.npcs = new NPCManager(sceneManager, physics);
    sceneManager.flushShadowCasters();

    this.cameraController = new CameraController(this.scene, { canvas, physics, focus: this.player.position });
    this.camera = this.cameraController.camera;

    this.input = new InputManager({ keyTarget, canvas });
    this.interaction = new InteractionSystem(this.scene, sceneManager, { promptElement, canvas });
    this.interaction.register(this.world);
    for (const npc of this.npcs.npcs) this.interaction.register(npc.character);

    this.onResize = () => this.engine.resize();
    globalThis.window?.addEventListener('resize', this.onResize);
  }

  /** Advances the game by `delta` seconds (defaults to the time since the last frame). */
  update(delta = this.engine.getDeltaTime() / 1000) {
    const step = Math.max(0, delta);
    this.elapsed += step;
    this.player.update(step, this.input.getIntent(), this.cameraController.yaw);
    this.npcs.update(this.elapsed, step);
    this.sceneManager.updateWorld(this.world, this.elapsed);
    // Follow the ground under the character, not jumps or crouches, so those read clearly.
    const { x, z } = this.player.position;
    this.cameraController.follow({ x, y: terrainHeight(x, z), z }, step);
    this.interaction.update(this.input.pointer);
  }

  start() {
    this.engine.runRenderLoop(() => {
      this.update();
      this.scene.render();
    });
  }

  dispose() {
    this.engine.stopRenderLoop();
    globalThis.window?.removeEventListener('resize', this.onResize);
    this.input.dispose();
    this.interaction.dispose();
    this.player.dispose();
    this.npcs.dispose();
    this.cameraController.dispose();
    this.physics.dispose();
    this.sceneManager.dispose();
    this.engine.dispose();
    this.canvas?.remove();
  }
}
