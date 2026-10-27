import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/", "dev-dist/", "public/", "vendor/", "tools/"],
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
      "max-lines-per-function": ["warn", { max: 100, skipBlankLines: true }],
    },
  },
  {
    files: ["src/**/*.ts", "worker/**/*.ts"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": [
        "error",
        { checksVoidReturn: { arguments: false, attributes: false } },
      ],
      "@typescript-eslint/prefer-promise-reject-errors": "error",
      "max-lines": ["warn", { max: 550, skipBlankLines: true }],
    },
  },
  {
    files: ["tests/**/*.ts"],
    rules: {
      "@typescript-eslint/no-this-alias": "off",
    },
  },
);
