export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  let database: Awaited<ReturnType<typeof checkJobDatabaseConnection>> | { ok: false; backend: "mysql" | "sqlite" };
  try { database = await checkJobDatabaseConnection(); }
  catch { database = { ok: false, backend: process.env.DATABASE_URL || process.env.DB_HOST ? "mysql" : "sqlite" }; }
  return Response.json({
    ok: true,
    service: "carrerfit-api",
    aiConfigured: Boolean(process.env.GROQ_API_KEY),
    apiMode: "next-route",
    database,
  });
}
import { checkJobDatabaseConnection } from "@/server/job-database";
