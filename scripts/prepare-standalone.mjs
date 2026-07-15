import { cp, mkdir, stat } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const standalone = join(root, ".next", "standalone");

async function copyIfPresent(source, destination) {
  try {
    await stat(source);
    await mkdir(destination, { recursive: true });
    await cp(source, destination, { recursive: true, force: true });
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

await copyIfPresent(join(root, ".next", "static"), join(standalone, ".next", "static"));
await copyIfPresent(join(root, "public"), join(standalone, "public"));
