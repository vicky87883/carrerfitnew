import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { join } from "node:path";

const database = join(process.cwd(), "server", "data", `blog-test-${process.pid}.sqlite`);
process.env.CARRERFIT_DB_PATH = database;
delete process.env.DATABASE_URL; delete process.env.DB_HOST; delete process.env.DB_NAME; delete process.env.DB_USER; delete process.env.DB_PASSWORD;

async function main() {
  const { createBlogPost, deleteBlogPost, getPublishedBlogPost, listAllBlogPosts, listPublishedBlogPosts, updateBlogPost } = await import("../server/blog-store.js");
  const { closeJobDatabaseForTests } = await import("../server/job-database.js");
  try {
    const seeded = await listPublishedBlogPosts();
    assert.equal(seeded.length, 3, "three original guides should be seeded");
    assert.ok(seeded.every(post => post.status === "Published" && post.publishedAt));

    const draft = await createBlogPost({
      title: "A private draft article for publishing verification",
      excerpt: "This private draft exists to verify that unpublished content never reaches public blog queries.",
      content: "Draft evidence ".repeat(40), category: "Testing", tags: ["private", "draft"],
      authorName: "CarrerFit Editorial", seoTitle: "Private publishing verification draft",
      seoDescription: "A private test article used only to verify CarrerFit publishing and draft isolation behavior.",
      featured: false, status: "Draft",
    });
    assert.equal(await getPublishedBlogPost(draft.slug), null, "draft must not be publicly retrievable");
    assert.equal((await listPublishedBlogPosts()).some(post => post.id === draft.id), false, "draft must not enter public listings");
    assert.equal((await listAllBlogPosts()).some(post => post.id === draft.id), true, "draft should remain available to administrators");

    const published = await updateBlogPost(draft.slug, { ...draft, slug: "publishing-verification", status: "Published" });
    assert.ok(published?.publishedAt, "publishing should set the first publication time");
    assert.equal((await getPublishedBlogPost("publishing-verification"))?.id, draft.id);
    assert.equal(await deleteBlogPost("publishing-verification"), true);
    assert.equal(await getPublishedBlogPost("publishing-verification"), null);
    console.log("Blog seed, draft isolation, publishing, slug update, and deletion checks passed.");
  } finally {
    await closeJobDatabaseForTests();
    for (const suffix of ["", "-shm", "-wal"]) rmSync(`${database}${suffix}`, { force: true });
  }
}

main().catch(error => { console.error(error); process.exit(1); });
