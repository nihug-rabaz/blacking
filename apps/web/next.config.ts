import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@blacking/protocol"],
  outputFileTracingRoot: path.join(__dirname, "../.."),
};

export default nextConfig;
