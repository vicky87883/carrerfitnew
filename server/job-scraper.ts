import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { load } from "cheerio";
import type { JobSource } from "../lib/types.js";
import type { ImportedJob, SourceKind } from "./job-database.js";
import { markSourceFailed, markSourceRunning, replaceSourceJobs } from "./job-database.js";

const USER_AGENT = "CarrerFitJobIndexer/1.0 (+https://carrerfit.com)";
const MAX_RESPONSE_BYTES = 3 * 1024 * 1024;
const MAX_JOBS = 300;
const MAX_DISCOVERED_PAGES = 24;
const robotsCache = new Map<string, Promise<string>>();

export function identifyJobSource(rawUrl: string, providedName = "") {
  const url = normalizeUrl(rawUrl);
  const parts = url.pathname.split("/").filter(Boolean);
  let type: SourceKind = "Structured data";
  let key = "";
  if (["jobs.lever.co", "jobs.eu.lever.co"].includes(url.hostname) && parts[0]) { type = "Lever"; key = parts[0]; }
  else if (["boards.greenhouse.io", "job-boards.greenhouse.io"].includes(url.hostname) && parts[0]) { type = "Greenhouse"; key = parts[0]; }
  else if (url.hostname === "jobs.ashbyhq.com" && parts[0]) { type = "Ashby"; key = parts[0]; }
  const inferred = key || url.hostname.replace(/^www\./, "").split(".")[0];
  return { url: url.toString(), type, key, name: providedName.trim().slice(0, 100) || titleCase(inferred.replace(/[-_]/g, " ")) };
}

export async function validateJobSourceUrl(rawUrl: string) { await assertPublicUrl(normalizeUrl(rawUrl)); }

export async function scrapeJobSource(source: JobSource) {
  await markSourceRunning(source.id);
  try {
    await assertPublicUrl(new URL(source.url));
    const jobs = source.type === "Lever" ? await scrapeLever(source)
      : source.type === "Greenhouse" ? await scrapeGreenhouse(source)
      : source.type === "Ashby" ? await scrapeAshby(source)
      : await scrapeStructuredData(source);
    if (!jobs.length) throw new ScrapeError("No public jobs were found. Use a company job-board URL or a page containing JobPosting structured data.", 422);
    await replaceSourceJobs(source, dedupe(jobs).slice(0, MAX_JOBS));
    return { imported: Math.min(dedupe(jobs).length, MAX_JOBS), jobs: dedupe(jobs).slice(0, MAX_JOBS) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "The source could not be refreshed.";
    await markSourceFailed(source.id, message);
    throw error;
  }
}

async function scrapeLever(source: JobSource): Promise<ImportedJob[]> {
  const identified = identifyJobSource(source.url);
  const eu = new URL(source.url).hostname === "jobs.eu.lever.co";
  const payload = await fetchJson<LeverJob[]>(`https://api${eu ? ".eu" : ""}.lever.co/v0/postings/${encodeURIComponent(identified.key)}?mode=json&limit=${MAX_JOBS}`);
  return payload.map((job) => normalizeJob({
    externalId: job.id, title: job.text, company: source.name,
    location: job.categories?.location || job.categories?.allLocations?.join(", ") || "Location not specified",
    description: [job.descriptionPlain, ...(job.lists || []).map((item) => `${item.text}: ${stripHtml(item.content)}`)].filter(Boolean).join("\n\n"),
    applyUrl: job.hostedUrl || job.applyUrl, postedAt: job.createdAt ? new Date(job.createdAt).toISOString() : null,
    department: job.categories?.team || job.categories?.department, commitment: job.categories?.commitment,
  }));
}

async function scrapeGreenhouse(source: JobSource): Promise<ImportedJob[]> {
  const key = identifyJobSource(source.url).key;
  const payload = await fetchJson<{ jobs?: GreenhouseJob[] }>(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(key)}/jobs?content=true`);
  return (payload.jobs || []).map((job) => normalizeJob({
    externalId: String(job.id), title: job.title, company: source.name, location: job.location?.name || job.offices?.map((office) => office.location || office.name).filter(Boolean).join(", ") || "Location not specified",
    description: stripHtml(decodeEntities(job.content || "")), applyUrl: job.absolute_url,
    postedAt: job.updated_at || null, department: job.departments?.map((department) => department.name).join(", "),
  }));
}

async function scrapeAshby(source: JobSource): Promise<ImportedJob[]> {
  const key = identifyJobSource(source.url).key;
  const payload = await fetchJson<{ jobs?: AshbyJob[] }>(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(key)}`);
  return (payload.jobs || []).filter((job) => job.isListed !== false && Boolean(job.jobUrl || job.applyUrl)).map((job) => normalizeJob({
    externalId: job.id || stableId(job.jobUrl || job.title), title: job.title, company: source.name,
    location: [job.location, ...(job.secondaryLocations || []).map((location) => typeof location === "string" ? location : location.location)].filter(Boolean).join(", ") || "Location not specified",
    description: job.descriptionPlain || stripHtml(job.descriptionHtml || ""), applyUrl: (job.jobUrl || job.applyUrl)!,
    postedAt: job.publishedAt || null, department: job.department || job.team, commitment: job.employmentType,
    remote: job.isRemote,
  }));
}

