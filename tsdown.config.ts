import { defineConfig } from 'tsdown';
import { transform } from '@svgr/core';
import jsx from '@svgr/plugin-jsx';
import { optimize } from 'svgo';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { glob } from 'node:fs/promises';
import { pascalCase } from 'moderndash';
import { basename, join, resolve } from 'node:path';

const generateSvgComponents = async () => {
  const svgFiles = (await Array.fromAsync(glob('src/svg/*.svg'))).filter(f => !f.endsWith('.svgo.svg'));
  const outDir = resolve('src/generated-svgs');
  await mkdir(outDir, { recursive: true });

  const exports: string[] = [];

  for (const svgFile of svgFiles) {
    const fileName = basename(svgFile, '.svg');
    const componentName = `PillageFirst${pascalCase(fileName)}`;
    const svgCode = await readFile(svgFile, 'utf8');

    const optimizedSvg = optimize(svgCode, {
      path: svgFile,
      plugins: [
        { name: 'preset-default' },
      ],
    });

    const svgoPath = svgFile.replace(/\.svg$/, '.svgo.svg');
    await writeFile(svgoPath, optimizedSvg.data);

    const componentCode = await transform(
      optimizedSvg.data,
      {
        plugins: [jsx],
        exportType: 'named',
        namedExport: componentName,
        typescript: true,
        jsxRuntime: 'automatic',
      },
      { componentName },
    );

    const outPath = join(outDir, `${componentName}.tsx`);
    await writeFile(outPath, componentCode);

    exports.push(
      `export { ${componentName} } from './generated-svgs/${componentName}';`,
    );
  }

  const indexContent = `${exports.join('\n')}\n`;
  const indexPath = resolve('src/index.ts');
  await writeFile(indexPath, indexContent);
};

export default defineConfig({
  entry: ['src/index.ts'],
  format: 'esm',
  clean: true,
  dts: true,
  external: ['react', 'react/jsx-runtime'],
  hooks: (hooks) => {
    hooks.hook('build:prepare', async () => {
      await generateSvgComponents();
    });
  },
  copy: [
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
  ],
});
