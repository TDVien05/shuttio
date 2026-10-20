//  @ts-check

import { tanstackConfig } from "@tanstack/eslint-config"
import { plugin as shadcn } from "@shadcn/lint"

export default [
  ...tanstackConfig,
  {
    plugins: {
      shadcn,
    },
    rules: {
      "import/no-cycle": "off",
      "import/order": "off",
      "sort-imports": "off",
      "@typescript-eslint/array-type": "off",
      "@typescript-eslint/require-await": "off",
      "pnpm/json-enforce-catalog": "off",
      "shadcn/no-arbitrary-values": "error",
      "shadcn/no-restyle": ["warn", { allow: ["layout"] }],
      "shadcn/no-raw-colors": "warn",
      "shadcn/no-inline-styles": "warn",
      "shadcn/no-unknown-classes": "warn",
      "shadcn/require-static-classes": "warn",
    },
  },
  {
    ignores: [
      "eslint.config.js",
      "prettier.config.js",
      "src/components/ui/**",
      "src/components/kibo-ui/**",
      "src/paraglide/**",
      ".output/**",
      ".nitro/**",
    ],
  },
]
