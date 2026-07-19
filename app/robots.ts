import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";
export const dynamic = "force-dynamic";
export default function robots(): MetadataRoute.Robots { return { rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/admin", "/dashboard", "/resume", "/interview", "/assessment", "/jobs", "/job-sources", "/blog-admin", "/login", "/register", "/forgot-password", "/reset-password"] }, sitemap: siteUrl("/sitemap.xml"), host: siteUrl("/") }; }
