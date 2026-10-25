import { defineConfig } from 'vite';

// Relative base so the build works on GitHub Pages (/cloudplus/) and locally.
// Two pages: the cinematic story at /, the earlier 3D city at /city/.
// three.js alone is ~600 kB minified (~155 kB gzip), so raise the warning limit.
export default defineConfig({
  base: './',
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: { input: { main: 'index.html', city: 'city/index.html' } },
  },
});
