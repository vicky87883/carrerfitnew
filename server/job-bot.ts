import { createJobBotRun, finishJobBotRun, getJobSourceOverview, listJobSources } from "./job-database.js";
import { scrapeJobSource } from "./job-scraper.js";

let running: Promise<Awaited<ReturnType<typeof execute>>> | null = null;

export function runJobBot(trigger: "cron" | "admin") {
  if (running) return running;
  running = execute(trigger).finally(() => { running = null; });
  return running;
}

async function execute(trigger: "cron" | "admin") {
  const enabled = (await listJobSources()).filter((source) => source.enabled);
  const run = await createJobBotRun(trigger, enabled.length);
  const results = await runWithConcurrency(enabled, 3, scrapeJobSource);
  const refreshed = results.filter((result) => result.status === "fulfilled").length;
  const failed = results.length - refreshed;
  const completed = await finishJobBotRun(run.id, refreshed, failed);
  return { ok: failed === 0, runId: run.id, trigger, startedAt: run.startedAt, finishedAt: completed.finishedAt, sources: enabled.length, refreshed, failed, overview: await getJobSourceOverview() };
}

async function runWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>) {
  const results: PromiseSettledResult<R>[] = new Array(items.length); let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      try { results[index] = { status: "fulfilled", value: await worker(items[index]) }; }
      catch (reason) { results[index] = { status: "rejected", reason }; }
    }
  }));
  return results;
}
