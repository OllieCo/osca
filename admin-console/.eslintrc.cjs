module.exports = {
  root: true,
  extends: [
    "next/core-web-vitals",
    "plugin:@typescript-eslint/recommended",
  ],
  parser: "@typescript-eslint/parser",
  plugins: ["@typescript-eslint"],
  rules: {
    "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    "@typescript-eslint/no-explicit-any": "error",
  },
  ignorePatterns: ["node_modules/", ".next/", "dist/"],
}