export async function parseStructuredJobPage(html: string, pageUrl: string, fallbackCompany = "Company"): Promise<ImportedJob[]> {
  const $ = load(html); const items: unknown[] = [];
  $('script[type="application/ld+json"]').each((_index, element) => {
    try {
      const value = JSON.parse($(element).text()) as unknown;
      collectJobPosting(value, items);
    } catch { /* malformed third-party structured data is ignored */ }
  });
  return items.flatMap((value) => {
    if (!isRecord(value)) return [];
    const title = stringValue(value.title); const description = stripHtml(stringValue(value.description));
    const company = isRecord(value.hiringOrganization) ? stringValue(value.hiringOrganization.name) : fallbackCompany;
    const applyUrl = absoluteUrl(stringValue(value.url) || pageUrl, pageUrl);
    if (!title || !description || !applyUrl) return [];
    const location = structuredLocation(value) || "Location not specified";
    const requirements = splitRequirements([stringValue(value.qualifications), stringValue(value.responsibilities)].filter(Boolean).join(". "));
    return [normalizeJob({
      externalId: isRecord(value.identifier) ? stringValue(value.identifier.value) || stableId(applyUrl) : stableId(applyUrl),
      title, company: company || fallbackCompany, location, description, applyUrl,
      postedAt: validDate(stringValue(value.datePosted)), department: stringValue(value.occupationalCategory),
      commitment: Array.isArray(value.employmentType) ? value.employmentType.join(", ") : stringValue(value.employmentType),
      remote: stringValue(value.jobLocationType).toUpperCase() === "TELECOMMUTE", requirements,
    })];
  });
}

async function scrapeStructuredData(source: JobSource) {
  if (!(await robotsAllows(new URL(source.url)))) throw new ScrapeError("This website's robots.txt does not allow automated access to this page.", 403);
  const html = await fetchText(source.url);
  const direct = await parseGenericJobPage(html, source.url, source.name);
  if (direct.length) return direct;
  const links = discoverJobLinks(html, source.url).slice(0, MAX_DISCOVERED_PAGES);
  const discovered: ImportedJob[] = [];
  for (let index = 0; index < links.length; index += 6) {
    const batch = await Promise.allSettled(links.slice(index, index + 6).map(async (url) => {
      if (!(await robotsAllows(new URL(url)))) return [];
      const page = await fetchText(url); return parseGenericJobPage(page, url, source.name);
    }));
    for (const result of batch) if (result.status === "fulfilled") discovered.push(...result.value);
  }
  return dedupe(discovered);
}

export async function parseGenericJobPage(html: string, pageUrl: string, fallbackCompany = "Company") {
  return dedupe([...(await parseStructuredJobPage(html, pageUrl, fallbackCompany)), ...parseEmbeddedJobs(html, pageUrl, fallbackCompany), ...parseSemanticJobPage(html, pageUrl, fallbackCompany)]);
}

function parseEmbeddedJobs(html: string, pageUrl: string, fallbackCompany: string) {
  const $ = load(html); const records: Record<string, unknown>[] = [];
  $('script[type="application/json"],script#__NEXT_DATA__,script#__NUXT_DATA__').each((_index, element) => {
    const text = $(element).text().trim(); if (!text || text.length > 2_500_000) return;
    try { collectJobLikeRecords(JSON.parse(text), records); } catch { /* non-JSON application state is ignored */ }
  });
  return records.flatMap((record) => normalizeJobLikeRecord(record, pageUrl, fallbackCompany));
}

