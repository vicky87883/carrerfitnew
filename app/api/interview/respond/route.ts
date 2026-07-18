import { apiFailure, rateLimit } from "@/app/api/_utils";
import { evaluateInterviewAnswer, interviewResponseSchema } from "@/server/interview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const limited = rateLimit(request, "interview");
  if (limited) return limited;

  try {
    const parsed = interviewResponseSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json({ message: "The interview answer or session data is invalid." }, { status: 400 });
    }
    return Response.json(await evaluateInterviewAnswer(parsed.data));
  } catch (error) {
    return apiFailure(error);
  }
}
