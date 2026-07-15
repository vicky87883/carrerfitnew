import "dotenv/config";
import next from "next";

process.env.CARRERFIT_COMBINED_SERVER = "1";

const port = Number(process.env.PORT || 3000);
const hostname = process.env.HOSTNAME || "0.0.0.0";

async function main() {
  const web = next({ dev: false, dir: process.cwd(), hostname, port });
  await web.prepare();
  const { app, apiErrorHandler } = await import("./index.js");
  const handle = web.getRequestHandler();

  app.use("/api", (_req, res) => res.status(404).json({ message: "API route not found" }));
  app.use((req, res) => handle(req, res));
  app.use(apiErrorHandler);

  const server = app.listen(port, hostname, () => {
    console.log(`CarrerFit web and API running on http://${hostname}:${port}`);
  });

  function shutdown() {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  }

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((error) => {
  console.error("CarrerFit failed to start", error);
  process.exit(1);
});
