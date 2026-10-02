import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Box3, Color, SRGBColorSpace, Vector3 } from '../src/procedural/index.js';
import {
  createCharacter,
  measureProportions,
  measureArmSpan,
  characterMaterials,
  characterItems,
  bodyDimensions,
  CHARACTER_HEIGHT,
  PLAYER_PARAMS,
} from '../src/character.js';
import { updateCharacterIdle, updateCharacterWalk } from '../src/character-animation.js';
import { generateCharacterParams, faceVector, bodyVector, VARIANT_NAMES } from '../src/character-params.js';
import { SURFACE } from '../src/character-materials.js';
import { findNonPbrObjects } from '../src/materials.js';

const ADULTS = ['man', 'woman', 'elderMan', 'elderWoman'];

describe('generateCharacterParams', () => {
  it('covers the six required villager variants', () => {
    expect(VARIANT_NAMES).toEqual(expect.arrayContaining(['elderMan', 'elderWoman', 'man', 'woman', 'teen', 'child']));
  });

  // AC3 (b)
  it('gives identical parameters for the same seed', () => {
    for (const variant of VARIANT_NAMES) {
      expect(generateCharacterParams(1234, variant)).toEqual(generateCharacterParams(1234, variant));
    }
  });

  it('builds identical meshes for the same seed', () => {
    const a = createCharacter(generateCharacterParams(99, 'woman'));
    const b = createCharacter(generateCharacterParams(99, 'woman'));
    const positions = (c) => {
      const out = [];
      c.traverse((o) => o.isMesh && out.push(...o.geometry.attributes.position.array.slice(0, 60)));
      return out;
    };
    expect(positions(a)).toEqual(positions(b));
  });

  // AC3 (c)
  it('gives pairwise-distinct faces and bodies for six different seeds', () => {
    for (const variant of VARIANT_NAMES) {
      const people = [11, 22, 33, 44, 55, 66].map((seed) => generateCharacterParams(seed, variant));
      for (let i = 0; i < people.length; i++) {
        for (let j = i + 1; j < people.length; j++) {
          const fa = faceVector(people[i]);
          const fb = faceVector(people[j]);
          const faceDistance = Math.hypot(...fa.map((v, k) => v - fb[k]));
          expect(faceDistance, `${variant} faces ${i}/${j}`).toBeGreaterThan(0.1);
          expect(bodyVector(people[i]), `${variant} bodies ${i}/${j}`).not.toEqual(bodyVector(people[j]));
          expect(people[i].body.height).not.toBe(people[j].body.height);
        }
      }
    }
  });

  it('varies clothing colours between seeds', () => {
    const outfits = [1, 2, 3, 4, 5, 6].map((seed) => JSON.stringify(generateCharacterParams(seed, 'woman').clothing));
    expect(new Set(outfits).size).toBe(6);
  });

  it('makes faces slightly asymmetric', () => {
    for (const seed of [1, 2, 3]) {
      const { asymmetry } = generateCharacterParams(seed, 'man').face;
      expect(Object.values(asymmetry).some((v) => v !== 0)).toBe(true);
    }
    // The sculpted face is not mirror-perfect.
    const skull = createCharacter(generateCharacterParams(5, 'man')).getObjectByName('skull-skin');
    const pos = skull.geometry.attributes.position;
    let maxDiff = 0;
    const left = [];
    const right = [];
    for (let i = 0; i < pos.count; i++) (pos.getX(i) < 0 ? left : right).push([pos.getX(i), pos.getY(i), pos.getZ(i)]);
    expect(left.length).toBeGreaterThan(0);
    const extent = (list, axis) => Math.max(...list.map((p) => Math.abs(p[axis])));
    maxDiff = Math.abs(extent(left, 0) - extent(right, 0)) + Math.abs(extent(left, 2) - extent(right, 2));
    expect(maxDiff).toBeGreaterThan(1e-4);
  });

  it('uses Seminole skin tones: medium to deep warm browns', () => {
    for (let seed = 0; seed < 20; seed++) {
      const tone = new Color(generateCharacterParams(seed, 'man').skin.tone);
      const hsl = tone.getHSL({}, SRGBColorSpace);
      expect(hsl.h).toBeGreaterThan(0.03);
      expect(hsl.h).toBeLessThan(0.1);
      expect(hsl.l).toBeGreaterThan(0.2);
      expect(hsl.l).toBeLessThan(0.42);
    }
  });

  it('greys elders and adds more wrinkle detail with age', () => {
    const child = generateCharacterParams(3, 'child');
    const elder = generateCharacterParams(3, 'elderWoman');
    expect(elder.hair.gray).toBeGreaterThan(0.3);
    expect(child.hair.gray).toBe(0);
    expect(elder.skin.detail).toBeGreaterThan(child.skin.detail);
    expect(elder.skin.ageBucket).toBe('elder');
  });
});

