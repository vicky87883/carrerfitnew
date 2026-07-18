import { randomUUID } from "node:crypto";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import type { BlogPost } from "../lib/types.js";
import { getSqliteJobDatabase } from "./job-database.js";
import { databaseBackend, getMysqlPool } from "./mysql.js";

export type BlogPostInput = Pick<BlogPost, "title" | "excerpt" | "content" | "category" | "tags" | "authorName" | "seoTitle" | "seoDescription" | "featured" | "status"> & { slug?: string; publishedAt?: string | null };
type BlogRow = RowDataPacket & { id: string; slug: string; title: string; excerpt: string; content: string; category: string; tags: string; author_name: string; seo_title: string; seo_description: string; featured: number | boolean; status: BlogPost["status"]; published_at: string | null; created_at: string; updated_at: string };
type SqlValue = string | number | null;
let seedPromise: Promise<void> | null = null;

export async function listPublishedBlogPosts(options: { limit?: number; category?: string } = {}) {
  await ensureBlogContent(); const values: (string | number)[] = []; const clauses = ["status='Published'", "published_at IS NOT NULL"];
  if (options.category) { clauses.push("category=?"); values.push(options.category); }
  const limit = Math.max(1, Math.min(100, options.limit || 50));
  const query = `SELECT * FROM blog_posts WHERE ${clauses.join(" AND ")} ORDER BY featured DESC,published_at DESC LIMIT ${limit}`;
  return queryPosts(query, values);
}

export async function getPublishedBlogPost(slug: string) {
  await ensureBlogContent(); return queryOne("SELECT * FROM blog_posts WHERE slug=? AND status='Published' AND published_at IS NOT NULL LIMIT 1", [slug]);
}

export async function listAllBlogPosts() { await ensureBlogContent(); return queryPosts("SELECT * FROM blog_posts ORDER BY updated_at DESC", []); }

