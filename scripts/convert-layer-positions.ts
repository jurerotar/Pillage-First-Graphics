import { readFile, writeFile } from 'node:fs/promises';

const [inputPath, outputPath] = process.argv.slice(2);

if (!inputPath || !outputPath) {
  throw new Error(
    'Usage: npm run convert:layers -- <layers.csv> <layers.json>',
  );
}

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

const background = layers.find((layer) => layer.file === 'Background.avif');
if (background?.x !== 0 || background.y !== 0) {
  throw new Error('Expected Background.avif at (0, 0) to define the canvas');
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

await writeFile(
  outputPath,
  `${JSON.stringify({ canvas: { width, height }, unit: '%', layers: percentages }, null, 2)}\n`,
);
