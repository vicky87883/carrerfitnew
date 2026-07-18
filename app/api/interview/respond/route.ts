import { apiFailure, rateLimit } from "@/app/api/_utils";
import { requireVerifiedUser, validateMutationOrigin } from "@/server/auth";
import { evaluateInterviewAnswer, interviewResponseSchema } from "@/server/interview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const originDenied = validateMutationOrigin(request); if (originDenied) return originDenied;
  const auth = await requireVerifiedUser(request); if (auth.response) return auth.response;
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
