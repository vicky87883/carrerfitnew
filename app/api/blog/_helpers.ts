import { timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { privateJson } from "@/server/auth";
import { adminSession } from "@/server/admin-access";

export const blogInputSchema = z.object({
  slug: z.string().max(160).optional(), title: z.string().trim().min(10).max(180), excerpt: z.string().trim().min(40).max(400),
  content: z.string().trim().min(300).max(80_000), category: z.string().trim().min(2).max(80),
  tags: z.array(z.string().trim().min(1).max(40)).max(12), authorName: z.string().trim().min(2).max(100),
  seoTitle: z.string().trim().min(10).max(180), seoDescription: z.string().trim().min(40).max(400),
  featured: z.boolean(), status: z.enum(["Draft", "Published"]), publishedAt: z.string().datetime().nullable().optional(),
});

export function requireBlogAdmin(request: Request) {
  if (adminSession(request)) return null;
  const expected = process.env.BLOG_ADMIN_TOKEN || ""; const provided = request.headers.get("x-admin-token") || "";
  if (expected.length < 24) return privateJson({ message: "Set BLOG_ADMIN_TOKEN to manage articles." }, 503);
  const left = Buffer.from(provided); const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right) ? null : privateJson({ message: "Invalid blog administrator token." }, 401);
}

export function revalidateBlog(slug: string) {
  revalidatePath("/blog"); revalidatePath(`/blog/${slug}`); revalidatePath("/sitemap.xml"); revalidatePath("/rss.xml");
}

export function blogFailure(error: unknown) {
  const duplicate = error && typeof error === "object" && "code" in error && ["ER_DUP_ENTRY", "SQLITE_CONSTRAINT_UNIQUE"].includes(String(error.code));
  if (duplicate) return privateJson({ message: "That article URL is already in use." }, 409);
  console.error("Blog write failed", error);
  return privateJson({ message: "The article could not be saved." }, 500);
}
