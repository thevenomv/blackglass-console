import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  // Exclude ssh2 (and its native modules) from webpack bundling entirely.
  // On Linux build environments the native sshcrypto.node binary is compiled
  // by npm ci; webpack cannot parse a .node binary, so we keep ssh2 as a
  // server-side CJS require rather than bundling it.
  serverExternalPackages: ["ssh2"],
};

export default nextConfig;
