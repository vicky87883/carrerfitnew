export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({
    ok: true,
    service: "carrerfit-api",
    aiConfigured: Boolean(process.env.GROQ_API_KEY),
    apiMode: "next-route",
  });
}
