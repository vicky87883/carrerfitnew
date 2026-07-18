import { databaseErrorReason } from "@/app/api/_utils";
import { checkJobDatabaseConnection } from "@/server/job-database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  let database: Awaited<ReturnType<typeof checkJobDatabaseConnection>> | { ok: false; backend: "mysql" | "sqlite"; reason: string };
  try { database = await checkJobDatabaseConnection(); }
  catch (error) { database = { ok: false, backend: process.env.DATABASE_URL || process.env.DB_HOST ? "mysql" : "sqlite", reason: databaseErrorReason(error) || "unavailable" }; }
  return Response.json({
    ok: true,
    service: "carrerfit-api",
    aiConfigured: Boolean(process.env.GROQ_API_KEY),
    apiMode: "next-route",
    database,
  });
}