function parseSemanticJobPage(html: string, pageUrl: string, fallbackCompany: string): ImportedJob[] {
  const $ = load(html); const url = new URL(pageUrl);
  const title = firstText($, ["h1[data-testid*=title]", "h1[class*=job]", "main h1", "article h1", "h1"]);
  const description = firstText($, ["[data-testid*=description]", "[class*=job-description]", "[class*=jobDescription]", "#job-description", "article", "main"]);
  const applyHref = firstHref($, ["a[data-testid*=apply]", "a[class*=apply]", "a[href*='apply']"]);
  const jobSignal = /\/(jobs?|careers?|positions?|openings?|vacanc(?:y|ies))(?:\/|$)/i.test(url.pathname) || Boolean(applyHref) || $("[class*=job-description],[data-testid*=description]").length > 0;
  if (!jobSignal || title.length < 3 || description.length < 100) return [];
  const company = firstText($, ["[data-testid*=company]", "[class*=company]", "meta[property='og:site_name']"]) || fallbackCompany;
  const location = firstText($, ["[data-testid*=location]", "[class*=location]", "[itemprop=jobLocation]"]) || "Location not specified";
  const applyUrl = absoluteUrl(applyHref || pageUrl, pageUrl); if (!applyUrl) return [];
  return [normalizeJob({ externalId: stableId(applyUrl), title, company, location, description, applyUrl, postedAt: null })];
}

function discoverJobLinks(html: string, pageUrl: string) {
  const $ = load(html); const base = new URL(pageUrl); const links = new Set<string>();
  $("a[href]").each((_index, element) => {
    const href = $(element).attr("href") || "";
    try { const url = new URL(href, base); if (url.origin !== base.origin || !/^https:$/.test(url.protocol)) return; if (!/\/(jobs?|careers?|positions?|openings?|vacanc(?:y|ies))(?:\/|[-?=])/i.test(`${url.pathname}${url.search}`)) return; if (/\/(results?|search)(?:\/|$)/i.test(url.pathname)) return; url.hash = ""; links.add(url.toString()); } catch { /* invalid links are ignored */ }
  });
  return [...links];
}

function collectJobLikeRecords(value: unknown, output: Record<string, unknown>[], depth = 0) {
  if (depth > 12 || output.length > MAX_JOBS * 2) return;
  if (Array.isArray(value)) { for (const item of value) collectJobLikeRecords(item, output, depth + 1); return; }
  if (!isRecord(value)) return;
  const title = recordString(value, ["jobTitle", "title", "positionTitle"]); const description = recordString(value, ["jobDescription", "description", "content", "descriptionPlain"]); const url = recordString(value, ["applyUrl", "jobUrl", "absolute_url", "url"]);
  if (title.length >= 3 && (description.length >= 80 || url.length > 0)) output.push(value);
  for (const child of Object.values(value)) if (child && typeof child === "object") collectJobLikeRecords(child, output, depth + 1);
}

function normalizeJobLikeRecord(value: Record<string, unknown>, pageUrl: string, fallbackCompany: string): ImportedJob[] {
  const title = recordString(value, ["jobTitle", "title", "positionTitle"]); const description = stripHtml(recordString(value, ["jobDescription", "description", "content", "descriptionPlain"]));
  const applyUrl = absoluteUrl(recordString(value, ["applyUrl", "jobUrl", "absolute_url", "url"]) || pageUrl, pageUrl);
  if (title.length < 3 || description.length < 80 || !applyUrl) return [];
  return [normalizeJob({ externalId: recordString(value, ["id", "jobId", "identifier"]) || stableId(applyUrl), title, company: recordString(value, ["company", "companyName", "organizationName"]) || fallbackCompany, location: recordString(value, ["location", "locationName", "city"]) || "Location not specified", description, applyUrl, postedAt: recordString(value, ["datePosted", "publishedAt", "createdAt"]) || null, department: recordString(value, ["department", "team"]), commitment: recordString(value, ["employmentType", "commitment"]), remote: Boolean(value.isRemote) })];
}

function normalizeJob(input: { externalId: string; title: string; company: string; location: string; description: string; applyUrl: string; postedAt: string | null; department?: string; commitment?: string; remote?: boolean; requirements?: string[] }): ImportedJob {
  const description = input.description.replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ").trim().slice(0, 16_000);
  const skills = extractSkills(`${input.title} ${description}`);
  return {
    externalId: String(input.externalId).slice(0, 200), title: input.title.trim().slice(0, 180), company: input.company.trim().slice(0, 120),
    location: input.location.trim().slice(0, 200), workMode: inferWorkMode(input.location, input.remote), description,
    applyUrl: input.applyUrl, postedAt: validDate(input.postedAt || ""), skills,
    requirements: input.requirements?.length ? input.requirements.slice(0, 12) : splitRequirements(description).slice(0, 8),
    category: inferCategory(input.title, input.department || ""), level: inferLevel(input.title),
  };
}

