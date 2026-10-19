# Pillage-First Graphics

**Pillage-First Graphics** provides graphical assets for the game [Pillage First! (Ask Questions Later)](https://github.com/jurerotar/Pillage-First-Ask-Questions-Later). This library includes SVG-based graphics, as well as organized image packs.

## Icon variants

Import the public icon stylesheet once, then apply a variant class to an icon:

```tsx
import { PillageFirstHorse } from '@pillage-first/graphics';
import '@pillage-first/graphics/icons.css';

<PillageFirstHorse className="pf-horse--paladin" />;
```

The horse and scroll variants set CSS custom properties on the rendered SVG. This lets every variant reference the same sprite definition when used with `react-icons-sprite`. `icons.css` also exposes the `--pf-tribe-color-*` tokens for other graphics.

## Resource layer positions

Percentage positions are exported from the package entry point:

```tsx
import {
  pillageFirstGraphicPackPositions,
  type PillageFirstLayerPosition,
  type PillageFirstGraphicPackLayout,
} from '@pillage-first/graphics';

const layout = pillageFirstGraphicPackPositions.default;

const wood = layout.layers.find(
  (layer) => layer.file === 'buildings/resources/wood-1.avif',
)!;

<img
  src={`graphic-packs/default/${wood.file}`}
  style={{
    position: 'absolute',
    left: `${wood.x}%`,
    top: `${wood.y}%`,
    width: `${wood.width}%`,
    height: `${wood.height}%`,
  }}
/>
```

Use a relatively positioned container with `aspect-ratio: 4096 / 2160`.
Image URLs in the example assume the package's static assets are served from
`graphic-packs/`. Layer filenames are relative to their graphic pack.
The layer array preserves CSV order; choose rendering order for your scene separately.

The `default` pack uses the rounded Valley bundle. Resource AVIFs replace the
previous PNGs in `buildings/resources/`. Scenery layers live at the pack root,
and the village placeholder is in `buildings/village/`. Each build converts
`src/graphic-packs/**/layers.csv` in the tsdown `build:prepare` hook and bundles
the generated metadata and TypeScript types into the package. Pack keys are
paths relative to `src/graphic-packs`. Images and their CSV must come from the
same export because crop bounds differ between bundles.

Each layout contains the original `canvas` dimensions, `unit: "%"`, and `layers`.
The background row defines the canvas size. Horizontal values are divided by
canvas width and multiplied by 100; vertical values use canvas height.
Positions and dimensions retain numeric precision and use percentage units.

# License

This project is licensed under a custom license. The graphics can only be used within the [Pillage First! (Ask Questions Later)](https://github.com/jurerotar/Pillage-First-Ask-Questions-Later) repository. Forks and derivative projects must provide their own graphical assets. For more details, see the [LICENSE.md](/LICENSE.md).
