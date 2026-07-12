import { withSentryConfig } from "@sentry/nextjs";

/** @type {import("next").NextConfig} */
const nextConfig = {
  outputFileTracingRoot: process.cwd(),
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [{ key: "X-DNS-Prefetch-Control", value: "off" }],
      },
    ];
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "5mb",
    },
  },
};

export default withSentryConfig(nextConfig, {
  silent: !process.env.CI,
  sourcemaps: {
    disable: true,
  },
  telemetry: false,
});
