import { build, context } from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
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
} else {
  await build(options);
  // Browsers without the Side Panel API must not require its permission/manifest key.
  await rm('dist-portable', { recursive: true, force: true });
  await cp('dist', 'dist-portable', { recursive: true });
  const manifest = JSON.parse(await readFile('public/manifest.json', 'utf8'));
  manifest.permissions = manifest.permissions.filter((permission) => permission !== 'sidePanel');
  delete manifest.side_panel;
  manifest.name += ' (Floating)';
  manifest.description =
    'Read webpages with local Bella speech, original-page highlights and an in-page reader.';
  await writeFile('dist-portable/manifest.json', JSON.stringify(manifest, null, 2) + '\n');
}
