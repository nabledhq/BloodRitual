import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createWorld, createRng, createChickee, SKY_COLOR } from '../src/world.js';

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
  it('adds ground, lights and scenery to the scene', () => {
    const scene = new THREE.Scene();
    const world = createWorld(scene);
    expect(scene.children).toContain(world);
    for (const name of ['ground', 'pond', 'chickee', 'trees', 'sawgrass', 'sun', 'skyLight']) {
      expect(world.getObjectByName(name), name).toBeDefined();
    }
    expect(scene.background.getHex()).toBe(SKY_COLOR);
    expect(scene.fog).toBeInstanceOf(THREE.Fog);
  });

  it('has a sun that casts shadows onto the ground', () => {
    const world = createWorld(new THREE.Scene());
    expect(world.getObjectByName('sun').castShadow).toBe(true);
    expect(world.getObjectByName('ground').receiveShadow).toBe(true);
  });

  it('leaves a clearing around the origin for the character', () => {
    const world = createWorld(new THREE.Scene());
    for (const group of ['trees', 'sawgrass']) {
      for (const item of world.getObjectByName(group).children) {
        const distance = Math.hypot(item.position.x, item.position.z);
        expect(distance).toBeGreaterThan(3);
      }
    }
  });

  it('produces the same layout for the same seed', () => {
    const a = createWorld(new THREE.Scene(), { seed: 7 });
    const b = createWorld(new THREE.Scene(), { seed: 7 });
    const positions = (w) => w.getObjectByName('trees').children.map((t) => t.position.toArray());
    expect(positions(b)).toEqual(positions(a));
  });
});

describe('createChickee', () => {
  it('has four posts, a platform and a roof', () => {
    const chickee = createChickee();
    expect(chickee.getObjectByName('roof')).toBeDefined();
    expect(chickee.getObjectByName('platform')).toBeDefined();
    const posts = chickee.children.filter((c) => c.geometry?.type === 'CylinderGeometry');
    expect(posts).toHaveLength(4);
  });
});
