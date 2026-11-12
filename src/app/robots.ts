import type { MetadataRoute } from "next";

// Guild only: nothing here should be indexed.
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
