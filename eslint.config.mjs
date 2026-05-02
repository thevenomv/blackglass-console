import coreWebVitals from "eslint-config-next/core-web-vitals";

/**
 * Next 16's shareable preset enables stricter **`eslint-plugin-react-hooks`** (compiler) rules than our
 * patterns yet satisfy — keep them relaxed until SSR pages + client providers are refactored.
 *
 * Revisit: jsx in try/catch on server components, effect-driven resets, onboarding timer init.
 */
const relaxedCompilerHooks = {
  "react-hooks/error-boundaries": "off",
  "react-hooks/set-state-in-effect": "off",
  "react-hooks/purity": "off",
  "react-hooks/incompatible-library": "off",
};

/** @type {import("eslint").Linter.Config[]} */
const eslintConfig = [
  {
    ignores: [
      "**/.next/**",
      "**/node_modules/**",
      "**/out/**",
      "**/playwright-report/**",
      "**/test-results/**",
      "**/coverage/**",
    ],
  },
  ...coreWebVitals,
  { rules: relaxedCompilerHooks },
];

export default eslintConfig;
