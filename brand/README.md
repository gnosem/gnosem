# Gnosem brand

Master SVG assets. All shipped versions on gnosem.dev are generated from the same source in `src/brand.js` (kept in sync — the SVGs here are the authoritative visual reference).

## Palette

| Token | Value | Use |
|---|---|---|
| Ink | `#0F172A` | Text, outlines, on light backgrounds |
| Cream | `#F5F1EA` | Backgrounds, inverse text |
| Gold | `#B08D3E` | Accent line through the mark — the "shared memory" gesture |

Never introduce a fourth color. If the mark needs to sit on a color other than cream or ink, use the transparent-background inverse and let the surface show through.

## Assets in this folder

| File | Ratio | Use |
|---|---|---|
| [`mark.svg`](./mark.svg) | 1:1 | The mark alone on light backgrounds |
| [`mark-inverse.svg`](./mark-inverse.svg) | 1:1 | The mark alone on dark backgrounds |
| [`wordmark.svg`](./wordmark.svg) | 3.75:1 | The word "gnosem" (the "o" is the mark) |
| [`lockup-light.svg`](./lockup-light.svg) | 4.58:1 | Mark + wordmark, on light |
| [`lockup-dark.svg`](./lockup-dark.svg) | 4.58:1 | Mark + wordmark, on dark |
| [`favicon.svg`](./favicon.svg) | 1:1 | Cream-square favicon, renders at 16–32 px |
| [`og.svg`](./og.svg) | 1200×630 | OG/social preview card |

## Clear space

Reserve clear space equal to **the height of the mark's center dot** on every side.

- For the mark alone (64px viewBox): center dot has radius 4px, so keep ≥ 8px around the artwork.
- For the lockup: same rule, applied to the whole bounding box.

Never place other logos, text, or graphics inside the clear space. Never let the mark touch a page edge.

## Small sizes

- **Mark:** never smaller than **20 px** wide. Below that the center dot fuses with the stroke and reads as an unbroken ring.
- **Wordmark / lockup:** never smaller than **120 px** wide. The Georgia serif detail collapses below that; if you need something smaller, use the mark alone.
- **Favicon:** already tuned for 16–32 px. Use `favicon.svg` (not a scaled-down mark) at those sizes.

## Do / don't

**Do**
- Use SVG wherever possible — it stays crisp at any DPI.
- Use `lockup-dark.svg` (or `mark-inverse.svg`) on any surface darker than `#7a7568`.
- Keep the gold line horizontal and full-width. It's the load-bearing gesture of the brand.

**Don't**
- Don't recolor the mark. Ink + cream + gold, nothing else.
- Don't tilt, skew, add shadows, or "3-D" it.
- Don't set the wordmark in a font other than Georgia. The serif is deliberate — it's what keeps the mark from reading as a corporate startup logo.
- Don't animate on load. The mark is meant to feel like a printer's mark, not a splash screen.
- Don't crop the mark to just the horizontal line — the line is context-dependent on the circle.

## Where the assets are served

All SVGs above are also served at stable URLs from the Gnosem Worker:

| URL | File |
|---|---|
| `https://gnosem.dev/mark.svg` | mark.svg |
| `https://gnosem.dev/wordmark.svg` | wordmark.svg |
| `https://gnosem.dev/logo.svg` | lockup-light.svg (default) |
| `https://gnosem.dev/favicon.svg` | favicon.svg |
| `https://gnosem.dev/og.svg` | og.svg |

Source of truth for what actually ships is `src/brand.js`. This folder is the visual reference.
