import { writeFile } from 'node:fs/promises';
import { glob } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import sharp from 'sharp';

type Point = readonly [number, number];

type Edge = {
  end: Point;
  key: string;
  start: Point;
};

const buildingImagePatterns = [
  'src/graphic-packs/default/buildings/resources/*.{avif,png,webp}',
  'src/graphic-packs/default/buildings/village/*.{avif,png,webp}',
];

const pointKey = ([x, y]: Point) => `${x},${y}`;

const edgeKey = (start: Point, end: Point) =>
  `${start[0]},${start[1]}:${end[0]},${end[1]}`;

const polygonArea = (points: readonly Point[]) => {
  let area = 0;

  for (let i = 0; i < points.length; i += 1) {
    const [x1, y1] = points[i]!;
    const [x2, y2] = points[(i + 1) % points.length]!;
    area += x1 * y2 - x2 * y1;
  }

  return area / 2;
};

const perpendicularDistance = (
  point: Point,
  lineStart: Point,
  lineEnd: Point,
) => {
  const [x, y] = point;
  const [x1, y1] = lineStart;
  const [x2, y2] = lineEnd;
  const dx = x2 - x1;
  const dy = y2 - y1;

  if (dx === 0 && dy === 0) {
    return Math.hypot(x - x1, y - y1);
  }

  return Math.abs(dy * x - dx * y + x2 * y1 - y2 * x1) / Math.hypot(dx, dy);
};

const simplifyWithRamerDouglasPeucker = (
  points: readonly Point[],
  tolerance: number,
): Point[] => {
  if (points.length <= 2) {
    return [...points];
  }

  let maxDistance = 0;
  let splitIndex = 0;
  const firstPoint = points[0]!;
  const lastPoint = points.at(-1)!;

  for (let i = 1; i < points.length - 1; i += 1) {
    const distance = perpendicularDistance(points[i]!, firstPoint, lastPoint);

    if (distance > maxDistance) {
      splitIndex = i;
      maxDistance = distance;
    }
  }

  if (maxDistance <= tolerance) {
    return [firstPoint, lastPoint];
  }

  const left = simplifyWithRamerDouglasPeucker(
    points.slice(0, splitIndex + 1),
    tolerance,
  );
  const right = simplifyWithRamerDouglasPeucker(
    points.slice(splitIndex),
    tolerance,
  );

  return [...left.slice(0, -1), ...right];
};

const removeCollinearPoints = (points: readonly Point[]) =>
  points.filter((point, index) => {
    const previous = points[(index - 1 + points.length) % points.length]!;
    const next = points[(index + 1) % points.length]!;
    return (
      (point[0] - previous[0]) * (next[1] - point[1]) !==
      (point[1] - previous[1]) * (next[0] - point[0])
    );
  });

const simplifyClosedPath = (
  points: readonly Point[],
  tolerance: number,
): Point[] => {
  const withoutClosingPoint =
    points.length > 1 && pointKey(points[0]!) === pointKey(points.at(-1)!)
      ? points.slice(0, -1)
      : [...points];
  const withoutCollinearPoints = removeCollinearPoints(withoutClosingPoint);

  if (withoutCollinearPoints.length <= 3) {
    return withoutCollinearPoints;
  }

  const simplified = simplifyWithRamerDouglasPeucker(
    [...withoutCollinearPoints, withoutCollinearPoints[0]!],
    tolerance,
  ).slice(0, -1);

  return removeCollinearPoints(simplified);
};

const applyHorizontalMorphology = (
  mask: Uint8Array,
  width: number,
  height: number,
  radius: number,
  mode: 'dilate' | 'erode',
) => {
  const output = new Uint8Array(width * height);

  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * width;
    const prefixSums = new Uint32Array(width + 1);

    for (let x = 0; x < width; x += 1) {
      prefixSums[x + 1] = prefixSums[x]! + mask[rowOffset + x]!;
    }

    for (let x = 0; x < width; x += 1) {
      const start = Math.max(0, x - radius);
      const end = Math.min(width - 1, x + radius);
      const windowSize = end - start + 1;
      const sum = prefixSums[end + 1]! - prefixSums[start]!;
      output[rowOffset + x] =
        mode === 'dilate' ? Number(sum > 0) : Number(sum === windowSize);
    }
  }

  return output;
};

const applyVerticalMorphology = (
  mask: Uint8Array,
  width: number,
  height: number,
  radius: number,
  mode: 'dilate' | 'erode',
) => {
  const output = new Uint8Array(width * height);

  for (let x = 0; x < width; x += 1) {
    const prefixSums = new Uint32Array(height + 1);

    for (let y = 0; y < height; y += 1) {
      prefixSums[y + 1] = prefixSums[y]! + mask[y * width + x]!;
    }

    for (let y = 0; y < height; y += 1) {
      const start = Math.max(0, y - radius);
      const end = Math.min(height - 1, y + radius);
      const windowSize = end - start + 1;
      const sum = prefixSums[end + 1]! - prefixSums[start]!;
      output[y * width + x] =
        mode === 'dilate' ? Number(sum > 0) : Number(sum === windowSize);
    }
  }

  return output;
};

