import type { InterviewTurn, ResumeProfile } from "../lib/types.js";
import { createInterviewPlan, evaluateInterviewAnswer } from "../server/interview.js";

process.env.CARRERFIT_DISABLE_AI = "1";

const profile: ResumeProfile = {
  name: "Aarav Mehta",
  headline: "Product analyst with experimentation experience",
  summary: "Five years improving product decisions through SQL, dashboards, and controlled experiments.",
  yearsExperience: 5,
  skills: ["SQL", "Experimentation", "Tableau", "Stakeholder communication"],
  strengths: ["Structured analysis", "Clear communication"],
  targetRoles: ["Senior Product Analyst"],
  seniority: "Mid-level",
  education: ["BSc Computer Science"],
  improvements: ["Quantify portfolio outcomes"],
};

async function main() {
  const plan = await createInterviewPlan(null, profile, "Senior Product Analyst", 3);
  if (plan.firstQuestion.id !== "q1" || plan.totalQuestions !== 3 || plan.aiPowered) throw new Error("Fallback interview plan is invalid.");

  const camera = { cameraEnabled: true, faceDetectionSupported: false, facePresentRatio: 0, averageBrightness: 110, stabilityScore: 84 };
  const turns: InterviewTurn[] = [];
  let question = plan.firstQuestion;
  for (let turnNumber = 1; turnNumber <= 3; turnNumber += 1) {
    const answer = "I owned the SQL analysis and experiment design, aligned the team on success metrics, and delivered a dashboard that reduced decision time by 30 percent. I learned to validate assumptions with users before finalizing the measurement plan.";
    const response = await evaluateInterviewAnswer({ profile, targetRole: plan.targetRole, question, answer, turns, turnNumber, totalQuestions: 3, camera });
    turns.push({ question, answer, evaluation: response.evaluation });
    if (turnNumber < 3) {
      if (!response.nextQuestion || response.complete) throw new Error("Adaptive fallback question is missing.");
      question = response.nextQuestion;
    } else if (!response.complete || !response.report || response.report.dimensions.length < 4) throw new Error("Final interview report is invalid.");
  }

  console.log("Interview fallback flow passed: tailored plan → adaptive questions → final report.");
}

main().catch((error) => { console.error(error); process.exit(1); });
