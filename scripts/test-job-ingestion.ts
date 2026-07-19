import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { identifyJobSource, parseGenericJobPage, parseStructuredJobPage, validateJobSourceUrl } from "../server/job-scraper.js";

async function main() {
  const directory = await mkdtemp(join(tmpdir(), "carrerfit-jobs-"));
  process.env.CARRERFIT_DB_PATH = join(directory, "test.sqlite");
  const database = await import("../server/job-database.js");
  try {
    if (identifyJobSource("https://jobs.lever.co/acme").type !== "Lever") throw new Error("Lever detection failed.");
    if (identifyJobSource("https://boards.greenhouse.io/acme").type !== "Greenhouse") throw new Error("Greenhouse detection failed.");
    if (identifyJobSource("https://jobs.ashbyhq.com/acme").type !== "Ashby") throw new Error("Ashby detection failed.");
    await validateJobSourceUrl("https://localhost/jobs").then(() => { throw new Error("Private URL was accepted."); }, () => undefined);

    const html = `<html><head><script type="application/ld+json">{
      "@context":"https://schema.org","@type":"JobPosting","identifier":{"value":"role-42"},
      "title":"Senior Data Analyst","description":"Lead SQL analysis, build Tableau dashboards, and communicate experiment results to product leaders. Own measurement strategy and improve customer outcomes.",
      "datePosted":"2026-07-17","employmentType":"FULL_TIME","jobLocationType":"TELECOMMUTE",
      "hiringOrganization":{"name":"Acme Analytics"},"url":"https://careers.example.com/jobs/42",
      "qualifications":"Five years of SQL and data visualization experience. Strong stakeholder communication."
    }</script></head></html>`;
    const parsed = await parseStructuredJobPage(html, "https://careers.example.com/jobs/42", "Acme");
    if (parsed.length !== 1 || parsed[0].title !== "Senior Data Analyst" || parsed[0].workMode !== "Remote") throw new Error("JobPosting parser failed.");
    const embedded = await parseGenericJobPage(`<script id="__NEXT_DATA__" type="application/json">{"props":{"jobs":[{"jobTitle":"Product Engineer","jobDescription":"Build and maintain TypeScript services, React interfaces, APIs, automated tests, and reliable production systems with a collaborative product team.","jobUrl":"/careers/jobs/product-engineer","companyName":"Acme","location":"Remote"}]}}</script>`, "https://careers.example.com/jobs", "Acme");
    if (embedded.length !== 1 || embedded[0].title !== "Product Engineer") throw new Error("Embedded application-data parser failed.");
    const source = await database.createJobSource({ name: "Acme Analytics", url: "https://careers.example.com/jobs/42", type: "Structured data" });
    await database.replaceSourceJobs(source, parsed);
    const jobs = await database.listImportedJobs({ q: "analyst" });
    if (jobs.length !== 1 || !jobs[0].imported || jobs[0].source !== "Company careers") throw new Error("Database import failed.");
    const overview = await database.getJobSourceOverview();
    if (overview.stats.activeJobs !== 1 || overview.sources[0].activeJobCount !== 1) throw new Error("Source statistics failed.");
    await database.replaceSourceJobs(source, []);
    if ((await database.listImportedJobs()).length !== 0) throw new Error("Stale job deactivation failed.");
    console.log("Job ingestion passed: source detection → SSRF guard → JobPosting parse → deduplicated database lifecycle.");
  } finally {
    await database.closeJobDatabaseForTests();
    await rm(directory, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
