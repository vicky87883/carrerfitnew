import type { Metadata } from "next";
import { ArrowRight, BookOpen, Clock3, Rss, Sparkles } from "lucide-react";
import Link from "next/link";
import AppNav from "@/components/AppNav";
import { siteUrl } from "@/lib/site";
import { listPublishedBlogPosts } from "@/server/blog-store";

export const metadata: Metadata = {
  title: "Career Guides: Resumes, Interviews and Job Search | CarrerFit",
  description: "Practical, evidence-based career guides for resume tailoring, interview practice, career changes, and smarter job applications.",
  alternates: { canonical: "/blog" }, openGraph: { type: "website", url: "/blog", title: "CarrerFit Career Guides", description: "Practical career guidance built around evidence, not generic advice." },
};

export default async function BlogPage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const selected = (await searchParams).category || ""; const allPosts = await listPublishedBlogPosts({ limit: 100 });
  const categories = [...new Set(allPosts.map((post) => post.category))]; const posts = selected ? allPosts.filter((post) => post.category === selected) : allPosts;
  const featured = posts.find((post) => post.featured) || posts[0]; const remaining = posts.filter((post) => post.id !== featured?.id);
  return <main className="blogShell"><AppNav light/><section className="blogHero"><div><span className="kicker"><Sparkles/> CarrerFit editorial</span><h1>Career advice you can actually use.</h1><p>Original, practical guides for building stronger evidence, choosing better-fit roles, and preparing for the conversations that move careers forward.</p><div className="blogHeroActions"><Link href="/resume">Match your resume <ArrowRight/></Link><a href="/rss.xml"><Rss/> RSS feed</a></div></div><div className="blogHeroMark"><BookOpen/><span>{allPosts.length}</span><small>in-depth guides</small></div></section>
    <nav className="blogCategories" aria-label="Article categories"><Link className={!selected ? "selected" : ""} href="/blog">All guides</Link>{categories.map(category => <Link className={selected === category ? "selected" : ""} href={`/blog?category=${encodeURIComponent(category)}`} key={category}>{category}</Link>)}</nav>
    {featured ? <section className="featuredArticle"><div className="articleVisual"><span>{featured.category}</span><b>{featured.readingMinutes}<small>min</small></b></div><div><span className="articleMeta">Featured guide · {formatDate(featured.publishedAt)}</span><h2><Link href={`/blog/${featured.slug}`}>{featured.title}</Link></h2><p>{featured.excerpt}</p><div className="articleTags">{featured.tags.slice(0,4).map(tag => <span key={tag}>{tag}</span>)}</div><Link className="readArticle" href={`/blog/${featured.slug}`}>Read the complete guide <ArrowRight/></Link></div></section> : <section className="blogEmpty"><h2>New guides are being prepared.</h2><p>Subscribe to the RSS feed or return soon.</p></section>}
    {remaining.length > 0 && <section className="articleLibrary"><div className="blogSectionHeading"><span className="kicker">Latest thinking</span><h2>Build your next move with clarity.</h2></div><div className="articleGrid">{remaining.map((post,index) => <article key={post.id}><div className={`articleCardVisual tone${index % 3}`}><span>{post.category}</span><BookOpen/></div><div><span className="articleMeta"><Clock3/> {post.readingMinutes} min read · {formatDate(post.publishedAt)}</span><h3><Link href={`/blog/${post.slug}`}>{post.title}</Link></h3><p>{post.excerpt}</p><Link href={`/blog/${post.slug}`}>Read guide <ArrowRight/></Link></div></article>)}</div></section>}
    <section className="blogNewsletter"><div><span className="kicker">Turn insight into action</span><h2>Use your own evidence.</h2><p>Analyze your resume against real opportunities, then practice the interview built from your experience.</p></div><div><Link href="/resume">Analyze my resume</Link><Link href="/interview">Practice an interview</Link></div></section>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJson({ "@context": "https://schema.org", "@type": "Blog", name: "CarrerFit Career Guides", description: metadata.description, url: siteUrl("/blog"), publisher: { "@type": "Organization", name: "CarrerFit.com", url: siteUrl("/") }, blogPost: allPosts.map(post => ({ "@type": "BlogPosting", headline: post.title, url: siteUrl(`/blog/${post.slug}`), datePublished: post.publishedAt, dateModified: post.updatedAt })) }) }}/>
  </main>;
}
function formatDate(value: string | null) { return value ? new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value)) : "Draft"; }
function safeJson(value: unknown) { return JSON.stringify(value).replace(/</g, "\\u003c"); }
