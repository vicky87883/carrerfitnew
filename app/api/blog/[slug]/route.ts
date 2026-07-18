import { blogFailure, blogInputSchema, requireBlogAdmin, revalidateBlog } from "@/app/api/blog/_helpers";
import { rateLimit } from "@/app/api/_utils";
import { privateJson, validateMutationOrigin } from "@/server/auth";
import { deleteBlogPost, getPublishedBlogPost, listAllBlogPosts, updateBlogPost } from "@/server/blog-store";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";
type Context = { params: Promise<{ slug: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const slug = (await context.params).slug; const admin = new URL(request.url).searchParams.get("admin") === "1";
    if (admin) { const denied = requireBlogAdmin(request); if (denied) return denied; const post = (await listAllBlogPosts()).find((item) => item.slug === slug); return post ? privateJson(post) : privateJson({ message: "Article not found." }, 404); }
    const post = await getPublishedBlogPost(slug); return post ? Response.json(post, { headers: { "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=3600" } }) : Response.json({ message: "Article not found." }, { status: 404 });
  } catch (error) { console.error("Blog read failed", error); return Response.json({ message: "Article temporarily unavailable." }, { status: 503 }); }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const originDenied = validateMutationOrigin(request); if (originDenied) return originDenied; const denied = requireBlogAdmin(request); if (denied) return denied;
    const limited = rateLimit(request, "blog-admin", 30); if (limited) return limited; const slug = (await context.params).slug;
    const parsed = blogInputSchema.safeParse(await request.json()); if (!parsed.success) return privateJson({ message: "Review the article fields and try again.", issues: parsed.error.flatten().fieldErrors }, 400);
    const post = await updateBlogPost(slug, parsed.data); if (!post) return privateJson({ message: "Article not found." }, 404); revalidateBlog(slug); if (post.slug !== slug) revalidateBlog(post.slug); return privateJson(post);
  } catch (error) { return blogFailure(error); }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const originDenied = validateMutationOrigin(request); if (originDenied) return originDenied; const denied = requireBlogAdmin(request); if (denied) return denied;
    const slug = (await context.params).slug; if (!await deleteBlogPost(slug)) return privateJson({ message: "Article not found." }, 404); revalidateBlog(slug); return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return blogFailure(error); }
}