const closeMaskGaps = (
  mask: Uint8Array,
  width: number,
  height: number,
  radius: number,
) => {
  const horizontallyDilated = applyHorizontalMorphology(
    mask,
    width,
    height,
    radius,
    'dilate',
  );
  const dilated = applyVerticalMorphology(
    horizontallyDilated,
    width,
    height,
    radius,
    'dilate',
  );
  const horizontallyEroded = applyHorizontalMorphology(
    dilated,
    width,
    height,
    radius,
    'erode',
  );

  return applyVerticalMorphology(
    horizontallyEroded,
    width,
    height,
    radius,
    'erode',
  );
};

const traceAlphaOutlinePath = (
  data: Buffer,
  width: number,
  height: number,
  alphaThreshold = 16,
  simplificationTolerance = 5,
  gapClosingRadius = 8,
) => {
  // The PNG alpha channel is the source of truth for the clickable silhouette.
  const mask = new Uint8Array(width * height);

  for (let i = 0; i < width * height; i += 1) {
    mask[i] = data[i * 4 + 3]! >= alphaThreshold ? 1 : 0;
  }

  const closedMask = closeMaskGaps(mask, width, height, gapClosingRadius);

  const isOpaque = (x: number, y: number) =>
    x >= 0 &&
    x < width &&
    y >= 0 &&
    y < height &&
    closedMask[y * width + x] === 1;

  const edges: Edge[] = [];
  const edgesByStart = new Map<string, Edge[]>();

  const addEdge = (start: Point, end: Point) => {
    const edge: Edge = {
      end,
      key: edgeKey(start, end),
      start,
    };
    edges.push(edge);

    const key = pointKey(start);
    const existingEdges = edgesByStart.get(key);

    if (existingEdges) {
      existingEdges.push(edge);
    } else {
      edgesByStart.set(key, [edge]);
    }
  };

  // Trace boundary edges around opaque pixels, then join those edges into closed contours.
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!isOpaque(x, y)) {
        continue;
      }

      if (!isOpaque(x, y - 1)) {
        addEdge([x, y], [x + 1, y]);
      }
      if (!isOpaque(x + 1, y)) {
        addEdge([x + 1, y], [x + 1, y + 1]);
      }
      if (!isOpaque(x, y + 1)) {
        addEdge([x + 1, y + 1], [x, y + 1]);
      }
      if (!isOpaque(x - 1, y)) {
        addEdge([x, y + 1], [x, y]);
      }
    }
  }

  const visitedEdges = new Set<string>();
  const loops: Point[][] = [];

  for (const edge of edges) {
    if (visitedEdges.has(edge.key)) {
      continue;
    }

    const loop: Point[] = [edge.start];
    let currentEdge = edge;

    while (!visitedEdges.has(currentEdge.key)) {
      visitedEdges.add(currentEdge.key);
      loop.push(currentEdge.end);

      if (pointKey(currentEdge.end) === pointKey(loop[0]!)) {
        break;
      }

      const nextEdges = edgesByStart
        .get(pointKey(currentEdge.end))
        ?.filter((candidate) => !visitedEdges.has(candidate.key));

      if (!nextEdges || nextEdges.length === 0) {
        break;
      }

      currentEdge = nextEdges[0]!;
    }

    if (loop.length >= 4 && pointKey(loop[0]!) === pointKey(loop.at(-1)!)) {
      loops.push(loop);
    }
  }

  return loops
    .map((loop) => simplifyClosedPath(loop, simplificationTolerance))
    .map((loop) => ({
      area: polygonArea(loop),
      loop,
    }))
    .filter(({ area, loop }) => loop.length >= 3 && area >= 16)
    .sort((a, b) => b.area - a.area)
    .map(({ loop }) => {
      const [start, ...points] = loop;
      let d = `M${start![0]} ${start![1]}`;
      let [currentX, currentY] = start!;

      for (const [x, y] of points) {
        const dx = x - currentX;
        const dy = y - currentY;

        if (dx === 0) {
          d += `v${dy}`;
        } else if (dy === 0) {
          d += `h${dx}`;
        } else {
          d += `l${dx} ${dy}`;
        }

        currentX = x;
        currentY = y;
      }

      return `${d}z`;
    })
    .join('');
};

export const buildingOutlineExport =
  "export {\n  pillageFirstDefaultBuildingOutlines,\n  type PillageFirstBuildingOutline,\n} from './generated-building-outlines';";

export const generateBuildingOutlines = async () => {
  const imageFiles = (
    await Array.fromAsync(glob(buildingImagePatterns))
  ).sort();
  const outlinePath = resolve('src/generated-building-outlines.ts');
  const outlineEntries: string[] = [];

  for (const imageFile of imageFiles) {
    const { data, info } = await sharp(imageFile)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const source = relative('src', imageFile).replaceAll('\\', '/');
    const path = traceAlphaOutlinePath(data, info.width, info.height);

    outlineEntries.push(
      `  ${JSON.stringify(source)}: { width: ${info.width}, height: ${info.height}, path: ${JSON.stringify(path)} },`,
    );
  }

  await writeFile(
    outlinePath,
    `export type PillageFirstBuildingOutline = {
  readonly height: number;
  readonly path: string;
  readonly width: number;
};

export const pillageFirstDefaultBuildingOutlines: Record<
  string,
  PillageFirstBuildingOutline
> = {
${outlineEntries.join('\n')}
};
`,
  );
};
