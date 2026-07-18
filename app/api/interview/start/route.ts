import { apiFailure, rateLimit, resumeFileFromForm } from "@/app/api/_utils";
import { createInterviewPlan, parseInterviewProfile } from "@/server/interview";
import { extractResumeText } from "@/server/resume";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const limited = rateLimit(request, "interview");
  if (limited) return limited;

  try {
    const form = await request.formData();
    const totalQuestions = Math.max(3, Math.min(10, Number(form.get("questionCount")) || 5));
    const requestedRole = String(form.get("targetRole") || "").slice(0, 120);
    const profileValue = form.get("profile");
    let suppliedProfile = null;

    if (profileValue) {
      try { suppliedProfile = parseInterviewProfile(JSON.parse(String(profileValue))); }
      catch { return Response.json({ message: "The saved resume profile is invalid. Please upload the resume again." }, { status: 400 }); }
    }

    const file = await resumeFileFromForm(form.get("resume"));
    if (!file && !suppliedProfile) {
      return Response.json({ message: "Upload a PDF or DOCX resume to begin." }, { status: 400 });
    }

    const resumeText = file ? await extractResumeText(file) : null;
    const plan = await createInterviewPlan(resumeText, suppliedProfile, requestedRole, totalQuestions);
    return Response.json(plan, { status: 201 });
  } catch (error) {
    return apiFailure(error);
  }
}
