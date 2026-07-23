import assert from "node:assert/strict";
import { analyzeAts } from "../server/ats.js";
import type { ResumeDocument } from "../lib/types.js";

const text = `ARJUN MEHTA
arjun@example.com +91 98765 43210 Bengaluru
https://linkedin.com/in/arjun
SUMMARY
Data analyst delivering measurable business outcomes.
SKILLS
SQL, Python, Tableau, Power BI, dbt, BigQuery
EXPERIENCE
Senior Data Analyst | Example Co | 2021–Present
- Improved reporting speed by 45% for 30 users.
- Built 12 executive dashboards and reduced manual work by 20 hours monthly.
- Led analytics delivery for 8 projects.
EDUCATION
BSc Computer Science`;

const document: ResumeDocument = {
  schemaVersion: 1, identity: { fullName: "Arjun Mehta", givenName: "Arjun", surname: "Mehta", email: "arjun@example.com", phone: "+91 98765 43210", location: "Bengaluru", links: ["https://linkedin.com/in/arjun"] },
  headline: "Senior Data Analyst", summary: "Data analyst", skills: ["SQL", "Python", "Tableau", "Power BI", "dbt", "BigQuery"].map((name) => ({ name, category: "Technical", evidence: "Experience", confidence: .9 })),
  experience: [{ company: "Example Co", title: "Senior Data Analyst", location: "", startDate: "2021", endDate: "", current: true, description: "", achievements: [], technologies: ["SQL"] }],
  education: [{ institution: "University", degree: "BSc", field: "Computer Science", startDate: "", endDate: "", details: "" }],
  certifications: [], projects: [], languages: [], keywords: ["analytics", "reporting", "stakeholder", "dashboard", "automation", "data visualization"],
  sectionsDetected: ["Summary", "Skills", "Experience", "Education"], wordCount: text.split(/\s+/).length, characterCount: text.length, extractionConfidence: .95, warnings: [],
};

const result = analyzeAts(text, document);
assert.ok(result.score >= 70, `Expected strong structured resume score, received ${result.score}`);
assert.equal(result.categories.length, 5);
assert.ok(result.metrics.quantifiedAchievements >= 3);
assert.ok(result.disclaimer.includes("cannot guarantee"));
console.log("ATS analysis tests passed.");
