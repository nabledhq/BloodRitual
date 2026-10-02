import { describe, it, expect, beforeAll } from 'vitest';
import { NullEngine, Scene, TransformNode, ArcRotateCamera, Vector3 } from '@babylonjs/core';
import {
  locomotionState,
  locomotionWeights,
  blendWeights,
  cycleRate,
  AnimationController,
  CLIPS,
  BLEND_RATE,
} from '../src/engine/AnimationController.js';
import { orbitDirection, CameraController } from '../src/engine/CameraController.js';
import { collectColliders, SOLIDS } from '../src/colliders.js';
import { horizontalVelocity, cameraYaw } from '../src/movement.js';
import { createCharacter } from '../src/character.js';
import { createWorld } from '../src/world.js';
import { Scene as AuthoredScene } from '../src/procedural/index.js';
import { MOVEMENT } from '../src/config.js';

const sum = (w) => CLIPS.reduce((s, c) => s + w[c], 0);

describe('animation state selection', () => {
  it('idles when standing still or airborne', () => {
    expect(locomotionState({ speed: 0, grounded: true })).toBe('idle');
    expect(locomotionState({ speed: MOVEMENT.walkSpeed, grounded: false })).toBe('idle');
    expect(locomotionWeights({ speed: 0, grounded: true })).toEqual({ idle: 1, walk: 0, run: 0 });
  });

  it('walks at walking and crouching speed and runs when sprinting', () => {
    expect(locomotionState({ speed: MOVEMENT.crouchSpeed, grounded: true })).toBe('walk');
    expect(locomotionState({ speed: MOVEMENT.walkSpeed, grounded: true })).toBe('walk');
    expect(locomotionState({ speed: MOVEMENT.walkSpeed * MOVEMENT.sprintMultiplier, grounded: true })).toBe('run');
    expect(locomotionWeights({ speed: MOVEMENT.walkSpeed, grounded: true })).toEqual({ idle: 0, walk: 1, run: 0 });
    expect(locomotionWeights({ speed: MOVEMENT.walkSpeed * MOVEMENT.sprintMultiplier, grounded: true })).toEqual({ idle: 0, walk: 0, run: 1 });
  });

  it('mixes walk and run in between, always summing to 1', () => {
    const mid = MOVEMENT.walkSpeed * (1 + (MOVEMENT.sprintMultiplier - 1) / 2);
    const w = locomotionWeights({ speed: mid, grounded: true });
    expect(w.walk).toBeCloseTo(0.5, 6);
    expect(w.run).toBeCloseTo(0.5, 6);
    for (const speed of [0, 0.5, 1.4, 3, 4, 5.25, 9]) expect(sum(locomotionWeights({ speed, grounded: true }))).toBeCloseTo(1, 9);
  });

  it('cycles the stride faster when moving faster and slower with the longer run stride', () => {
    expect(cycleRate(3, 1.5, 0)).toBeCloseTo(2, 9);
    expect(cycleRate(6, 1.5, 0)).toBeCloseTo(4, 9);
    expect(cycleRate(3, 1.5, 1)).toBeLessThan(cycleRate(3, 1.5, 0));
  });
});

describe('blend weights', () => {
  it('interpolate smoothly over time instead of snapping', () => {
    let w = { idle: 1, walk: 0, run: 0 };
    const target = { idle: 0, walk: 1, run: 0 };
    const history = [];
    for (let i = 0; i < 30; i++) {
      w = blendWeights(w, target, 1 / 60);
      history.push(w.walk);
      expect(sum(w)).toBeCloseTo(1, 9);
    }
    // First frame: only a small step; then monotonically closer; ~0.25 s to (nearly) settle.
    expect(history[0]).toBeGreaterThan(0);
    expect(history[0]).toBeLessThan(0.25);
    for (let i = 1; i < history.length; i++) expect(history[i]).toBeGreaterThan(history[i - 1]);
    expect(history[14]).toBeGreaterThan(0.9);
  });

  it('do not depend on the frame rate', () => {
    const target = { idle: 0, walk: 0, run: 1 };
    let a = { idle: 1, walk: 0, run: 0 };
    let b = { ...a };
    for (let i = 0; i < 12; i++) a = blendWeights(a, target, 1 / 120);
    for (let i = 0; i < 3; i++) b = blendWeights(b, target, 1 / 30);
    expect(a.run).toBeCloseTo(b.run, 9);
    expect(a.run).toBeCloseTo(1 - Math.exp(-BLEND_RATE * 0.1), 9);
  });
});

