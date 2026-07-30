# Gnosem brand assets (direction 2B — "Seal")

Closed ring + contained gnomon. Classical, coin-like, holds down to 16px.

## Files
| file | use |
| --- | --- |
| gnosem-mark.svg | primary mark, terracotta on light |
| gnosem-mark-ink.svg | mark in ink, single-colour light backgrounds |
| gnosem-mark-inverse.svg | mark on dark backgrounds |
| gnosem-lockup.svg | mark + wordmark, light background |
| gnosem-lockup-inverse.svg | mark + wordmark, dark background |
| favicon.svg | 16–64px app/tab icon, terracotta tile |
| favicon-ink.svg | favicon on ink tile |

## Colours
- ink `#15140F`
- paper `#FAF9F7`
- terracotta `#A2603F`

## Type
Wordmark is Newsreader, uppercase, 0.22em tracking. The lockup SVGs reference the
font by name — convert the `<text>` to outlines before shipping anywhere the font
isn't loaded (`npx svgo` won't do this; use a vector editor or `text-to-path`).

## Rules
- Clear space on all sides = radius of the ring.
- Never rotate the gnomon hand; the 1:30 angle is fixed.
- Never place the ring mark on a mid-tone; use the inverse or ink version.
- Below 20px use `favicon.svg` (thinner stroke), not the primary mark.

## HTML
```html
<link rel="icon" type="image/svg+xml" href="/brand/favicon.svg">
<img src="/brand/gnosem-lockup.svg" alt="Gnosem" height="32">
```

## README badge / dark-mode pair
```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="brand/gnosem-lockup-inverse.svg">
  <img src="brand/gnosem-lockup.svg" alt="Gnosem" height="40">
</picture>
```
