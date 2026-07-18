import "dotenv/config";
import { createServer } from "node:http";
import next from "next";

const port = Number(process.env.PORT || 3000);
const hostname = process.env.HOSTNAME || "0.0.0.0";

async function main() {
  const web = next({ dev: false, dir: process.cwd(), hostname, port });
  await web.prepare();
  const handle = web.getRequestHandler();
  const server = createServer((request, response) => handle(request, response));
  server.listen(port, hostname, () => {
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
