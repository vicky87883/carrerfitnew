import type { Job, ResumeProfile } from "../lib/types.js";

export type MatchAnalysis = {
  profile: ResumeProfile;
  matches: { jobId: string; fitScore: number; matchedSkills: string[]; missingSkills: string[]; matchReason: string }[];
  aiPowered: false;
};

const aliases: Record<string, string[]> = {
  "SQL": ["sql", "postgresql", "mysql", "querying"], "Python": ["python", "pandas", "numpy"], "Excel": ["excel", "spreadsheets", "google sheets"],
  "Power BI": ["power bi", "powerbi"], "Tableau": ["tableau"], "Looker Studio": ["looker studio", "google data studio"], "BigQuery": ["bigquery", "big query"], "dbt": ["dbt", "data build tool"],
  "A/B testing": ["a/b testing", "ab testing", "experimentation", "hypothesis testing"], "Data visualization": ["data visualization", "visualisation", "dashboards", "business intelligence"],
  "Product analytics": ["product analytics", "product metrics", "mixpanel", "amplitude"], "AI tools": ["ai tools", "artificial intelligence", "llm", "generative ai", "chatgpt", "claude", "codex"],
  "Automation": ["automation", "automated", "workflow automation"], "Stakeholder management": ["stakeholder management", "stakeholders", "cross-functional"],
  "Figma": ["figma"], "Product design": ["product design", "ux design", "ui design", "user experience"], "UX research": ["ux research", "user research", "customer interviews"],
  "Prototyping": ["prototype", "prototyping", "wireframe", "wireframing"], "Design systems": ["design system", "component library"], "Usability testing": ["usability testing", "user testing"],
  "TypeScript": ["typescript"], "JavaScript": ["javascript", "ecmascript"], "React": ["react", "react.js", "next.js", "nextjs"], "Angular": ["angular"], "Node.js": ["node.js", "nodejs", "express.js", "express"],
  "Java": ["java", "spring boot"], "REST APIs": ["rest api", "restful", "api development"], "Databases": ["database", "postgres", "mongodb", "mysql"], "Docker": ["docker", "containerization"], "CI/CD": ["ci/cd", "continuous integration", "github actions", "jenkins"],
  "Playwright": ["playwright"], "Test automation": ["test automation", "automated testing", "selenium", "cypress"], "Git": ["git", "github", "version control"], "API testing": ["api testing", "postman"], "Quality assurance": ["quality assurance", " qa ", "software testing"],
  "Customer success": ["customer success", "customer experience"], "SaaS": ["saas", "software as a service"], "Executive communication": ["executive communication", "executive stakeholders", "c-level"],
  "QBRs": ["qbr", "business review"], "Salesforce": ["salesforce", "sales cloud", "service cloud"], "Cloud": ["cloud", "aws", "azure", "gcp"], "Account management": ["account management", "key accounts"], "Retention": ["retention", "churn", "renewals"],
  "Product marketing": ["product marketing", "product marketer"], "Positioning": ["positioning", "market positioning"], "Messaging": ["messaging", "value proposition"], "Go-to-market": ["go-to-market", "go to market", "gtm"],
  "Product launches": ["product launch", "launch strategy"], "Customer research": ["customer research", "market research", "voice of customer"], "Sales enablement": ["sales enablement", "battlecards"], "B2B SaaS": ["b2b saas", "enterprise software"],
  "CRM": ["crm", "hubspot"], "Revenue operations": ["revenue operations", "revops", "sales operations"], "Financial modeling": ["financial modeling", "financial modelling"],
  "Econometrics": ["econometrics", "economic modeling"], "Data engineering": ["data engineering", "etl", "data pipelines"], "Blockchain": ["blockchain", "crypto", "defi", "web3"],
};

const familyTerms: Record<string, string[]> = {
  Data: ["data analyst", "analytics", "business intelligence", "sql", "dashboard", "statistics", "tableau", "power bi", "dbt", "bigquery", "data visualization"],
  Product: ["product analyst", "product analytics", "product manager", "product metrics", "roadmap", "feature adoption", "user behavior"],
  Design: ["product designer", "ux designer", "ui designer", "user experience", "figma", "prototype", "wireframe", "design system", "usability"],
  Engineering: ["software engineer", "software developer", "full stack", "frontend", "backend", "typescript", "javascript", "react", "node.js", "java", "api", "docker", "test automation", "quality assurance"],
  Marketing: ["product marketing", "marketing manager", "positioning", "messaging", "go-to-market", "campaign", "content marketing", "brand", "sales enablement"],
  "Customer Success": ["customer success", "account manager", "client success", "onboarding", "adoption", "retention", "renewal", "qbr", "customer relationship"],
  Salesforce: ["salesforce", "revenue operations", "revops", "sales operations", "crm administrator", "sales cloud"],
};

const stopWords = new Set(["senior", "junior", "lead", "associate", "manager", "specialist", "engineer", "analyst", "the", "and", "for", "with"]);
const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9+#./ -]/g, " ").replace(/\s+/g, " ").trim();
const includesAlias = (text: string, term: string) => (aliases[term] || [term.toLowerCase()]).some((alias) => text.includes(normalize(alias)));

function extractYears(text: string) {
  const values = [...text.matchAll(/(\d{1,2})\+?\s*(?:years?|yrs?)/gi)].map((match) => Number(match[1])).filter((value) => value <= 50);
  const numberWords: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20 };
  for (const match of text.matchAll(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty)\s+(?:years?|yrs?)\b/gi)) values.push(numberWords[match[1].toLowerCase()]);
  return values.length ? Math.max(...values) : 0;
}

