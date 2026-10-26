import { defineConfig } from 'vite';

// Relative base so the build works on GitHub Pages (/cloudplus/) and locally.
// Pages: the particle river at /, the earlier 3D city at /city/; /next/ only redirects to /.
// three.js alone is ~600 kB minified (~155 kB gzip), so raise the warning limit.
export default defineConfig({
  base: './',
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: { input: { main: 'index.html', city: 'city/index.html', next: 'next/index.html' } },
  },
});
