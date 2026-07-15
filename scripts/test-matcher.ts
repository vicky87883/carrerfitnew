import assert from "node:assert/strict";
import { jobs } from "../server/data/jobs.js";
import { matchResumeLocally } from "../server/matcher.js";

const fixtures = [
  { expected: "Data", resume: "ARJUN MEHTA\nData Analyst with 4 years of experience. Built SQL models with BigQuery and dbt, Power BI and Tableau dashboards, Python automation, A/B testing, data visualization, and stakeholder presentations." },
  { expected: "Design", resume: "MEERA SHAH\nSenior Product Designer with six years of experience. Led UX research, user interviews, Figma prototypes, wireframes, usability testing, enterprise design systems, and product design for complex SaaS workflows." },
  { expected: "Engineering", resume: "ROHAN DAS\nFull Stack Software Engineer with three years of experience building React and TypeScript applications, Node.js REST APIs, PostgreSQL databases, Docker deployments, CI/CD pipelines, Git, and automated Playwright tests." },
  { expected: "Customer Success", resume: "ANANYA SINGH\nCustomer Success Manager with seven years of experience in B2B SaaS. Owned enterprise accounts, onboarding, adoption, QBRs, executive communication, Salesforce, renewals, retention, and churn reduction." },
  { expected: "Marketing", resume: "KABIR KHAN\nSenior Product Marketing Manager with six years of experience in B2B SaaS. Owned positioning, messaging, go-to-market strategy, product launches, customer research, sales enablement, content, and campaign measurement." },
];

const topIds = new Set<string>();
for (const fixture of fixtures) {
  const result = matchResumeLocally(fixture.resume, jobs);
  assert.ok(result.matches.length > 0, `${fixture.expected} resume should produce matches`);
  const top = jobs.find((job) => job.id === result.matches[0].jobId);
  assert.equal(top?.category, fixture.expected, `${fixture.expected} resume ranked ${top?.category} first`);
  assert.ok(result.matches[0].fitScore >= 65, `${fixture.expected} top match should have meaningful evidence`);
  topIds.add(result.matches[0].jobId);
  console.log(`${fixture.expected.padEnd(16)} → ${top?.title} at ${top?.company} (${result.matches[0].fitScore}%)`);
}
assert.equal(topIds.size, fixtures.length, "Contrasting resumes must not collapse to the same top job");
console.log("Matcher regression suite passed.");
