import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/auth/:path*",
        destination: `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787"}/api/auth/:path*`,
      },
    ];
  },
};

export default nextConfig;
