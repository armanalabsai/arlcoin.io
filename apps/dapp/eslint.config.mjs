import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "no-console": "error",
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
  {
    // Files taken from Scaffold-ETH 2 (MIT) are kept close to upstream so they can be compared
    // and updated; they use `any` in generic contract typing and value-style type imports.
    files: [
      "hooks/scaffold-eth/**",
      "utils/scaffold-eth/**",
      "components/scaffold-eth/**",
      "types/abitype/**",
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/consistent-type-imports": "off",
      "no-console": "off",
    },
  },
  { files: ["scripts/**"], rules: { "no-console": "off" } },
  globalIgnores([".next/**", "next-env.d.ts", "playwright-report/**", "test-results/**"]),
]);