describe('anatomy and proportions', () => {
  // AC3 (a): adults are 7-8 heads tall.
  for (const variant of ADULTS) {
    it(`gives a ${variant} a head between 1/8 and 1/7 of standing height`, () => {
      for (const seed of [1, 2, 3, 4]) {
        const params = generateCharacterParams(seed, variant);
        const m = measureProportions(createCharacter(params));
        expect(m.headRatio, `seed ${seed}`).toBeGreaterThanOrEqual(1 / 8);
        expect(m.headRatio, `seed ${seed}`).toBeLessThanOrEqual(1 / 7);
        expect(m.bodyHeight).toBeCloseTo(params.body.height, 1);
      }
    });
  }

  it('gives the player adult proportions and the expected height with turban', () => {
    const player = createCharacter(PLAYER_PARAMS);
    const m = measureProportions(player);
    expect(m.headRatio).toBeGreaterThanOrEqual(1 / 8);
    expect(m.headRatio).toBeLessThanOrEqual(1 / 7);
    expect(Math.abs(m.totalHeight - CHARACTER_HEIGHT)).toBeLessThan(0.05);
  });

  it('gives children and teens larger heads relative to height', () => {
    const child = measureProportions(createCharacter(generateCharacterParams(8, 'child')));
    const teen = measureProportions(createCharacter(generateCharacterParams(8, 'teen')));
    const adult = measureProportions(createCharacter(generateCharacterParams(8, 'man')));
    expect(child.headsTall).toBeLessThan(6.5);
    expect(child.headsTall).toBeGreaterThan(5.2);
    expect(teen.headsTall).toBeGreaterThan(child.headsTall);
    expect(adult.headsTall).toBeGreaterThan(teen.headsTall);
  });

  it('has an arm span roughly equal to height', () => {
    for (const variant of VARIANT_NAMES) {
      const character = createCharacter(generateCharacterParams(4, variant));
      const ratio = measureArmSpan(character) / measureProportions(character).bodyHeight;
      expect(ratio, variant).toBeGreaterThan(0.94);
      expect(ratio, variant).toBeLessThan(1.07);
    }
  });

  it('places knees and fingertips at realistic heights', () => {
    const params = generateCharacterParams(2, 'man');
    const character = createCharacter(params);
    character.updateMatrixWorld(true);
    const H = params.body.height;
    const knee = character.getObjectByName('leftKnee').getWorldPosition(new Vector3()).y;
    const hand = new Box3().setFromObject(character.getObjectByName('leftHand'), true);
    expect(knee / H).toBeGreaterThan(0.24);
    expect(knee / H).toBeLessThan(0.3);
    // Fingertips reach about mid-thigh.
    expect(hand.min.y / H).toBeGreaterThan(0.33);
    expect(hand.min.y / H).toBeLessThan(0.45);
  });

  it('builds a stooped elder', () => {
    const elder = createCharacter(generateCharacterParams(1, 'elderMan'));
    expect(elder.getObjectByName('torso').rotation.x).toBeGreaterThan(0.05);
  });

  it('derives all body lengths from the parameters', () => {
    const d = bodyDimensions(PLAYER_PARAMS);
    expect(d.kneeY).toBeLessThan(d.hipY);
    expect(d.hipY).toBeLessThan(d.waistY);
    expect(d.waistY).toBeLessThan(d.shoulderY);
    expect(d.shoulderY).toBeLessThan(d.chinY);
    expect(d.upperArm + d.forearm + d.hand).toBeCloseTo(d.armLength, 6);
  });
});

