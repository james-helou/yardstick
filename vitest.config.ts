import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { tsconfigPaths: true },
        test: {
          name: "node",
          environment: "node",
          include: ["src/**/*.test.ts"],
          setupFiles: ["src/test/setup.ts"],
          hookTimeout: 30_000,
          fileParallelism: false,
        },
      },
      {
        plugins: [react()],
        resolve: { tsconfigPaths: true },
        test: {
          name: "dom",
          environment: "jsdom",
          include: ["src/**/*.test.tsx"],
          setupFiles: ["src/test/setup-dom.ts"],
        },
      },
    ],
  },
});
