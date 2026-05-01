import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  webpack(config, { isServer }) {
    if (isServer) {
      // ssh2 has optional native modules (cpu-features, sshcrypto.node) that
      // are not available in all environments. Mark them as external so webpack
      // does not error when they are absent — ssh2 falls back to pure-JS impl.
      config.externals = [
        ...(Array.isArray(config.externals) ? config.externals : []),
        "cpu-features",
        "sshcrypto.node",
      ];
    }
    return config;
  },
};

export default nextConfig;
