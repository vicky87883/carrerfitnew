import { ResumeFileError } from "@/server/resume";

const MAX_RESUME_BYTES = 8 * 1024 * 1024;
const windows = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(request: Request, bucket: string, limit = 45) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const key = `${bucket}:${forwarded || "unknown"}`;
  const now = Date.now();
  const current = windows.get(key);
  if (!current || current.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + 15 * 60 * 1000 });
    return null;
  }
  current.count += 1;
  if (current.count <= limit) return null;
  return Response.json(
    { message: "Interview practice limit reached. Please pause for a few minutes." },
    { status: 429, headers: { "Retry-After": String(Math.ceil((current.resetAt - now) / 1000)) } },
  );
}

export async function resumeFileFromForm(value: FormDataEntryValue | null) {
  if (!(value instanceof File) || value.size === 0) return null;
  if (value.size > MAX_RESUME_BYTES) throw new ResumeFileError("Resume must be smaller than 8 MB.", 413);
  const buffer = Buffer.from(await value.arrayBuffer());
  return {
    fieldname: "resume",
    originalname: value.name,
    encoding: "7bit",
    mimetype: value.type || "application/octet-stream",
    size: value.size,
    buffer,
  } as Express.Multer.File;
}

export function apiFailure(error: unknown) {
  if (error instanceof ResumeFileError) return Response.json({ message: error.message }, { status: error.status });
  console.error("Next API route failed", error);
  return Response.json({ message: "Something went wrong. Please try again." }, { status: 500 });
}