describe('face, skin, hair and eyes', () => {
  const character = createCharacter(generateCharacterParams(6, 'woman'));
  const items = characterItems(character);

  it('has ears, eyelids, eyelashes, eyebrows and separate iris, sclera and cornea', () => {
    for (const item of ['face', 'leftEar', 'rightEar', 'eyelid', 'eyelashes', 'eyebrow', 'leftIris', 'leftEye', 'leftCornea', 'hair']) {
      expect(items.has(item), item).toBe(true);
    }
    const kinds = Object.keys(characterMaterials(character));
    expect(kinds).toEqual(expect.arrayContaining(['skin', 'hair', 'sclera', 'iris', 'cornea']));
  });

  // AC3 (d)
  it('uses distinct materials for skin, hair, eyes and clothing with differing roughness or sheen', () => {
    const m = characterMaterials(character);
    const set = [m.skin, m.hair, m.sclera, m.iris, m.cornea, m.cotton];
    expect(new Set(set).size).toBe(set.length);
    const signature = (mat) => `${mat.roughness}/${mat.sheen ?? 0}`;
    expect(new Set(set.map(signature)).size).toBe(set.length);
    // Cloth is rough with sheen; skin is softer and smoother; eyes are glossy.
    expect(m.cotton.roughness).toBeGreaterThan(m.skin.roughness);
    expect(m.cotton.sheen).toBeGreaterThan(m.skin.sheen);
    expect(m.sclera.roughness).toBeLessThan(m.skin.roughness);
    expect(m.cornea.roughness).toBeLessThan(0.1);
    const man = characterMaterials(createCharacter(generateCharacterParams(6, 'man')));
    expect(man.wool.sheen).not.toBe(m.cotton.sheen);
    expect(man.leather.roughness).not.toBe(m.cotton.roughness);
    expect(man.leather.roughness).not.toBe(m.skin.roughness);
    for (const [kind, surface] of Object.entries(SURFACE)) {
      const mat = m[kind] ?? man[kind];
      if (mat) expect(mat.roughness, kind).toBe(surface.roughness);
    }
  });

  it('gives skin a detail normal map scaled by age, tone variation and softened shading', () => {
    const young = characterMaterials(createCharacter(generateCharacterParams(1, 'child'))).skin;
    const old = characterMaterials(createCharacter(generateCharacterParams(1, 'elderMan'))).skin;
    expect(young.normalMap).toBeTruthy();
    expect(old.normalScale.x).toBeGreaterThan(young.normalScale.x);
    expect(old.normalMap.image).not.toBe(young.normalMap.image);
    expect(young.vertexColors).toBe(true);
    expect(character.getObjectByName('skull-skin').geometry.attributes.color).toBeTruthy();
    // Subsurface-like wrap lighting, red shifted (red bleeds furthest).
    const { wrap } = young.userData.subsurface;
    expect(wrap[0]).toBeGreaterThan(wrap[1]);
    expect(wrap[1]).toBeGreaterThan(wrap[2]);
  });

  it('builds hair from alpha-tested strand cards and layers, not a solid helmet', () => {
    const hair = characterMaterials(character).hair;
    expect(hair.alphaTest).toBeGreaterThan(0);
    expect(hair.map.image.data.some((_, i, a) => i % 4 === 3 && a[i] < 128)).toBe(true);
    // Low-gloss shading: rough, weak specular and reflections.
    expect(hair.roughness).toBeGreaterThan(0.6);
    expect(hair.specularIntensity).toBeLessThan(0.5);
    expect(hair.envMapIntensity).toBeLessThan(0.5);
    const mesh = character.getObjectByName('skull-hair');
    // Many separate cards: far more triangles than a cap alone would need.
    expect(mesh.geometry.index.count / 3).toBeGreaterThan(400);
  });
});

