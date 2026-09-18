import { defineConfig } from 'vite';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { webpetsDiag } from './tools/vite-diag-plugin';

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
    webpetsDiag(),
    {
      // Source and superseded art is for humans only; never ship it. `habitats-160x120` and the two
      // sprite reference folders are the retired pixel-art rounds, and the bitmap font went with the
      // chrome restyle; together they were about 4 MB of a 14 MB bundle that nothing loads.
      name: 'webpets-strip-unshipped-art',
      closeBundle() {
        for (const dir of ['reference', 'habitats-160x120', 'sprites/pets-80', 'sprites/strips-80', 'fonts']) {
          rmSync(resolve(__dirname, 'dist', dir), { recursive: true, force: true });
        }
      },
    },
  ],
});
