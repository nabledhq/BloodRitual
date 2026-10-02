import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    // three.js alone is ~550 kB minified; that is expected for this game.
    chunkSizeWarningLimit: 800,
  },
});
