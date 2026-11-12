import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // The members-only downloads are read from disk by this route.
  outputFileTracingIncludes: {
    "/api/download/\\[name\\]": ["./downloads/**/*"],
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
