/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  webpack(config) {
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
  async headers() {
    return [{
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=()" },
      ],
    }];
  },
  async rewrites() {
    if (!process.env.API_URL) return [];
    return [{
      source: "/api/:path*",
      destination: `${process.env.API_URL}/api/:path*`,
    }];
  },
};

export default nextConfig;
