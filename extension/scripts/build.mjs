import { build, context } from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';
await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
await cp('public', 'dist', { recursive: true });
const options = {
  entryPoints: {
    panel: 'src/panel/main.tsx',
    background: 'src/background.ts',
    content: 'src/content.ts',
    preview: 'src/preview.tsx',
  },
  outdir: 'dist',
  bundle: true,
  format: 'iife',
  target: 'chrome116',
  minify: true,
  sourcemap: true,
  logLevel: 'info',
};
if (process.argv.includes('--watch')) {
  const session = await context(options);
  await session.watch();
} else await build(options);