describe('clothing and accessories', () => {
  it('dresses men in a banded big shirt with patchwork, a sash or belt, turban and moccasins', () => {
    const man = createCharacter(generateCharacterParams(1, 'elderMan'));
    const items = characterItems(man);
    for (const item of ['shirt', 'turban', 'moccasin']) expect(items.has(item), item).toBe(true);
    expect(items.has('sash') || items.has('belt')).toBe(true);
    const shirt = man.getObjectByName('garments-cotton');
    const colors = new Set();
    const c = shirt.geometry.attributes.color;
    for (let i = 0; i < c.count; i += 7) colors.add(`${c.getX(i).toFixed(2)},${c.getY(i).toFixed(2)},${c.getZ(i).toFixed(2)}`);
    // Body colour, trim bands and the two patchwork colours.
    expect(colors.size).toBeGreaterThanOrEqual(4);
  });

  it('dresses women in a cape blouse, long banded skirt and many strands of beads', () => {
    const params = generateCharacterParams(2, 'elderWoman');
    const woman = createCharacter(params);
    const items = characterItems(woman);
    for (const item of ['cape', 'skirt', 'beads', 'blouse']) expect(items.has(item), item).toBe(true);
    expect(items.has('turban')).toBe(false);
    expect(params.clothing.beadStrands).toBeGreaterThanOrEqual(10);
    // The skirt reaches the ankles.
    const skirt = new Box3().setFromObject(woman.getObjectByName('garments-cotton'), true);
    expect(skirt.min.y).toBeLessThan(params.body.height * 0.08);
  });

  it('scales beads to the body', () => {
    const params = generateCharacterParams(3, 'woman');
    const beads = createCharacter(params).getObjectByName('garments-beads');
    const box = new Box3().setFromObject(beads, true);
    const size = box.getSize(new Vector3());
    // A necklace collar a little wider than the neck, not a hoop.
    expect(size.x).toBeGreaterThan(params.body.height * 0.08);
    expect(size.x).toBeLessThan(params.body.height * 0.25);
  });

  it('layers garments over the body with normal-mapped folds and seams, distinct from skin', () => {
    const m = characterMaterials(createCharacter(generateCharacterParams(4, 'man')));
    for (const kind of ['cotton', 'wool', 'leather']) {
      expect(m[kind].normalMap, kind).toBeTruthy();
      expect(m[kind].roughnessMap, kind).toBeTruthy();
      expect(m[kind]).not.toBe(m.skin);
    }
  });

  // AC4
  it('contains no anachronistic items in character code', () => {
    const excluded = /denim|polyester|wrist ?watch|pocket ?watch|\bwatch(es)?\b|eye ?glasses|\bglasses\b|spectacles|zipper|nylon/i;
    const dir = fileURLToPath(new URL('../src/', import.meta.url));
    for (const file of readdirSync(dir).filter((f) => f.startsWith('character') || f === 'game.js' || f === 'lineup.js')) {
      expect(readFileSync(dir + file, 'utf8'), file).not.toMatch(excluded);
    }
    for (const variant of VARIANT_NAMES) {
      for (const seed of [1, 2, 3]) {
        const items = [...characterItems(createCharacter(generateCharacterParams(seed, variant)))].join(' ');
        expect(items).not.toMatch(excluded);
      }
    }
  });

  it('uses only physically based, textured materials', () => {
    for (const variant of VARIANT_NAMES) {
      const character = createCharacter(generateCharacterParams(9, variant));
      expect(findNonPbrObjects(character)).toEqual([]);
    }
  });

  it('keeps each character to a modest number of draw calls', () => {
    for (const variant of VARIANT_NAMES) {
      let meshes = 0;
      createCharacter(generateCharacterParams(1, variant)).traverse((o) => o.isMesh && meshes++);
      expect(meshes, variant).toBeLessThanOrEqual(26);
    }
  });
});