async function fetchJson<T>(url: string) { return JSON.parse(await fetchText(url)) as T; }

async function fetchText(rawUrl: string, redirects = 0): Promise<string> {
  const url = normalizeUrl(rawUrl); await assertPublicUrl(url);
  const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(20_000), headers: { "User-Agent": USER_AGENT, Accept: "application/json,text/html;q=0.9" } });
  if ([301, 302, 303, 307, 308].includes(response.status)) {
    if (redirects >= 3) throw new ScrapeError("The source redirected too many times.", 422);
    const location = response.headers.get("location"); if (!location) throw new ScrapeError("The source returned an invalid redirect.", 422);
    return fetchText(new URL(location, url).toString(), redirects + 1);
  }
  if (!response.ok) throw new ScrapeError(`The source returned HTTP ${response.status}.`, response.status === 404 ? 404 : 422);
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > MAX_RESPONSE_BYTES) throw new ScrapeError("The source response is too large.", 413);
  if (!response.body) return "";
  const reader = response.body.getReader(); const decoder = new TextDecoder(); let result = ""; let bytes = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    bytes += value.byteLength; if (bytes > MAX_RESPONSE_BYTES) { await reader.cancel(); throw new ScrapeError("The source response is too large.", 413); }
    result += decoder.decode(value, { stream: true });
  }
  return result + decoder.decode();
}

async function robotsAllows(url: URL) {
  try {
    let pending = robotsCache.get(url.origin); if (!pending) { pending = fetchText(`${url.origin}/robots.txt`); robotsCache.set(url.origin, pending); }
    const robots = await pending;
    let applies = false;
    for (const raw of robots.split(/\r?\n/)) {
      const line = raw.split("#")[0].trim(); const [field, ...rest] = line.split(":"); const value = rest.join(":").trim();
      if (field?.toLowerCase() === "user-agent") applies = value === "*" || value.toLowerCase().includes("carrerfitjobindexer");
      if (applies && field?.toLowerCase() === "disallow" && value && url.pathname.startsWith(value)) return false;
    }
    return true;
  } catch { return true; }
}

async function assertPublicUrl(url: URL) {
  if (url.protocol !== "https:") throw new ScrapeError("Only HTTPS job-source URLs are allowed.", 400);
  if (url.username || url.password || url.port) throw new ScrapeError("Credentials and custom ports are not allowed in source URLs.", 400);
  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".local") || hostname.endsWith(".internal")) throw new ScrapeError("Private network addresses are not allowed.", 400);
  const addresses = await lookup(hostname, { all: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) throw new ScrapeError("The source resolves to a private or restricted network.", 400);
}

function isPrivateAddress(address: string) {
  const normalized = address.toLowerCase();
  if (normalized === "::1" || normalized === "::" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb")) return true;
  const ipv4 = normalized.replace(/^::ffff:/, "").split(".").map(Number);
  if (ipv4.length !== 4 || ipv4.some(Number.isNaN)) return false;
  const [a, b] = ipv4;
  return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19));
}

