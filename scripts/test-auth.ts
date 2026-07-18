import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { rmSync } from "node:fs";
import { join } from "node:path";

const database = join(process.cwd(), "server", "data", `auth-test-${process.pid}.sqlite`);
process.env.CARRERFIT_DB_PATH = database;
delete process.env.DATABASE_URL; delete process.env.DB_HOST; delete process.env.DB_NAME; delete process.env.DB_USER; delete process.env.DB_PASSWORD;

async function main() {
  const { createOneTimeToken, hashPassword, passwordMatches } = await import("../server/auth.js");
  const {
    consumeAuthToken, createAuthToken, createSession, createUser, createUserApplication, findSessionUser,
    getPrivateData, listUserApplications, markUserVerified, saveAssessmentMatches, saveResumeAnalysis,
  } = await import("../server/auth-store.js");
  const { closeJobDatabaseForTests } = await import("../server/job-database.js");

  try {
  const passwordHash = await hashPassword("SecurePassword2026");
  assert.equal(await passwordMatches(passwordHash, "SecurePassword2026"), true);
  assert.equal(await passwordMatches(passwordHash, "wrong-password"), false);
  const alice = await createUser("alice@example.com", "Alice Candidate", passwordHash);
  const bob = await createUser("bob@example.com", "Bob Candidate", passwordHash);

  const verify = createOneTimeToken();
  await createAuthToken(alice.id, "verify_email", verify.hash, new Date(Date.now() + 60_000).toISOString());
  assert.equal(await consumeAuthToken(verify.hash, "verify_email"), alice.id);
  assert.equal(await consumeAuthToken(verify.hash, "verify_email"), null, "verification token must be single-use");
  await markUserVerified(alice.id);

  const sessionRaw = randomBytes(32).toString("hex");
  const sessionHash = (await import("node:crypto")).createHash("sha256").update(sessionRaw).digest("hex");
  await createSession({ tokenHash: sessionHash, userId: alice.id, expiresAt: new Date(Date.now() + 60_000).toISOString(), userAgentHash: null, ipHash: null });
  assert.equal((await findSessionUser(sessionHash))?.email, "alice@example.com");

  const profile = { name: "Alice", headline: "Product Analyst", summary: "Analytics specialist", yearsExperience: 4, skills: ["SQL"], strengths: ["Analysis"], targetRoles: ["Product Analyst"], seniority: "Mid-level", education: [], improvements: [] };
  await saveResumeAnalysis(alice.id, profile, []);
  await saveAssessmentMatches(alice.id, [{ role: "Product Analyst", score: 92, summary: "Strong match", strengths: ["SQL"], gaps: [], nextSteps: [] }]);
  assert.equal((await getPrivateData(alice.id)).resumeProfile?.name, "Alice");
  assert.equal((await getPrivateData(bob.id)).resumeProfile, null, "private resume data must be isolated by user");

  await createUserApplication(alice.id, "job-1");
  assert.equal((await listUserApplications(alice.id)).length, 1);
  assert.equal((await listUserApplications(bob.id)).length, 0, "saved jobs must be isolated by user");
  console.log("Authentication, one-time token, session, and user-isolation checks passed.");
  } finally {
    await closeJobDatabaseForTests();
    for (const suffix of ["", "-shm", "-wal"]) rmSync(`${database}${suffix}`, { force: true });
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
