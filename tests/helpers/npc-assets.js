import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { loadNpcAssets } from '../../src/npc/assets.js';

const PUBLIC = fileURLToPath(new URL('../../public/', import.meta.url));

/**
 * Parses a GLB from public/ under Node. Images cannot be decoded without a
 * browser, so textures are replaced by empty ones; geometry, skins,
 * materials and animations load as in the game.
 */
export function loadGltfFromDisk(url) {
  const bytes = readFileSync(PUBLIC + url.replace(/^\//, ''));
  const loader = new GLTFLoader();
  loader.register(() => ({ name: 'test-texture-stub', loadTexture: () => Promise.resolve(new THREE.Texture()) }));
  return new Promise((resolve, reject) => {
    loader.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '', resolve, reject);
  });
}

let cached = null;

/** The NPC assets loaded from disk (parsed and retargeted once per test file). */
export function loadTestNpcAssets() {
  cached ??= loadNpcAssets({ load: loadGltfFromDisk });
  return cached;
}