function collectJobPosting(value: unknown, output: unknown[]) {
  if (Array.isArray(value)) { value.forEach((item) => collectJobPosting(item, output)); return; }
  if (!isRecord(value)) return;
  const type = value["@type"];
  if (type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting"))) output.push(value);
  if (Array.isArray(value["@graph"])) value["@graph"].forEach((item) => collectJobPosting(item, output));
}

function structuredLocation(value: Record<string, unknown>) {
  if (stringValue(value.jobLocationType).toUpperCase() === "TELECOMMUTE") return "Remote";
  const locations = Array.isArray(value.jobLocation) ? value.jobLocation : value.jobLocation ? [value.jobLocation] : [];
  return locations.map((location) => {
    if (!isRecord(location)) return ""; const address = isRecord(location.address) ? location.address : location;
    return [address.addressLocality, address.addressRegion, address.addressCountry].map(stringValue).filter(Boolean).join(", ");
  }).filter(Boolean).join(" · ");
}

const skillVocabulary = ["SQL","Python","JavaScript","TypeScript","React","Node.js","Java","AWS","Azure","GCP","Docker","Kubernetes","Tableau","Power BI","Excel","Salesforce","Figma","Product management","Product design","Data analysis","Machine learning","AI","REST APIs","Git","CI/CD","Customer success","Marketing","Communication","Leadership"];
function extractSkills(text: string) { const lower = text.toLowerCase(); return skillVocabulary.filter((skill) => lower.includes(skill.toLowerCase())).slice(0, 12); }
function splitRequirements(text: string) { return text.split(/(?:\n+|(?<=[.!?])\s+)/).map((item) => item.replace(/^[-•\s]+/, "").trim()).filter((item) => item.length >= 25 && item.length <= 260).slice(0, 12); }
function inferWorkMode(location: string, remote = false): ImportedJob["workMode"] { const value = location.toLowerCase(); return remote || value.includes("remote") ? "Remote" : value.includes("hybrid") ? "Hybrid" : "On-site"; }
function inferCategory(title: string, department: string) { const text = `${title} ${department}`.toLowerCase(); if (/engineer|developer|software|devops|security/.test(text)) return "Engineering"; if (/design|ux|ui/.test(text)) return "Design"; if (/data|analytics|scientist|business intelligence/.test(text)) return "Data"; if (/market|growth|content/.test(text)) return "Marketing"; if (/customer|success|support|account/.test(text)) return "Customer Success"; if (/product/.test(text)) return "Product"; if (/sales|revenue/.test(text)) return "Salesforce"; return "Other"; }
function inferLevel(title: string) { const value = title.toLowerCase(); return /intern|junior|associate|entry/.test(value) ? "Entry level" : /senior|staff|principal|lead|director|head|vp|chief/.test(value) ? "Senior level" : "Mid level"; }
function normalizeUrl(value: string) { try { return new URL(value.trim()); } catch { throw new ScrapeError("Enter a valid HTTPS job-board URL.", 400); } }
function absoluteUrl(value: string, base: string) { try { return new URL(value, base).toString(); } catch { return ""; } }
function validDate(value: string) { if (!value) return null; const date = new Date(value); return Number.isNaN(date.getTime()) ? null : date.toISOString(); }
function stripHtml(value: string) { return load(`<body>${value}</body>`)("body").text().replace(/\s+/g, " ").trim(); }
function decodeEntities(value: string) { return load(`<body>${value}</body>`)("body").text(); }
function stableId(value: string) { return createHash("sha256").update(value).digest("hex").slice(0, 32); }
function stringValue(value: unknown) { return typeof value === "string" || typeof value === "number" ? String(value).trim() : ""; }
function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function titleCase(value: string) { return value.replace(/\b\w/g, (character) => character.toUpperCase()); }
function dedupe(jobs: ImportedJob[]) { return [...new Map(jobs.filter((job) => job.title && job.applyUrl).map((job) => [`${job.externalId}:${job.applyUrl}`, job])).values()]; }
function recordString(value: Record<string, unknown>, keys: string[]) { for (const key of keys) { const item = value[key]; if (typeof item === "string" || typeof item === "number") return String(item).trim(); if (isRecord(item) && typeof item.name === "string") return item.name.trim(); } return ""; }
function firstText($: ReturnType<typeof load>, selectors: string[]) { for (const selector of selectors) { const element = $(selector).first(); const value = element.is("meta") ? element.attr("content")?.trim() : element.text().replace(/\s+/g, " ").trim(); if (value) return value; } return ""; }
function firstHref($: ReturnType<typeof load>, selectors: string[]) { for (const selector of selectors) { const value = $(selector).first().attr("href")?.trim(); if (value) return value; } return ""; }

type LeverJob = { id: string; text: string; categories?: { location?: string; allLocations?: string[]; commitment?: string; team?: string; department?: string }; descriptionPlain?: string; lists?: { text: string; content: string }[]; hostedUrl: string; applyUrl: string; createdAt?: number };
type GreenhouseJob = { id: number; title: string; updated_at?: string; location?: { name?: string }; absolute_url: string; content?: string; departments?: { name: string }[]; offices?: { name?: string; location?: string }[] };
type AshbyJob = { id?: string; title: string; location?: string; secondaryLocations?: (string | { location?: string })[]; department?: string; team?: string; descriptionPlain?: string; descriptionHtml?: string; jobUrl: string; applyUrl?: string; isRemote?: boolean; isListed?: boolean; publishedAt?: string; employmentType?: string };

export class ScrapeError extends Error { constructor(message: string, public status = 422) { super(message); } }
