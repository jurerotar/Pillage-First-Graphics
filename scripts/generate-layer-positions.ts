import { glob, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, relative, resolve } from 'node:path';

const convertLayerPositions = async (inputPath: string) => {
  const [header, ...lines] = (await readFile(inputPath, 'utf8'))
    .replace(/^\uFEFF/, '')
    .trim()
    .split(/\r?\n/);

  if (header !== 'file,x,y,width,height') {
    throw new Error('Expected CSV header: file,x,y,width,height');
  }

  const files = new Set<string>();
  const layers = lines.map((line, index) => {
    const [file, ...values] = line.split(',');
    const numbers = values.map(Number);
    if (
      !file ||
      files.has(file) ||
      values.length !== 4 ||
      values.some((value) => value.trim() === '') ||
      numbers.some((value) => !Number.isFinite(value))
    ) {
      throw new Error(`Invalid or duplicate layer at CSV line ${index + 2}`);
    }
    files.add(file);
    const [x, y, width, height] = numbers as [number, number, number, number];
    if (x < 0 || y < 0 || width <= 0 || height <= 0) {
      throw new Error(`Invalid layer bounds: ${file}`);
    }
    return { file, x, y, width, height };
  });

  const background = layers.find(
    (layer) => basename(layer.file).toLowerCase() === 'background.avif',
  );
  if (background?.x !== 0 || background.y !== 0) {
    throw new Error('Expected background.avif at (0, 0) to define the canvas');
  }

  const { width, height } = background;
  const percentages = layers.map((layer) => {
    if (layer.x + layer.width > width || layer.y + layer.height > height) {
      throw new Error(`Layer extends beyond the canvas: ${layer.file}`);
    }
    return {
      file: layer.file,
      x: (layer.x / width) * 100,
      y: (layer.y / height) * 100,
      width: (layer.width / width) * 100,
      height: (layer.height / height) * 100,
    };
  });

  return { canvas: { width, height }, unit: '%' as const, layers: percentages };
};

export const layerPositionsExport =
  "export { pillageFirstGraphicPackPositions, type PillageFirstLayerPosition, type PillageFirstGraphicPackLayout } from './generated-layer-positions';";

export const generateLayerPositions = async () => {
  const csvFiles = (
    await Array.fromAsync(glob('src/graphic-packs/**/layers.csv'))
  ).sort();
  const packs: Record<
    string,
    Awaited<ReturnType<typeof convertLayerPositions>>
  > = {};
  for (const csvFile of csvFiles) {
    const pack = relative('src/graphic-packs', dirname(csvFile)).replaceAll(
      '\\',
      '/',
    );
    packs[pack] = await convertLayerPositions(csvFile);
  }
  await writeFile(
    resolve('src/generated-layer-positions.ts'),
    `export type PillageFirstLayerPosition = {
  readonly file: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

export type PillageFirstGraphicPackLayout = {
  readonly canvas: { readonly width: number; readonly height: number };
  readonly unit: '%';
  readonly layers: readonly PillageFirstLayerPosition[];
};

export const pillageFirstGraphicPackPositions: Readonly<Record<string, PillageFirstGraphicPackLayout>> = ${JSON.stringify(packs, null, 2)};
`,
  );
};
