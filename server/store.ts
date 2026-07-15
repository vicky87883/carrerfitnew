import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Application, CareerMatch } from "../lib/types.js";

type Store = { applications: Application[]; matches: CareerMatch[] };
const dataDirectory = process.env.CARRERFIT_DATA_DIR || join(process.cwd(), "server", "data");
const file = join(dataDirectory, "store.json");
const initial: Store = { applications: [], matches: [] };

export async function readStore(): Promise<Store> {
  try { return JSON.parse(await readFile(file, "utf8")) as Store; }
  catch { await writeStore(initial); return structuredClone(initial); }
}

export async function writeStore(store: Store) {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(store, null, 2));
}
