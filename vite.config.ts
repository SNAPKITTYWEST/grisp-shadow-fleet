import { cp, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  base: './',
  build: {
    emptyOutDir: true,
    outDir: '_site',
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      input: resolve(projectRoot, 'index.html'),
    },
    sourcemap: true,
    target: 'es2022',
  },
  plugins: [{
    name: 'preserve-dashboard-artifacts',
    apply: 'build',
    async closeBundle(): Promise<void> {
      const source = resolve(projectRoot, 'public');
      const destination = resolve(projectRoot, '_site', 'public');
      await mkdir(destination, { recursive: true });
      await cp(source, destination, { recursive: true, force: true });
      await cp(resolve(projectRoot, 'orchestrator.html'), resolve(projectRoot, '_site', 'orchestrator.html'), { force: true });
    },
  }],
  server: {
    host: '127.0.0.1',
    port: 4173,
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
  },
});
