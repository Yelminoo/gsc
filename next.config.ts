import type { NextConfig } from "next";

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // Tailwind v4 loader for Turbopack. Cache Components / `use cache` are intentionally NOT enabled
  // (the October 2026 critical RCE was in `use cache`, and this app does not need it).
  turbopack: {
    rules: { "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" } },
  },
  // Native / Node-only packages must not be bundled.
  serverExternalPackages: ["@react-pdf/renderer", "@node-rs/argon2", "pg"],
  // The image optimizer was the target of recent critical CVEs and this app does not use it.
  images: { unoptimized: true },
  experimental: {
    serverActions: {
      bodySizeLimit: "1mb",
      // Set APP_ORIGIN (host only, e.g. admin.example.com) when running behind a reverse proxy.
      allowedOrigins: process.env.APP_ORIGIN ? [process.env.APP_ORIGIN] : undefined,
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
