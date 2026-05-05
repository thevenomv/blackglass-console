# Design tokens (reference)

Canonical definitions live in **`src/app/globals.css`**. Tailwind maps them in **`tailwind.config.ts`** (`bg.*`, `fg.*`, `accent.*`, etc.).

## Light shell (`data-theme="light"`)

| Token | Typical use |
| ----- | ----------- |
| `--bg-base` | Page background |
| `--bg-sidebar` | App sidebar |
| `--bg-panel` / `--bg-panel-elevated` | Cards, inputs, elevated surfaces |
| `--border-default` / `--border-subtle` | Dividers, table rules |
| `--text-primary` / `--text-muted` / `--text-faint` | Body copy hierarchy |
| `--accent-*` | Links, primary buttons, focus |
| `--success-*`, `--warning-*`, `--danger-*` | Status, pills, toasts |
| `--shadow-elevated` | Modals, popovers, toasts |
| `--focus-ring`, `--focus-offset` | `:focus-visible` |

## Dark shell (`data-theme="dark"`)

Same variable names; values swap to the dark slate palette in `globals.css`.

## Utilities

- **`bg-overlay-scrim`** — theme-aware backdrop (Command palette).
- **`.guide-article`** — long-form prose + `code` / `pre` styling for guides.

## Adding a token

1. Add `--my-token` under both theme blocks in `globals.css` (keep light/dark parity).
2. Expose in `tailwind.config.ts` if you need `bg-*` / `text-*` classes.
3. Document here in one line if it is part of the public design language.
