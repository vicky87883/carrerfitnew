import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";
import { listPublishedBlogPosts } from "@/server/blog-store";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date(); const pages: MetadataRoute.Sitemap = [
    ["/", "weekly", 1], ["/resume", "weekly", .9], ["/interview", "weekly", .9], ["/jobs", "daily", .9], ["/assessment", "monthly", .7], ["/blog", "weekly", .9],
  ].map(([path, changeFrequency, priority]) => ({ url: siteUrl(String(path)), lastModified: now, changeFrequency: changeFrequency as "daily" | "weekly" | "monthly", priority: Number(priority) }));
  try { const posts = await listPublishedBlogPosts({ limit: 1000 }); return [...pages, ...posts.map(post => ({ url: siteUrl(`/blog/${post.slug}`), lastModified: new Date(post.updatedAt), changeFrequency: "monthly" as const, priority: .8 }))]; }
  catch { return pages; }
}
