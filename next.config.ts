import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A stray package-lock.json in the home directory makes Turbopack infer a root
  // outside the repo. Pin it so builds resolve modules from this project only.
  turbopack: { root: path.resolve(process.cwd()) },
};

export default nextConfig;
