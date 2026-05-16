import coreWebVitals from "eslint-config-next/core-web-vitals";
import tseslint from "typescript-eslint";
import importPlugin from "eslint-plugin-import";

/** @type {import("eslint").Linter.Config[]} */
const eslintConfig = [
  {
    ignores: [
      "**/canvases/**",
      "**/.next/**",
      "**/node_modules/**",
      "**/out/**",
      "**/playwright-report/**",
      "**/test-results/**",
      "**/coverage/**",
      "**/scripts/_scratch/**",
    ],
  },
  ...coreWebVitals,

  // --------------------------------------------------------------------------
  // @typescript-eslint — high-signal rules only. Most of the codebase already
  // passes `tsc --noEmit` so we add the rules that catch issues TS can't
  // express. Configured as warnings first to avoid breaking the verify gate.
  // --------------------------------------------------------------------------
  {
    files: ["src/**/*.ts", "src/**/*.tsx", "tests/**/*.ts", "scripts/**/*.ts"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
      },
    },
    plugins: {
      "@typescript-eslint": tseslint.plugin,
    },
    rules: {
      // `any` is occasionally legitimate (e.g. third-party shims) but should
      // be flagged so it's an explicit decision rather than a leak.
      "@typescript-eslint/no-explicit-any": "warn",
      // Banning unused imports / vars catches dead code that survives a
      // refactor; tests are allowed to keep imports for setup-side-effects.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
      // Don't double-report on TS's noUnusedLocals/Parameters.
      "no-unused-vars": "off",
    },
  },

  // --------------------------------------------------------------------------
  // eslint-plugin-import — enforce architectural rules at import time. We
  // intentionally do NOT enable `import/order` (large autofix diff for
  // marginal benefit) or `import/no-cycle` globally (expensive; run it as a
  // standalone check in verify:contract if needed).
  // --------------------------------------------------------------------------
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    plugins: {
      import: importPlugin,
    },
    settings: {
      "import/resolver": {
        typescript: { project: "./tsconfig.json" },
        node: { extensions: [".js", ".jsx", ".ts", ".tsx"] },
      },
    },
    rules: {
      // Catches typos in import specifiers that TS still resolves via
      // `paths` but reach for a file that doesn't exist.
      "import/no-unresolved": "off", // TS already reports this; avoid double-runs
      // Banning self-imports — a common copy-paste artefact.
      "import/no-self-import": "error",
      // Banning empty/named-default mixed-up imports.
      "import/no-empty-named-blocks": "error",
      // Banning duplicate import statements from the same module.
      "import/no-duplicates": "error",
    },
  },

  // --------------------------------------------------------------------------
  // Enforce the SaaS authz boundary: route handlers should not reach for the
  // legacy role table directly. They must go through the helpers in
  // src/lib/server/http/saas-access.ts (which knows when to delegate to the
  // legacy mode). This matches .cursor/rules/saas-authz-boundaries.mdc.
  // --------------------------------------------------------------------------
  {
    files: ["src/app/api/**/*.ts", "src/app/api/**/*.tsx"],
    // The legacy /api/session endpoint is the one place that legitimately
    // mints / inspects the legacy `bg-session` cookie role.
    ignores: ["src/app/api/session/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/auth/legacy-permissions",
              message:
                "API route handlers must not import the legacy permissions module directly. Use the helpers in @/lib/server/http/saas-access (requireTenantAuth / requireTenantPermission / requireSaasOrLegacyPermission). The legacy /api/session endpoint is the one allowed exception.",
            },
          ],
        },
      ],
    },
  },
];

export default eslintConfig;
