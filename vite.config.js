import { defineConfig } from 'vite';

export default defineConfig({
  // Havok locates its .wasm next to its own module; pre-bundling would move it.
  optimizeDeps: { exclude: ['@babylonjs/havok'] },
  build: {
    // Babylon.js is a large engine; one multi-megabyte chunk is expected for this game.
    chunkSizeWarningLimit: 6000,
  },
});
