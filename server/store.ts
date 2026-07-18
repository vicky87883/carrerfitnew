import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { RowDataPacket } from "mysql2/promise";
import type { Application, CareerMatch } from "../lib/types.js";
import { databaseBackend, getMysqlPool } from "./mysql.js";

type Store = { applications: Application[]; matches: CareerMatch[] };
const dataDirectory = process.env.CARRERFIT_DATA_DIR || join(process.cwd(), "server", "data");
const file = join(dataDirectory, "store.json");
const initial: Store = { applications: [], matches: [] };

export async function readStore(): Promise<Store> {
  if (databaseBackend() === "mysql") {
    const pool = await getMysqlPool();
    const [rows] = await pool.execute<(RowDataPacket & { payload: string })[]>("SELECT payload FROM carrerfit_store WHERE store_key='career' LIMIT 1");
    if (!rows[0]) {
      await writeStore(initial);
      return structuredClone(initial);
    }
    try { return JSON.parse(rows[0].payload) as Store; }
    catch { return structuredClone(initial); }
  }
  try { return JSON.parse(await readFile(file, "utf8")) as Store; }
  catch { await writeStore(initial); return structuredClone(initial); }
}

export async function writeStore(store: Store) {
  if (databaseBackend() === "mysql") {
    await (await getMysqlPool()).execute(
      "INSERT INTO carrerfit_store (store_key,payload,updated_at) VALUES ('career',?,UTC_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE payload=VALUES(payload),updated_at=VALUES(updated_at)",
      [JSON.stringify(store)],
    );
    return;
  }
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(store, null, 2));
}
