import { defineConfig } from 'vite';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';

// Tauri expects a fixed port and no screen clearing so Rust build output stays visible.
// publicDir is the repo `assets/` folder so `assets/habitats/fish/bowl/bg.png` is served at `/habitats/fish/bowl/bg.png`.
export default defineConfig({
  clearScreen: false,
  publicDir: 'assets',
  server: {
    port: 1420,
    strictPort: true,
    host: false,
    watch: { ignored: ['**/src-tauri/**'] },
  },
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  build: {
    target: 'es2022',
    minify: !process.env.TAURI_ENV_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
    assetsInlineLimit: 0,
  },
  plugins: [
    {
      // The 1024 px reference renders are for humans only; never ship them.
      name: 'webpets-strip-reference-art',
      closeBundle() {
        rmSync(resolve(__dirname, 'dist/reference'), { recursive: true, force: true });
      },
    },
  ],
});
