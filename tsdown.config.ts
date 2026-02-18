import { defineConfig } from 'tsdown';
import { transform } from '@svgr/core';
import jsx from '@svgr/plugin-jsx';
import { mkdir, readFile, copyFile, writeFile } from 'node:fs/promises';
import { glob } from 'node:fs/promises';
import { pascalCase } from 'moderndash';
import { basename, dirname, join, resolve } from 'node:path';

const generateSvgComponents = async () => {
  const svgFiles = await Array.fromAsync(glob('src/svg/*.svg'));
  const outDir = resolve('src/generated-svgs');
  await mkdir(outDir, { recursive: true });

  const exports: string[] = [];

  for (const svgFile of svgFiles) {
    const fileName = basename(svgFile, '.svg');
    const componentName = `PillageFirst${pascalCase(fileName)}`;
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
  watch: ['./src/svg/*.svg'],
  hooks: (hooks) => {
    hooks.hook('build:prepare', async () => {
      await generateSvgComponents();
    });
  },
  plugins: [
    {
      name: 'static-copy',
      async buildEnd() {
        const targets = [
          {
            src: 'src/graphic-packs/**/*.avif',
            dest: 'dist',
          },
          {
            src: 'src/public/**/*.png',
            dest: 'dist',
          },
          {
            src: 'src/public/**/*.svg',
            dest: 'dist',
          },
          {
            src: 'src/public/favicon/**/*',
            dest: 'dist',
          },
        ];

        for (const target of targets) {
          const files = await Array.fromAsync(glob(target.src));
          for (const file of files) {
            let relativePath = file;
            if (file.startsWith('src\\public\\')) {
              relativePath = file.replace('src\\public\\', '');
            } else if (file.startsWith('src/public/')) {
              relativePath = file.replace('src/public/', '');
            } else if (file.startsWith('src\\graphic-packs\\')) {
              relativePath = file.replace('src\\', '');
            } else if (file.startsWith('src/graphic-packs/')) {
              relativePath = file.replace('src/', '');
            }
            const destPath = join(target.dest, relativePath);
            await mkdir(dirname(destPath), { recursive: true });
            await copyFile(file, destPath);
          }
        }
      },
    },
  ],
});
