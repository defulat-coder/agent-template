import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    cpus: 2,
    memoryBasedWorkersCount: false,
  },
  transpilePackages: [
    "@agent-template/agent-client",
    "@agent-template/ui",
    "@agent-template/shared",
  ],
};

export default nextConfig;
