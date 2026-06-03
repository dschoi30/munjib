import { withSentryConfig } from "@sentry/nextjs";

/** @type {import("next").NextConfig} */
const nextConfig = {
  outputFileTracingRoot: process.cwd(),
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
