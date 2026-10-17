import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
await mkdir('.test', { recursive: true });
await build({
  entryPoints: ['src/lib/segments.test.ts'],
  outfile: '.test/segments.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
});
const result = spawnSync(process.execPath, ['--test', '.test/segments.mjs'], { stdio: 'inherit' });
process.exit(result.status ?? 1);