describe('updateCharacterIdle', () => {
  it('stands in a relaxed pose: arms down at the sides, elbows and fingers softly bent', () => {
    const character = createCharacter();
    updateCharacterIdle(character, 1.3);
    for (const side of ['left', 'right']) {
      const arm = character.getObjectByName(`${side}Arm`);
      // Not a T-pose: the arms hang within ~25 degrees of vertical.
      expect(Math.abs(arm.rotation.z)).toBeLessThan(0.45);
      expect(Math.abs(arm.rotation.z)).toBeGreaterThan(0.02);
      expect(character.getObjectByName(`${side}Elbow`).rotation.x).toBeLessThan(-0.05);
    }
    character.updateMatrixWorld(true);
    const hand = new Box3().setFromObject(character.getObjectByName('rightHand'), true);
    const shoulder = character.getObjectByName('rightArm').getWorldPosition(new Vector3());
    expect(hand.max.y).toBeLessThan(shoulder.y - 0.3);
  });

  it('breathes and shifts weight over time', () => {
    const character = createCharacter();
    const sample = (t) => {
      updateCharacterIdle(character, t);
      return {
        chest: character.getObjectByName('garments').scale.z,
        hips: character.getObjectByName('body').position.x,
        head: character.getObjectByName('head').rotation.y,
      };
    };
    const a = sample(0.5);
    const b = sample(2.6);
    const c = sample(5.3);
    expect(a.chest).not.toBeCloseTo(b.chest, 4);
    expect(new Set([a.hips, b.hips, c.hips].map((v) => v.toFixed(4))).size).toBeGreaterThan(1);
    expect(a.head).not.toBeCloseTo(c.head, 4);
  });

  it('is deterministic for a given time', () => {
    const a = createCharacter();
    const b = createCharacter();
    updateCharacterIdle(a, 5.5);
    updateCharacterIdle(b, 1.0);
    updateCharacterIdle(b, 5.5);
    expect(b.getObjectByName('head').rotation.y).toBe(a.getObjectByName('head').rotation.y);
    expect(b.getObjectByName('garments').scale.x).toBe(a.getObjectByName('garments').scale.x);
  });

  it('gives each villager their own rhythm', () => {
    const a = createCharacter(generateCharacterParams(1, 'woman'));
    const b = createCharacter(generateCharacterParams(2, 'woman'));
    updateCharacterIdle(a, 3);
    updateCharacterIdle(b, 3);
    expect(a.getObjectByName('head').rotation.y).not.toBeCloseTo(b.getObjectByName('head').rotation.y, 3);
  });

  it('keeps the motion subtle so every variant stays grounded', () => {
    for (const variant of VARIANT_NAMES) {
      const character = createCharacter(generateCharacterParams(3, variant));
      const top = measureProportions(character).totalHeight;
      for (let t = 0; t < 20; t += 0.73) {
        updateCharacterIdle(character, t);
        const box = new Box3().setFromObject(character, true);
        expect(box.min.y, variant).toBeGreaterThan(-0.02);
        expect(box.max.y, variant).toBeLessThan(top + 0.05);
      }
    }
  });
});

describe('updateCharacterWalk', () => {
  it('swings legs and arms in opposition', () => {
    const character = createCharacter();
    updateCharacterWalk(character, character.userData.strideLength / 4);
    const leftLeg = character.getObjectByName('leftLeg').rotation.x;
    const rightLeg = character.getObjectByName('rightLeg').rotation.x;
    const leftArm = character.getObjectByName('leftArm').rotation.x;
    expect(leftLeg).toBeLessThan(-0.2);
    expect(rightLeg).toBeGreaterThan(0.2);
    expect(Math.sign(leftArm)).toBe(-Math.sign(leftLeg));
  });

  it('runs with a longer stride, more knee lift, bent arms and a forward lean', () => {
    const walk = createCharacter();
    const run = createCharacter();
    let walkKnee = 0;
    let runKnee = 0;
    for (let d = 0; d < 3; d += 0.05) {
      updateCharacterWalk(walk, d, 0, { run: 0 });
      updateCharacterWalk(run, d, 0, { run: 1 });
      walkKnee = Math.max(walkKnee, walk.getObjectByName('leftKnee').rotation.x);
      runKnee = Math.max(runKnee, run.getObjectByName('leftKnee').rotation.x);
    }
    expect(runKnee).toBeGreaterThan(walkKnee * 1.5);
    expect(run.getObjectByName('leftElbow').rotation.x).toBeLessThan(-1);
    expect(run.getObjectByName('torso').rotation.x).toBeGreaterThan(walk.getObjectByName('torso').rotation.x);
  });

  it('keeps the feet on or above the ground through the cycle', () => {
    for (const variant of ['man', 'woman', 'child']) {
      const character = createCharacter(generateCharacterParams(1, variant));
      for (const run of [0, 1]) {
        for (let d = 0; d < 3; d += 0.1) {
          updateCharacterWalk(character, d, 0, { run });
          const box = new Box3().setFromObject(character, true);
          expect(box.min.y, `${variant} run=${run} d=${d}`).toBeGreaterThan(-0.03);
        }
      }
    }
  });
});
