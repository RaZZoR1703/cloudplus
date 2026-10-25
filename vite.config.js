import { defineConfig } from 'vite';

// Relative base so the build works on GitHub Pages (/cloudplus/) and locally.
// three.js alone is ~600 kB minified (~155 kB gzip), so raise the warning limit.
export default defineConfig({ base: './', build: { chunkSizeWarningLimit: 800 } });
