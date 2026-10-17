import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
await mkdir('.test', { recursive: true });
await build({
  entryPoints: [
    'src/lib/segments.test.ts',
    'src/lib/host.test.ts',
    'src/lib/platform.test.ts',
    'src/lib/reader.test.ts',
    'src/lib/platform-page.test.ts',
    'src/lib/content.test.ts',
  ],
  outdir: '.test',
  outExtension: { '.js': '.mjs' },
  bundle: true,
  platform: 'node',
  packages: 'external',
  format: 'esm',
});
const result = spawnSync(
  process.execPath,
  [
    '--test',
    '.test/segments.test.mjs',
    '.test/host.test.mjs',
    '.test/platform.test.mjs',
    '.test/reader.test.mjs',
    '.test/platform-page.test.mjs',
    '.test/content.test.mjs',
  ],
  { stdio: 'inherit' },
);
process.exit(result.status ?? 1);
