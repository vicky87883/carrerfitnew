import type { Metadata } from "next";
import { ArrowLeft, ArrowRight, BookOpen, CalendarDays, Clock3, ShieldCheck, Sparkles } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import AppNav from "@/components/AppNav";
import BlogArticleContent from "@/components/BlogArticleContent";
import { siteUrl } from "@/lib/site";
import { getPublishedBlogPost, listPublishedBlogPosts } from "@/server/blog-store";

type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const post = await getPublishedBlogPost((await params).slug); if (!post) return { title: "Article not found | CarrerFit", robots: { index: false, follow: false } };
  return { title: post.seoTitle, description: post.seoDescription, authors: [{ name: post.authorName }], alternates: { canonical: `/blog/${post.slug}` }, openGraph: { type: "article", url: `/blog/${post.slug}`, title: post.seoTitle, description: post.seoDescription, publishedTime: post.publishedAt || undefined, modifiedTime: post.updatedAt, authors: [post.authorName], tags: post.tags }, twitter: { card: "summary_large_image", title: post.seoTitle, description: post.seoDescription } };
}

export default async function BlogArticlePage({ params }: Props) {
  const post = await getPublishedBlogPost((await params).slug); if (!post) notFound();
  const related = (await listPublishedBlogPosts({ limit: 10 })).filter(item => item.id !== post.id && (item.category === post.category || item.tags.some(tag => post.tags.includes(tag)))).slice(0, 2);
  const schema = { "@context": "https://schema.org", "@type": "BlogPosting", mainEntityOfPage: siteUrl(`/blog/${post.slug}`), headline: post.title, description: post.seoDescription, datePublished: post.publishedAt, dateModified: post.updatedAt, author: { "@type": "Organization", name: post.authorName, url: siteUrl("/blog") }, publisher: { "@type": "Organization", name: "CarrerFit.com", url: siteUrl("/") }, keywords: post.tags.join(", "), articleSection: post.category };
  return <main className="articleShell"><AppNav light/><article><header className="articleHero"><Link href="/blog"><ArrowLeft/> All career guides</Link><span className="articleCategory">{post.category}</span><h1>{post.title}</h1><p>{post.excerpt}</p><div className="articleByline"><span className="authorMark">CF</span><div><strong>{post.authorName}</strong><small><CalendarDays/> {formatDate(post.publishedAt)} <i/> <Clock3/> {post.readingMinutes} min read</small></div></div></header>
    <div className="articleLayout"><aside><div className="articleAsideCard"><BookOpen/><strong>In this guide</strong><span>{post.category}</span><span>{post.readingMinutes} minute read</span><span>{post.tags.length} focus areas</span></div><Link href="/resume" className="articleAsideCta"><Sparkles/><span><strong>Use your own resume</strong><small>Find evidence-backed matches</small></span><ArrowRight/></Link></aside><section><BlogArticleContent content={post.content}/><div className="articleTrust"><ShieldCheck/><p><strong>Editorial note</strong>This guide is educational career coaching, not a guarantee of employment. Verify role requirements on the employer’s original listing.</p></div><div className="articleEndCta"><span className="kicker">Your next action</span><h2>Turn this guide into practice.</h2><p>Use CarrerFit to connect your real experience with live roles and focused interview questions.</p><div><Link href="/resume">Analyze my resume <ArrowRight/></Link><Link href="/jobs">Explore live jobs</Link></div></div></section></div>
    {related.length > 0 && <section className="relatedArticles"><span className="kicker">Keep learning</span><h2>Related career guides</h2><div>{related.map(item => <Link href={`/blog/${item.slug}`} key={item.id}><span>{item.category}</span><strong>{item.title}</strong><small>{item.readingMinutes} min read <ArrowRight/></small></Link>)}</div></section>}
  </article><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, "\\u003c") }}/></main>;
}
function formatDate(value: string | null) { return value ? new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric" }).format(new Date(value)) : ""; }
