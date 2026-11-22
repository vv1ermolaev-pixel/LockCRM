import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// No nonces: inline scripts are allowed, so pages stay static-friendly and need no per-request work.
// Everything the app loads (scripts, styles, fonts from next/font) comes from its own origin.
// `next dev` needs eval for its tooling and runs over plain http, so it gets eval and no https upgrade
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Frame-Options", value: "DENY" },
  // Not no-referrer: it would blank the Origin header that Next server actions check
  { key: "Referrer-Policy", value: "same-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Only features Chrome knows: an unknown name is an error in the browser console
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
  },
];

const nextConfig: NextConfig = {
  // The Docker image runs the minimal standalone server (see Dockerfile).
  // Local `pnpm start` keeps the regular server: it does not work with standalone output.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  // Do not tell the world what the app is built with
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
