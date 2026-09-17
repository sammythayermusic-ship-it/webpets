import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

describe('src/sim purity', () => {
  it('no runtime file in src/sim imports from outside src/sim', () => {
    const files = readdirSync(here).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
    expect(files.length).toBeGreaterThan(0);
    const re = /^\s*(?:import|export)\s[^;]*?\sfrom\s+['"]([^'"]+)['"]/gm;
    const bad: string[] = [];
    for (const f of files) {
      const src = readFileSync(join(here, f), 'utf8');
      for (const m of src.matchAll(re)) {
        const spec = m[1] ?? '';
        if (!spec.startsWith('./')) bad.push(`${f}: ${spec}`);
      }
      // side-effect imports and dynamic imports
      for (const m of src.matchAll(/import\s*\(\s*['"]([^'"]+)['"]\s*\)|^\s*import\s+['"]([^'"]+)['"]/gm)) {
        const spec = m[1] ?? m[2] ?? '';
        if (!spec.startsWith('./')) bad.push(`${f}: ${spec}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
