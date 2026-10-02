import * as THREE from 'three';
import { getTextureSet, TEXTURE_SET_NAMES } from './src/textures.js';
import { createSkyTexture } from './src/sky.js';
import { createTerrain } from './src/terrain.js';
import { createVegetation } from './src/vegetation.js';
import { createProps } from './src/props.js';
import { createChickee } from './src/structures.js';
import { createCharacter } from './src/character.js';

const t = (label, fn) => {
  const s = performance.now();
  fn();
  console.log(label.padEnd(12), Math.round(performance.now() - s), 'ms');
};
t('textures', () => TEXTURE_SET_NAMES.forEach((n) => getTextureSet(n)));
t('sky', () => createSkyTexture());
t('terrain', () => createTerrain());
t('chickee', () => createChickee());
t('props', () => createProps());
t('vegetation', () => createVegetation(1907));
t('characters', () => [createCharacter(), createCharacter()]);
