import type { MetadataRoute } from "next";
import { siteOrigin, siteShouldNoindex } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  const origin = siteOrigin();

  if (siteShouldNoindex()) {
    return {
      rules: { userAgent: "*", disallow: ["/"] },
    };
  }

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/monitoring"],
      },
    ],
    ...(origin ? { sitemap: `${origin}/sitemap.xml` } : {}),
  };
}
