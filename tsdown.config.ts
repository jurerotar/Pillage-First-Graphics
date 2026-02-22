import { defineConfig } from 'tsdown';
import { transform } from '@svgr/core';
import jsx from '@svgr/plugin-jsx';
import { mkdir, readFile, writeFile, stat, unlink, rm } from 'node:fs/promises';
import { glob } from 'node:fs/promises';
import { pascalCase } from 'moderndash';
import { basename, join, resolve } from 'node:path';

const generateSvgComponents = async () => {
  const svgFiles = (await Array.fromAsync(glob('src/svg/*.svg'))).filter(
    // Ignore inkscape source files
    (f) => !f.endsWith('.svgo.svg') && !f.endsWith('.inkscape.svg'),
  );
  const outDir = resolve('src/generated-svgs');
  await mkdir(outDir, { recursive: true });

  const exports: string[] = [];

  for (const svgFile of svgFiles) {
    const fileName = basename(svgFile, '.svg');
    const componentName = `PillageFirst${pascalCase(fileName)}`;
    const outPath = join(outDir, `${componentName}.tsx`);

    const svgStats = await stat(svgFile);
    let outStats;
    try {
      outStats = await stat(outPath);
    } catch {
      // ignore
    }

    if (outStats && outStats.mtimeMs > svgStats.mtimeMs) {
      exports.push(
        `export { ${componentName} } from './generated-svgs/${componentName}';`,
      );
      continue;
    }

    const svgCode = await readFile(svgFile, 'utf8');

    const componentCode = await transform(
      svgCode,
      {
        plugins: [jsx],
        exportType: 'named',
        namedExport: componentName,
        typescript: true,
        jsxRuntime: 'automatic',
      },
      { componentName },
    );

    await writeFile(outPath, `/* @ts-nocheck */\n${componentCode}`);

    exports.push(
      `export { ${componentName} } from './generated-svgs/${componentName}';`,
    );
  }

  // Cleanup orphaned files
  const generatedFiles = await Array.fromAsync(glob('src/generated-svgs/*.tsx'));
  const validComponentNames = new Set(
    svgFiles.map(
      (f) => `PillageFirst${pascalCase(basename(f, '.svg'))}.tsx`,
    ),
  );

  for (const file of generatedFiles) {
    if (!validComponentNames.has(basename(file))) {
      await unlink(file).catch(() => {});
    }
  }

  const indexContent = `${exports.join('\n')}\n`;
  const indexPath = resolve('src/index.ts');

  let currentIndexContent;
  try {
    currentIndexContent = await readFile(indexPath, 'utf8');
  } catch {
    // ignore
  }

  if (currentIndexContent !== indexContent) {
    await writeFile(indexPath, indexContent);
  }
};

const copyStaticFiles = async () => {
  const staticFiles = await Array.fromAsync(glob([
    'src/graphic-packs/**/*.avif',
    'src/public/**/*',
  ]));

  let latestMtime = 0;
  for (const file of staticFiles) {
    const s = await stat(file).catch(() => null);
    if (s && s.mtimeMs > latestMtime) latestMtime = s.mtimeMs;
  }

  const markerPath = join('dist', '.static-files-copied');
  const markerStats = await stat(markerPath).catch(() => null);

  if (!markerStats || markerStats.mtimeMs < latestMtime) {
    return true;
  }
  return false;
};

export default defineConfig({
  entry: ['src/index.ts'],
  format: 'esm',
  clean: false,
  dts: true,
  external: ['react', 'react/jsx-runtime'],
  hooks: (hooks) => {
    hooks.hook('build:prepare', async () => {
      await generateSvgComponents();
    });
    hooks.hook('build:done', async () => {
      await rm('src/generated-svgs', { recursive: true, force: true });
    });
  },
  copy: async () => {
    if (await copyStaticFiles()) {
      console.log('[tsdown] Copying static files...');

      return [
        { from: './src/graphic-packs/**/*.avif', flatten: false },
        {
          from: './src/public/favicon/**/*',
          to: './dist/favicon',
        },
        {
          from: [
            'src/public/**/*.png',
            'src/public/**/*.svg',
            '!src/public/favicon/**',
          ],
          to: './dist',
        },
      ];
    }
    console.log('[tsdown] Static files are up-to-date, skipping copy.');
    return [];
  },
});
