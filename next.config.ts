import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Scans from a phone camera can be large; allow multi-page uploads.
  experimental: { serverActions: { bodySizeLimit: "50mb" } },
  serverExternalPackages: ["@prisma/client"],
  // A stray package-lock.json in the user folder otherwise confuses root detection.
  outputFileTracingRoot: process.cwd(),
};

export default nextConfig;
