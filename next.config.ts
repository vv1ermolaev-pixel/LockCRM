import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Docker image runs the minimal standalone server (see Dockerfile).
  // Local `pnpm start` keeps the regular server: it does not work with standalone output.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
};

export default nextConfig;
