import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    // CSS.escape is not in all jsdom versions — polyfilled via setupFiles
    setupFiles: ["./src/test-setup.ts"],
  },
})
