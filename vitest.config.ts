import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // tests land with the port (planning/tasks.md 2.2 and 2.4)
    passWithNoTests: true,
  },
});
