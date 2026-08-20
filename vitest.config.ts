import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    setupFiles: ["src/test/setup.ts"],
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});
