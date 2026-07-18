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
  source: "Lever" | "Ashby" | "Greenhouse" | "Company careers";
  verifiedAt: string;
  requirements: string[];
  imported?: boolean;
  sourceName?: string;
};

export type JobSource = {
  id: string;
  name: string;
  url: string;
  type: "Lever" | "Ashby" | "Greenhouse" | "Structured data";
  enabled: boolean;
  createdAt: string;
  lastScrapedAt: string | null;
  lastStatus: "Pending" | "Running" | "Success" | "Failed";
  lastError: string | null;
  lastImportCount: number;
  activeJobCount: number;
};

export type JobSourceOverview = {
  sources: JobSource[];
  stats: { sources: number; activeJobs: number; last24Hours: number; failedSources: number };
  recentJobs: Job[];
};

export type BlogPost = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  category: string;
  tags: string[];
  authorName: string;
  seoTitle: string;
  seoDescription: string;
  featured: boolean;
  status: "Draft" | "Published";
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  readingMinutes: number;
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
  storedForAccount?: boolean;
};

export type InterviewQuestion = {
  id: string;
  text: string;
  category: "Introduction" | "Experience" | "Behavioral" | "Technical" | "Situational" | "Closing";
  intent: string;
};

export type InterviewEvaluation = {
  score: number;
  feedback: string;
  strongPoint: string;
  improvement: string;
  suggestedStructure: string;
};

export type InterviewTurn = {
  question: InterviewQuestion;
  answer: string;
  evaluation: InterviewEvaluation;
};

export type CameraMetrics = {
  cameraEnabled: boolean;
  faceDetectionSupported: boolean;
  facePresentRatio: number;
  averageBrightness: number;
  stabilityScore: number;
};

export type InterviewReport = {
  overallScore: number;
  summary: string;
  verdict: string;
  dimensions: { name: string; score: number; note: string }[];
  strengths: string[];
  improvements: string[];
  nextSteps: string[];
  modelAnswer: string;
};

export type InterviewStartResult = {
  profile: ResumeProfile;
  targetRole: string;
  focusAreas: string[];
  firstQuestion: InterviewQuestion;
  totalQuestions: number;
  aiPowered: boolean;
};

export type InterviewResponseResult = {
  evaluation: InterviewEvaluation;
  nextQuestion: InterviewQuestion | null;
  complete: boolean;
  report: InterviewReport | null;
  aiPowered: boolean;
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
  resumeProfile?: ResumeProfile | null;
  resumeJobs?: RankedJob[];
  matches: CareerMatch[];
  applications: (Application & { job: Job })[];
  stats: { saved: number; applied: number; interviews: number; readiness: number };
};
