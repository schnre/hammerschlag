import { defineConfig } from 'vite';

// Für GitHub Pages: BASE=/<repo-name>/ setzen (macht der Deploy-Workflow automatisch).
export default defineConfig({
  base: process.env.BASE ?? './',
  build: { target: 'es2021', sourcemap: false },
  test: { environment: 'node' },
});
