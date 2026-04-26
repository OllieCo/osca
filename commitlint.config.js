export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "scope-enum": [
      2,
      "always",
      ["server", "client", "extension", "evals", "ci", "deps", "docs", "release"],
    ],
    "scope-empty": [1, "never"],
  },
}
