import coreWebVitals from "eslint-config-next/core-web-vitals";

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
];

export default eslintConfig;
