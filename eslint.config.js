import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/", "dev-dist/", "public/", "vendor/", "worker/", "tools/"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "no-empty": ["error", { allowEmptyCatch: false }],
      "no-control-regex": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { ignoreRestSiblings: true },
      ],
      complexity: ["warn", 20],
      "max-depth": ["warn", 4],
      "max-lines": ["warn", { max: 600, skipBlankLines: true }],
    },
  },
  {
    files: ["tests/**/*.ts"],
    rules: {
      "@typescript-eslint/no-this-alias": "off",
    },
  },
);