describe('AnimationController (baked AnimationGroups)', () => {
  let scene;
  let character;
  let controller;
  let targets;
  beforeAll(() => {
    scene = new Scene(new NullEngine());
    scene.useRightHandedSystem = true;
    scene.useConstantAnimationDeltaTime = true;
    new ArcRotateCamera('camera', 0, 1, 3, Vector3.Zero(), scene);
    character = createCharacter();
    targets = new Map();
    character.traverse((node) => targets.set(node, new TransformNode(node.name, scene)));
    controller = AnimationController.forCharacter(scene, character, targets);
  });

  it('bakes idle, walk and run clips onto the character joints', () => {
    for (const clip of CLIPS) {
      const group = controller.clips[clip];
      expect(group.isPlaying, clip).toBe(true);
      expect(group.targetedAnimations.length).toBeGreaterThan(30);
    }
    const leg = targets.get(character.userData.rig.leftLeg);
    expect(controller.clips.walk.targetedAnimations.some((t) => t.target === leg && t.animation.targetProperty === 'rotationQuaternion')).toBe(true);
  });

  it('drives the group weights from speed, blending over several frames', () => {
    const seen = [];
    for (let i = 0; i < 20; i++) {
      controller.update(1 / 60, { speed: MOVEMENT.walkSpeed });
      seen.push(controller.clips.walk.weight);
    }
    expect(seen[0]).toBeLessThan(0.3);
    expect(seen[19]).toBeGreaterThan(0.95);
    expect(controller.clips.idle.weight + controller.clips.walk.weight + controller.clips.run.weight).toBeCloseTo(1, 6);
    // Walk and run share one stride cycle speed.
    expect(controller.clips.walk.speedRatio).toBe(controller.clips.run.speedRatio);
    expect(controller.clips.walk.speedRatio).toBeGreaterThan(0);
  });

  it('moves the joints when the blended clips are evaluated', () => {
    const leg = targets.get(character.userData.rig.leftLeg);
    const before = leg.rotationQuaternion.clone();
    for (let i = 0; i < 10; i++) scene.render();
    expect(leg.rotationQuaternion.equalsWithEpsilon(before, 1e-6)).toBe(false);
  });
});

describe('camera-relative input mapping', () => {
  it('moves "forward" in the direction the orbit camera looks', () => {
    const scene = new Scene(new NullEngine());
    scene.useRightHandedSystem = true;
    const controller = new CameraController(scene);
    for (const alpha of [0, 0.8, 2.5, -1.9]) {
      controller.camera.alpha = alpha;
      const toCamera = orbitDirection(alpha, controller.camera.beta);
      const v = horizontalVelocity({ forward: 1, right: 0 }, controller.yaw);
      const dir = new Vector3(v.x, 0, v.z).normalize();
      expect(Vector3.Dot(dir, new Vector3(-toCamera.x, 0, -toCamera.z).normalize())).toBeCloseTo(1, 6);
      // Matches the yaw from the camera's actual position.
      const position = controller.camera.target.add(toCamera.scale(controller.camera.radius));
      expect(Math.cos(controller.yaw - cameraYaw(position, controller.camera.target))).toBeCloseTo(1, 6);
    }
    expect(controller.camera).toBeInstanceOf(ArcRotateCamera);
  });
});

describe('colliders', () => {
  it('blocks buildings, props, trees and the terrain with simple shapes', () => {
    const world = createWorld(new AuthoredScene());
    const colliders = collectColliders(world);
    const names = new Set(colliders.map((c) => c.name));
    for (const name of ['post0', 'post5', 'platform', 'roof', 'firePit', 'mortar', 'woodpile', 'hull', 'stumpSeat', 'ground']) {
      expect(names.has(name), name).toBe(true);
    }
    const trunks = colliders.filter((c) => c.name.startsWith('cypress') || c.name.startsWith('cabbagePalm'));
    expect(trunks.length).toBe(PLANT_COUNT(world));
    const platform = colliders.find((c) => c.name === 'platform');
    expect(platform.size.x).toBeGreaterThan(4);
    expect(platform.centre.y + platform.size.y / 2).toBeGreaterThan(0.75);
    expect(Object.keys(SOLIDS)).toContain('roof');
  });
});

function PLANT_COUNT(world) {
  return ['cypress', 'cabbagePalm'].reduce((n, type) => n + world.getObjectByName(type).userData.instances.length, 0);
}
