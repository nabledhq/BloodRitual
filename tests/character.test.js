import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createCharacter, updateCharacterIdle, CHARACTER_HEIGHT, DEFAULT_PALETTE } from '../src/character.js';

describe('createCharacter', () => {
  it('builds a character with named, animatable body parts', () => {
    const character = createCharacter();
    expect(character).toBeInstanceOf(THREE.Group);
    expect(character.name).toBe('character');
    for (const part of ['head', 'torso', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg', 'shirt', 'turban']) {
      expect(character.getObjectByName(part), part).toBeDefined();
    }
  });

  it('stands on the ground at roughly human height', () => {
    const box = new THREE.Box3().setFromObject(createCharacter());
    expect(box.min.y).toBeCloseTo(0, 2);
    expect(box.max.y).toBeCloseTo(CHARACTER_HEIGHT, 1);
    const size = box.getSize(new THREE.Vector3());
    expect(size.x).toBeLessThan(1);
    expect(size.z).toBeLessThan(1);
  });

  it('wears a patchwork shirt with one band per palette colour', () => {
    const shirt = createCharacter().getObjectByName('shirt');
    expect(shirt.children).toHaveLength(DEFAULT_PALETTE.shirtBands.length);
    shirt.children.forEach((band, i) => {
      expect(band.material.color.getHex()).toBe(DEFAULT_PALETTE.shirtBands[i]);
    });
  });

  it('accepts a custom palette', () => {
    const palette = { ...DEFAULT_PALETTE, turban: 0x123456 };
    const turban = createCharacter(palette).getObjectByName('turban');
    expect(turban.material.color.getHex()).toBe(0x123456);
  });

  it('casts shadows from its meshes', () => {
    const meshes = [];
    createCharacter().traverse((o) => o.isMesh && meshes.push(o));
    expect(meshes.length).toBeGreaterThan(10);
    expect(meshes.filter((m) => m.castShadow).length).toBeGreaterThan(meshes.length / 2);
  });
});

describe('updateCharacterIdle', () => {
  it('animates the pose over time', () => {
    const character = createCharacter();
    updateCharacterIdle(character, 0);
    const head0 = character.getObjectByName('head').rotation.y;
    const arm0 = character.getObjectByName('leftArm').rotation.z;
    updateCharacterIdle(character, 2.3);
    expect(character.getObjectByName('head').rotation.y).not.toBeCloseTo(head0, 5);
    expect(character.getObjectByName('leftArm').rotation.z).not.toBeCloseTo(arm0, 5);
  });

  it('is deterministic for a given time', () => {
    const a = createCharacter();
    const b = createCharacter();
    updateCharacterIdle(a, 5.5);
    updateCharacterIdle(b, 1.0);
    updateCharacterIdle(b, 5.5);
    expect(b.getObjectByName('head').rotation.y).toBe(a.getObjectByName('head').rotation.y);
    expect(b.getObjectByName('torso').scale.x).toBe(a.getObjectByName('torso').scale.x);
  });

  it('keeps the motion subtle so the character stays grounded', () => {
    const character = createCharacter();
    for (let t = 0; t < 20; t += 0.37) {
      updateCharacterIdle(character, t);
      const box = new THREE.Box3().setFromObject(character);
      expect(box.min.y).toBeGreaterThan(-0.02);
      expect(box.max.y).toBeLessThan(CHARACTER_HEIGHT + 0.1);
    }
  });
});
