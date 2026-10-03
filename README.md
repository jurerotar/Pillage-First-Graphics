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



# License

This project is licensed under a custom license. The graphics can only be used within the [Pillage First! (Ask Questions Later)](https://github.com/jurerotar/Pillage-First-Ask-Questions-Later) repository. Forks and derivative projects must provide their own graphical assets. For more details, see the [LICENSE.md](/LICENSE.md).