export async function createBlogPost(input: BlogPostInput) {
  await ensureBlogContent(); const now = new Date().toISOString(); const id = randomUUID(); const slug = await uniqueSlug(slugify(input.slug || input.title));
  const publishedAt = input.status === "Published" ? input.publishedAt || now : null;
  const values: SqlValue[] = [id, slug, input.title, input.excerpt, input.content, input.category, JSON.stringify(input.tags), input.authorName, input.seoTitle, input.seoDescription, input.featured ? 1 : 0, input.status, publishedAt, now, now];
  if (databaseBackend() === "mysql") await (await getMysqlPool()).execute("INSERT INTO blog_posts (id,slug,title,excerpt,content,category,tags,author_name,seo_title,seo_description,featured,status,published_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", mysqlValues(values, [12, 13, 14]));
  else { ensureSqliteBlogSchema(); getSqliteJobDatabase().prepare("INSERT INTO blog_posts VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(...values); }
  return (await queryOne("SELECT * FROM blog_posts WHERE id=?", [id]))!;
}

export async function updateBlogPost(slug: string, input: BlogPostInput) {
  await ensureBlogContent(); const existing = await queryOne("SELECT * FROM blog_posts WHERE slug=?", [slug]); if (!existing) return null;
  const now = new Date().toISOString(); const nextSlug = input.slug && slugify(input.slug) !== slug ? await uniqueSlug(slugify(input.slug), existing.id) : slug;
  const publishedAt = input.status === "Published" ? input.publishedAt || existing.publishedAt || now : null;
  const values: SqlValue[] = [nextSlug, input.title, input.excerpt, input.content, input.category, JSON.stringify(input.tags), input.authorName, input.seoTitle, input.seoDescription, input.featured ? 1 : 0, input.status, publishedAt, now, existing.id];
  if (databaseBackend() === "mysql") await (await getMysqlPool()).execute("UPDATE blog_posts SET slug=?,title=?,excerpt=?,content=?,category=?,tags=?,author_name=?,seo_title=?,seo_description=?,featured=?,status=?,published_at=?,updated_at=? WHERE id=?", mysqlValues(values, [11, 12]));
  else getSqliteJobDatabase().prepare("UPDATE blog_posts SET slug=?,title=?,excerpt=?,content=?,category=?,tags=?,author_name=?,seo_title=?,seo_description=?,featured=?,status=?,published_at=?,updated_at=? WHERE id=?").run(...values);
  return queryOne("SELECT * FROM blog_posts WHERE id=?", [existing.id]);
}

export async function deleteBlogPost(slug: string) {
  await ensureBlogContent();
  if (databaseBackend() === "mysql") { const [result] = await (await getMysqlPool()).execute<ResultSetHeader>("DELETE FROM blog_posts WHERE slug=?", [slug]); return result.affectedRows > 0; }
  return getSqliteJobDatabase().prepare("DELETE FROM blog_posts WHERE slug=?").run(slug).changes > 0;
}

async function ensureBlogContent() {
  if (seedPromise) return seedPromise;
  seedPromise = (async () => {
    if (databaseBackend() === "mysql") await getMysqlPool(); else ensureSqliteBlogSchema();
    for (const seed of seeds) await insertSeed(seed);
  })().catch((error) => { seedPromise = null; throw error; });
  return seedPromise;
}

function ensureSqliteBlogSchema() {
  getSqliteJobDatabase().exec(`CREATE TABLE IF NOT EXISTS blog_posts (
    id TEXT PRIMARY KEY,slug TEXT NOT NULL UNIQUE,title TEXT NOT NULL,excerpt TEXT NOT NULL,content TEXT NOT NULL,
    category TEXT NOT NULL,tags TEXT NOT NULL,author_name TEXT NOT NULL,seo_title TEXT NOT NULL,seo_description TEXT NOT NULL,
    featured INTEGER NOT NULL DEFAULT 0,status TEXT NOT NULL DEFAULT 'Draft',published_at TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL
  ); CREATE INDEX IF NOT EXISTS blog_posts_status_date_idx ON blog_posts(status,published_at DESC); CREATE INDEX IF NOT EXISTS blog_posts_category_idx ON blog_posts(category);`);
}

async function insertSeed(seed: typeof seeds[number]) {
  const values: SqlValue[] = [seed.id, seed.slug, seed.title, seed.excerpt, seed.content, seed.category, JSON.stringify(seed.tags), seed.authorName, seed.seoTitle, seed.seoDescription, seed.featured ? 1 : 0, "Published", seed.publishedAt, seed.publishedAt, seed.publishedAt];
  if (databaseBackend() === "mysql") await (await getMysqlPool()).execute("INSERT IGNORE INTO blog_posts (id,slug,title,excerpt,content,category,tags,author_name,seo_title,seo_description,featured,status,published_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", mysqlValues(values, [12, 13, 14]));
  else getSqliteJobDatabase().prepare("INSERT OR IGNORE INTO blog_posts VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(...values);
}

async function queryPosts(query: string, values: (string | number)[]) {
  if (databaseBackend() === "mysql") { const [rows] = await (await getMysqlPool()).execute<BlogRow[]>(query, values); return rows.map(mapPost); }
  ensureSqliteBlogSchema(); return (getSqliteJobDatabase().prepare(query).all(...values) as BlogRow[]).map(mapPost);
}
async function queryOne(query: string, values: (string | number)[]) { return (await queryPosts(query, values))[0] || null; }
async function uniqueSlug(base: string, ignoreId?: string) { let slug = base || `article-${Date.now()}`; for (let suffix = 2; suffix < 100; suffix += 1) { const found = await queryOne("SELECT * FROM blog_posts WHERE slug=?", [slug]); if (!found || found.id === ignoreId) return slug; slug = `${base}-${suffix}`; } throw new Error("Could not create a unique article URL."); }
function mapPost(row: BlogRow): BlogPost { return { id: row.id, slug: row.slug, title: row.title, excerpt: row.excerpt, content: row.content, category: row.category, tags: safeTags(row.tags), authorName: row.author_name, seoTitle: row.seo_title, seoDescription: row.seo_description, featured: Boolean(row.featured), status: row.status, publishedAt: row.published_at ? iso(row.published_at) : null, createdAt: iso(row.created_at), updatedAt: iso(row.updated_at), readingMinutes: Math.max(1, Math.ceil(row.content.trim().split(/\s+/).length / 220)) }; }
function safeTags(value: string) { try { const tags = JSON.parse(value); return Array.isArray(tags) ? tags.map(String).slice(0, 12) : []; } catch { return []; } }
function slugify(value: string) { return value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 150); }
function mysqlValues(values: SqlValue[], dateIndexes: number[]): SqlValue[] { return values.map((value, index) => dateIndexes.includes(index) && value ? mysqlDate(String(value)) : value); }
function mysqlDate(value: string) { return new Date(value).toISOString().slice(0, 23).replace("T", " "); }
function iso(value: string) { return value.includes("T") ? value : `${value.replace(" ", "T")}Z`; }

const seeds = [
  {
    id: "blog-resume-evidence-2026", slug: "tailor-resume-to-job-description", featured: true, category: "Resume strategy", authorName: "CarrerFit Editorial",
    title: "How to Tailor Your Resume to a Job Description: An Evidence-First Checklist",
    excerpt: "A practical method for turning a job description into a focused resume without keyword stuffing or rewriting your entire career history.",
    seoTitle: "How to Tailor Your Resume to a Job Description | CarrerFit",
    seoDescription: "Use this evidence-first checklist to tailor your resume to a job description, select stronger achievements, and identify skill gaps before applying.",
    tags: ["resume tailoring", "job applications", "ATS", "career advice"], publishedAt: "2026-07-15T09:00:00.000Z",
    content: `Most people tailor a resume by copying phrases from a job description. That may change the wording, but it does not improve the evidence. A stronger approach starts by understanding what the employer needs someone to accomplish and then selecting proof that you have handled similar problems.

## Start with outcomes, not keywords

Read the job description once without editing anything. Highlight the outcomes the role owns: increase retention, ship reliable software, improve reporting, manage a pipeline, or reduce operating risk. These outcomes matter more than a long list of tools because they reveal why the position exists.

Create a short requirements table with three columns: employer need, your evidence, and evidence gap. Under your evidence, write one project, result, or responsibility that demonstrates the need. Leave the cell empty when you do not have proof. Honest gaps help you decide whether to apply and what to address in a cover note or interview.

## Separate core requirements from preferences

Job descriptions often combine essential work with an ideal wish list. Core requirements usually appear in the opening summary, responsibilities, and repeated phrases. Preferences often appear once or use language such as “nice to have” or “bonus.”

You do not need every preference. You do need enough evidence for the central work. If the role is primarily customer onboarding, three strong onboarding achievements are more valuable than ten unrelated software keywords.

## Choose achievements with a simple evidence score

Score each potential bullet from zero to two on relevance, specificity, and outcome. A bullet earns two relevance points when it directly matches a core responsibility. It earns two specificity points when it explains what you did and in what context. It earns two outcome points when it shows a measurable or observable result.

A bullet such as “Helped with weekly reports” is weak. “Automated the weekly revenue report in SQL, reducing preparation time from four hours to forty minutes” shows action, context, and result. Use estimates only when they are defensible and label them honestly.

## Rewrite the top third first

Recruiters initially see your headline, summary, most recent role, and first few achievements. Focus your tailoring effort there. Your headline should describe the target capability without claiming a title you have never held. Your summary should connect your strongest experience to the problems in the new role.

Reorder skills so the most relevant demonstrated skills appear first. Do not list a tool merely because it appears in the job description. If you are learning it, place it in a clearly labelled learning or project section.

## Keep the language natural

Use the employer’s standard terminology when it accurately describes your work. Avoid repeating the same phrase unnaturally. Search systems and recruiters both benefit from clear language, but neither benefits from a block of hidden or duplicated keywords.

## Run the final application check

- Can a reader identify your target role within ten seconds?
- Do the first three achievements support the role’s main outcomes?
- Are important claims backed by a project, number, scope, or result?
- Have you removed unrelated detail that distracts from stronger evidence?
- Is every skill honest and interview-ready?
- Does the file open cleanly as a PDF or DOCX?

Tailoring should make your evidence easier to see, not make you look like a different person. Use the CarrerFit resume analyzer to compare your actual experience with live roles, then open the strongest matches and perform this checklist against the original employer description.`,
  },
  {
    id: "blog-interview-method-2026", slug: "ai-mock-interview-practice-method", featured: true, category: "Interview practice", authorName: "CarrerFit Editorial",
    title: "AI Mock Interview Practice: A Method for Stronger, More Natural Answers",
    excerpt: "Use deliberate practice, evidence maps, and targeted review to make AI interview sessions useful instead of simply repeating generic questions.",
    seoTitle: "AI Mock Interview Practice Method for Better Answers | CarrerFit",
    seoDescription: "Learn a structured AI mock interview practice method using resume evidence, answer review, and focused repetition for more confident interviews.",
    tags: ["AI interview", "mock interview", "STAR method", "interview coaching"], publishedAt: "2026-07-12T09:00:00.000Z",
    content: `A mock interview becomes useful when it changes what you do in the next answer. Simply answering a long list of questions can feel productive while reinforcing vague stories, rushed delivery, or unsupported claims. Deliberate practice is shorter, more focused, and easier to review.

## Build an evidence map before you begin

Select four to six examples from your experience that cover different abilities: solving a difficult problem, influencing someone, recovering from a mistake, learning quickly, improving a process, and delivering a measurable result. For each example, note the situation, your responsibility, the actions you personally took, and the result.

Keep the notes brief. The goal is not to memorize a script. It is to make reliable evidence easier to retrieve when a question arrives in unfamiliar wording.

## Choose one practice objective

Do not try to fix everything in one session. Pick one objective such as making results more specific, reducing answers from three minutes to ninety seconds, explaining technical decisions in plain language, or using clearer ownership language.

Tell the interviewer the target role and use your resume profile. Role context changes what a strong answer looks like. A product role may require trade-offs and customer reasoning, while an engineering role may require reliability, constraints, and technical depth.

## Answer with structure, not a script

A useful answer normally establishes context, identifies your responsibility, explains two or three meaningful actions, and closes with a result and lesson. The familiar STAR framework can help, but the labels should not be audible. Speak as if you are explaining the work to an interested colleague.

When a result is not numeric, describe an observable change: the decision was approved, the incident stopped recurring, the team adopted the process, or a customer renewed. Never invent metrics to make a story sound stronger.

## Review the transcript for evidence

After each answer, ask four questions. Did I answer the question in the first thirty seconds? Did I make my personal contribution clear? Did I explain why I chose those actions? Did I close with a result?

Mark sentences that provide evidence and sentences that only add background. Most weak answers have too much setup and too little decision-making. Rewrite only the weakest section, then answer the same question again without reading the rewrite.

## Use follow-up questions as the real test

Real interviewers probe unclear claims. Useful AI practice should do the same. Expect questions such as “What did you personally own?”, “What alternative did you reject?”, “How did you measure success?”, or “What would you change now?”

If a follow-up exposes a gap, do not hide it. Practice a concise, honest explanation. Good judgment includes recognizing constraints and incomplete outcomes.

## Treat camera feedback carefully

Framing, lighting, and movement indicators can help with basic video-call readiness. They cannot measure confidence, honesty, personality, or job potential. Use delivery signals as private coaching aids, never as hiring evidence.

## A repeatable thirty-minute session

- Five minutes: choose the role, evidence stories, and one objective.
- Fifteen minutes: answer three focused questions with follow-ups.
- Five minutes: review transcripts and identify one recurring weakness.
- Five minutes: repeat the weakest answer and record one next action.

The CarrerFit AI interview uses your resume profile to create role-specific questions and adaptive follow-ups. Start with a short session, apply one improvement, and repeat later. Consistent, targeted practice is more valuable than one exhausting rehearsal.`,
  },
  {
    id: "blog-career-change-2026", slug: "career-change-roadmap-transferable-skills", featured: false, category: "Career change", authorName: "CarrerFit Editorial",
    title: "A Practical Career Change Roadmap Built Around Transferable Skills",
    excerpt: "Move from a broad wish to change careers toward a testable target role, evidence plan, and realistic application strategy.",
    seoTitle: "Career Change Roadmap Using Transferable Skills | CarrerFit",
    seoDescription: "Follow a practical career change roadmap to identify transferable skills, test target roles, close evidence gaps, and apply with a credible story.",
    tags: ["career change", "transferable skills", "career planning", "job search"], publishedAt: "2026-07-08T09:00:00.000Z",
    content: `Career change advice often begins with a job title. A more reliable process begins with problems you can already solve, the environments where you work well, and evidence that another employer can evaluate. The goal is not to discover one perfect career. It is to choose a credible direction and test it cheaply.

## Define the change you actually need

Write down what you want to change: the work itself, industry, manager environment, schedule, location, income path, or level of responsibility. Changing all of these at once creates unnecessary risk. A role change within the same industry may be easier than changing role and industry simultaneously.

Set constraints before exploring titles. Include minimum income, location, time available for training, and how quickly you need to move. A good target role fits your life as well as your interests.

## Build a transferable evidence inventory

List ten situations where you produced a useful outcome. Focus on actions: analyzed information, organized a process, persuaded a stakeholder, resolved a customer issue, trained someone, built a system, or managed competing priorities.

For each situation, record the problem, your action, the result, and the conditions. Conditions matter because they reveal portable strengths such as working with incomplete information, coordinating across teams, or explaining complex topics.

Translate the evidence into capability language without erasing its context. “Managed restaurant shifts” may include workforce planning, customer recovery, safety compliance, and real-time prioritization. The original setting makes the evidence believable.

## Compare three target roles

Choose three roles, not twenty. Review at least ten current descriptions for each and note repeated outcomes, tools, experience expectations, and entry routes. Avoid relying on a single unusually demanding listing.

Create a scorecard for evidence fit, learning effort, opportunity availability, compensation fit, and genuine interest in the daily work. A target with strong interest but no realistic entry path may become a longer-term option rather than the first move.

## Close evidence gaps before credential gaps

A course can teach concepts, but employers still need proof you can apply them. When possible, build a small project that produces an artifact: an analysis, process map, campaign plan, research summary, code repository, or before-and-after workflow.

Keep the scope narrow enough to finish. Explain the decision you made, alternatives considered, and what you learned. One thoughtful project is stronger than several unfinished certificates.

## Create a bridge story

Your career-change explanation should connect past evidence, present preparation, and the target role. A simple structure is: “In my previous work I repeatedly enjoyed and performed well at X. I tested that direction by doing Y. I am now targeting Z because it uses those strengths to solve these problems.”

Do not apologize for your previous career. Explain the continuity. Employers are more likely to trust a change that looks considered and tested.

## Run small market experiments

Before sending fifty applications, conduct five conversations with people close to the work, complete one realistic task, and apply to five carefully selected roles. Track where your evidence receives interest and where objections repeat.

Use that feedback to adjust the target, portfolio, or story. A career change is a sequence of evidence-building experiments, not one irreversible decision.

The CarrerFit assessment can help narrow your initial direction, while resume matching shows which live roles have meaningful overlap with your current evidence. Use both as inputs, then validate the result with real job descriptions and conversations.`,
  },
] as const;
