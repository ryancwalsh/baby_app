import js from "@eslint/js";
import next from "eslint-config-next";
import prettier from "eslint-config-prettier";
import typescriptEslint from "typescript-eslint";

export default typescriptEslint.config(
  {
    ignores: [".next/**", "node_modules/**", "next-env.d.ts"],
  },
  js.configs.recommended,
  /** Brings typescript-eslint, React, hooks, a11y and the Next-specific rules. */
  ...next,
  /** Last, so formatting rules never fight Prettier. */
  prettier,
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      /**
       * TypeScript already reports both, and more accurately: the core rules do
       * not know about type-only names, ambient globals or interface members.
       */
      "no-undef": "off",
      "no-unused-vars": "off",
    },
  },
  {
    rules: {
      /** House style: `.reduce` is banned in favour of a plain loop. */
      "no-restricted-properties": [
        "error",
        {
          property: "reduce",
          message: "Use a loop or another array method instead of .reduce.",
        },
      ],
    },
  },
);
