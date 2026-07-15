export type Job = {
  id: string;
  title: string;
  company: string;
  location: string;
  workMode: "Remote" | "Hybrid" | "On-site";
  salaryMin: number;
  salaryMax: number;
  category: string;
  level: string;
  description: string;
  skills: string[];
  fitScore: number;
  postedDaysAgo: number;
  logo: string;
  featured?: boolean;
  applyUrl: string;
  source: "Lever" | "Ashby" | "Company careers";
  verifiedAt: string;
  requirements: string[];
};

export type ResumeProfile = {
  name: string;
  headline: string;
  summary: string;
  yearsExperience: number;
  skills: string[];
  strengths: string[];
  targetRoles: string[];
  seniority: string;
  education: string[];
  improvements: string[];
};

export type RankedJob = Job & {
  fitScore: number;
  matchConfidence: "Strong" | "Good" | "Exploratory";
  matchedSkills: string[];
  missingSkills: string[];
  matchReason: string;
};

export type ResumeMatchResult = {
  profile: ResumeProfile;
  jobs: RankedJob[];
  aiPowered: boolean;
  file: { name: string; type: string; size: number; charactersRead: number };
  analyzedAt: string;
};

export type AssessmentAnswers = {
  interests: string[];
  strengths: string[];
  workStyle: string;
  experience: number;
  goal: string;
};

export type CareerMatch = {
  role: string;
  score: number;
  summary: string;
  strengths: string[];
  gaps: string[];
  nextSteps: string[];
};

export type Application = {
  id: string;
  jobId: string;
  status: "Saved" | "Applied" | "Interview" | "Offer";
  createdAt: string;
};

export type DashboardData = {
  profile: { name: string; email: string; completion: number };
  matches: CareerMatch[];
  applications: (Application & { job: Job })[];
  stats: { saved: number; applied: number; interviews: number; readiness: number };
};
