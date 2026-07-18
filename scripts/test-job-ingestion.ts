import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { identifyJobSource, parseStructuredJobPage, validateJobSourceUrl } from "../server/job-scraper.js";

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
    const source = database.createJobSource({ name: "Acme Analytics", url: "https://careers.example.com/jobs/42", type: "Structured data" });
    database.replaceSourceJobs(source, parsed);
    const jobs = database.listImportedJobs({ q: "analyst" });
    if (jobs.length !== 1 || !jobs[0].imported || jobs[0].source !== "Company careers") throw new Error("Database import failed.");
    const overview = database.getJobSourceOverview();
    if (overview.stats.activeJobs !== 1 || overview.sources[0].activeJobCount !== 1) throw new Error("Source statistics failed.");
    database.replaceSourceJobs(source, []);
    if (database.listImportedJobs().length !== 0) throw new Error("Stale job deactivation failed.");
    console.log("Job ingestion passed: source detection → SSRF guard → JobPosting parse → deduplicated database lifecycle.");
  } finally {
    database.closeJobDatabaseForTests();
    await rm(directory, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
