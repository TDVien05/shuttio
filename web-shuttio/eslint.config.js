//  @ts-check

import { tanstackConfig } from "@tanstack/eslint-config"
import reactHooks from "eslint-plugin-react-hooks"

export default [
  ...tanstackConfig,
  reactHooks.configs.flat.recommended,
  {
    rules: {
      "import/no-cycle": "off",
      "import/order": "off",
      "sort-imports": "off",
      "@typescript-eslint/array-type": "off",
      "@typescript-eslint/require-await": "off",
      "pnpm/json-enforce-catalog": "off",
      "import/consistent-type-specifier-style": "off",
      // Defensive guards on api data are intentional (the types describe the
      // happy path; the network doesn't promise it).
      "@typescript-eslint/no-unnecessary-condition": "off",
      "@typescript-eslint/naming-convention": "off",
      "no-shadow": "off",
    },
  },
  {
    ignores: [
      "eslint.config.js",
      "src/paraglide/**",
      "src/routeTree.gen.ts",
      ".output/**",
    ],
  },
]