function familyEvidence(text: string) {
  return Object.fromEntries(Object.entries(familyTerms).map(([family, terms]) => [family, terms.reduce((sum, term) => sum + (text.includes(term) ? (term.includes(" ") ? 2 : 1) : 0), 0)]));
}

function seniorityFit(level: string, years: number) {
  if (!years) return .45;
  if (level === "Senior level") return years >= 5 ? 1 : years >= 3 ? .55 : .1;
  if (level === "Mid level") return years >= 2 && years <= 9 ? 1 : years < 2 ? .55 : .75;
  return years <= 4 ? 1 : .65;
}

function titleEvidence(text: string, title: string) {
  const tokens = normalize(title).split(" ").filter((token) => token.length > 3 && !stopWords.has(token));
  return tokens.length ? tokens.filter((token) => text.includes(token)).length / tokens.length : 0;
}

export function matchResumeLocally(resumeText: string, jobs: Job[]): MatchAnalysis {
  const text = ` ${normalize(resumeText)} `;
  const yearsExperience = extractYears(resumeText);
  const allSkills = [...new Set(jobs.flatMap((job) => job.skills).concat(Object.keys(aliases)))];
  const skills = allSkills.filter((skill) => includesAlias(text, skill));
  const familyScores = familyEvidence(text);
  const strongestFamilyScore = Math.max(0, ...Object.values(familyScores));
  const rankedFamilies = Object.entries(familyScores).sort((a, b) => b[1] - a[1]).filter(([, score]) => score > 0);

  const matches = jobs.map((job) => {
    const matchedSkills = job.skills.filter((skill) => includesAlias(text, skill));
    const missingSkills = job.skills.filter((skill) => !matchedSkills.includes(skill)).slice(0, 5);
    const skillCoverage = matchedSkills.length / Math.max(job.skills.length, 1);
    const familyScore = familyScores[job.category] || 0;
    const familyFit = strongestFamilyScore ? familyScore / strongestFamilyScore : 0;
    const requirementMatches = job.requirements.filter((requirement) => normalize(requirement).split(" ").filter((token) => token.length > 4 && !stopWords.has(token)).some((token) => text.includes(token)));
    const requirementFit = requirementMatches.length / Math.max(job.requirements.length, 1);
    const titleFit = titleEvidence(text, job.title);
    const experienceFit = seniorityFit(job.level, yearsExperience);
    const evidenceBonus = Math.min(5, matchedSkills.length);
    let score = 6 + familyFit * 34 + skillCoverage * 34 + requirementFit * 10 + titleFit * 7 + experienceFit * 5 + evidenceBonus;
    if (strongestFamilyScore > 0 && familyFit < .2 && skillCoverage < .2) score -= 18;
    if (job.level === "Senior level" && yearsExperience > 0 && yearsExperience < 2) score -= 12;
    score = Math.max(5, Math.min(96, Math.round(score)));
    const evidence = matchedSkills.slice(0, 3);
    const matchReason = evidence.length >= 2
      ? `Strong evidence from ${evidence.join(", ")}${familyFit >= .6 ? ` and your ${job.category.toLowerCase()} background` : ""}. ${experienceFit < .5 ? "The seniority requirement may be a stretch." : "Your experience level is aligned."}`
      : evidence.length === 1
        ? `${evidence[0]} transfers to this role, but the resume shows limited evidence for the broader ${job.category.toLowerCase()} requirements.`
        : `Little direct evidence for this ${job.category.toLowerCase()} role was found in the resume.`;
    return { jobId: job.id, fitScore: score, matchedSkills, missingSkills, matchReason };
  }).filter((match) => match.fitScore >= 32).sort((a, b) => b.fitScore - a.fitScore).slice(0, 8);

  const targetRoles = matches.slice(0, 4).map((match) => jobs.find((job) => job.id === match.jobId)!.title);
  const firstLine = resumeText.split("\n").map((line) => line.trim()).find((line) => /^[a-z][a-z .'-]{2,60}$/i.test(line)) || "Candidate";
  const education = resumeText.split("\n").filter((line) => /(bachelor|master|b\.?tech|m\.?tech|mba|university|college)/i.test(line)).slice(0, 4);
  const topFamily = rankedFamilies[0]?.[0];
  const headline = topFamily ? `${yearsExperience >= 5 ? "Experienced" : yearsExperience >= 2 ? "Mid-level" : "Emerging"} ${topFamily} professional` : "Career profile ready for review";
  const summary = matches.length
    ? `Your resume shows strongest evidence for ${topFamily || "specialist"} work, with ${skills.slice(0, 4).join(", ") || "transferable experience"} driving the top matches.`
    : "This resume does not yet show enough direct evidence for the current live roles. The recommendations below focus on improving role-specific proof before applying.";
  return { aiPowered: false, profile: { name: firstLine, headline, summary, yearsExperience, skills, strengths: skills.slice(0, 6), targetRoles, seniority: yearsExperience >= 5 ? "Senior level" : yearsExperience >= 2 ? "Mid level" : "Entry level", education, improvements: ["Quantify outcomes with metrics", `Add clearer evidence for ${topFamily || "your target role"} responsibilities`, "Lead each experience bullet with a specific contribution"] }, matches };
}
