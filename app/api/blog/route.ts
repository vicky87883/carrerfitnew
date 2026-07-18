import { rateLimit } from "@/app/api/_utils";
import { blogFailure, blogInputSchema, requireBlogAdmin, revalidateBlog } from "@/app/api/blog/_helpers";
import { privateJson, validateMutationOrigin } from "@/server/auth";
import { createBlogPost, listAllBlogPosts, listPublishedBlogPosts } from "@/server/blog-store";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const url = new URL(request.url); const admin = url.searchParams.get("admin") === "1";
    if (admin) { const denied = requireBlogAdmin(request); if (denied) return denied; return privateJson({ posts: await listAllBlogPosts() }); }
    const category = (url.searchParams.get("category") || "").slice(0, 80);
    return Response.json({ posts: await listPublishedBlogPosts({ category: category || undefined, limit: 100 }) }, { headers: { "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=3600" } });
  } catch (error) { console.error("Blog list failed", error); return Response.json({ message: "Articles are temporarily unavailable." }, { status: 503 }); }
}

export async function POST(request: Request) {
  try {
    const originDenied = validateMutationOrigin(request); if (originDenied) return originDenied;
    const denied = requireBlogAdmin(request); if (denied) return denied;
    const limited = rateLimit(request, "blog-admin", 30); if (limited) return limited;
    const parsed = blogInputSchema.safeParse(await request.json());
    if (!parsed.success) return privateJson({ message: "Review the article fields and try again.", issues: parsed.error.flatten().fieldErrors }, 400);
    const post = await createBlogPost(parsed.data); revalidateBlog(post.slug); return privateJson(post, 201);
  } catch (error) { return blogFailure(error); }
}
