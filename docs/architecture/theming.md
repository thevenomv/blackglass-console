# Theming & appearance

BLACKGLASS uses CSS custom properties (design tokens) on `document.documentElement` via `data-theme`:

| Value | Meaning |
| ----- | ------- |
| `light` | Default product shell (see `globals.css`). |
| `dark` | Alternate shell for low-light environments. |

## Persistence

- **Key:** `blackglass-theme` in `localStorage` (`"light"` \| `"dark"`).
- **First visit (no key):** the inline `beforeInteractive` script in `src/app/layout.tsx` applies **`prefers-color-scheme`** (`dark` if the OS prefers dark, otherwise `light`).
- After the user toggles theme in the sidebar, the key is set explicitly and overrides system preference until cleared.

## SSR / hydration

`<html>` renders with `suppressHydrationWarning` because the init script may change `data-theme` before React hydrates.

## Clerk

`ClerkProvider` sets shared `appearance.variables` (primary blue + neutrals) so sign-in aligns with the marketing/console palette. Embedded Clerk components may still look slightly different in dark console mode; a future improvement is to sync `appearance` from `useTheme()` via a small client wrapper.

## PWA / browser chrome

- `metadata.manifest` points to `/manifest.webmanifest` (light `theme_color` / `background_color`).
- `viewport.themeColor` matches the default light shell.

## Accessibility

- `color-scheme` on `html` follows `data-theme`.
- **`prefers-contrast: more`:** stronger borders, text, focus outlines, and drift-chart bar edges (see `globals.css`).

## White-label / forks

To ship a rebranded instance: replace token values under `:root[data-theme="light"]` and `:root[data-theme="dark"]`, or add a new `data-theme` block and extend `ThemeMode` in `ThemeProvider.tsx` plus the init script.

## Visual / pixel regression

CI runs `tests/e2e/theme-tokens.spec.ts` (computed CSS variables). For full screenshots, run locally (prefer Linux CI image for stable fonts):

```bash
npx playwright test --grep @pixel --update-snapshots
```

Default `npm run test:e2e` skips `@pixel` tests. Commit updated files under `tests/e2e/**/theme-visual.spec.ts-snapshots/`.
