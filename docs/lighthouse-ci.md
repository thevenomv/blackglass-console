# Lighthouse CI (optional)

1. Install [`@lhci/cli`](https://github.com/GoogleChrome/lighthouse-ci) in a throwaway branch or use `npx @lhci/cli`.
2. Run `lhci autorun` against **`NEXT_PUBLIC_APP_URL`** after `npm run build && npm start` in CI, or against staging.
3. Track **performance / a11y / best-practices** budgets in `lighthouserc.json`; fail the job on regressions only when stable (SSR + auth skew scores).

There is no default `lighthouserc.json` in-tree — add one when you lock budgets for `/` and `/product`.
