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
  const message = bucket.startsWith("auth-") ? "Too many account requests. Please wait a few minutes and try again." : bucket === "resume" ? "Too many resume analyses. Please try again in a few minutes." : "Interview practice limit reached. Please pause for a few minutes.";
  return Response.json(
    { message },
    { status: 429, headers: { "Retry-After": String(Math.ceil((current.resetAt - now) / 1000)), "Cache-Control": "no-store" } },
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
  const reason = databaseErrorReason(error);
  if (reason) return Response.json({ message: "The production database is temporarily unavailable.", code: reason }, { status: 503 });
  console.error("Next API route failed", error);
  return Response.json({ message: "Something went wrong. Please try again." }, { status: 500 });
}

export function databaseErrorReason(error: unknown) {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  if (code === "ER_ACCESS_DENIED_ERROR") return "access_denied";
  if (code === "ER_BAD_DB_ERROR") return "database_not_found";
  if (code === "ECONNREFUSED") return "connection_refused";
  if (code === "ETIMEDOUT" || code === "PROTOCOL_SEQUENCE_TIMEOUT") return "timeout";
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return "dns_error";
  if (code.startsWith("ER_") || code === "PROTOCOL_CONNECTION_LOST") return "database_error";
  return null;
}
