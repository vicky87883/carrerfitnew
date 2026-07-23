import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { rmSync } from "node:fs";
import { join } from "node:path";

const database = join(process.cwd(), "server", "data", `auth-test-${process.pid}.sqlite`);
process.env.CARRERFIT_DB_PATH = database;
delete process.env.DATABASE_URL; delete process.env.DB_HOST; delete process.env.DB_NAME; delete process.env.DB_USER; delete process.env.DB_PASSWORD;
process.env.AUTH_SECRET = "test-only-resume-vault-secret-that-is-long-enough";
delete process.env.ADMIN_EMAIL;
delete process.env.ADMIN_EMAILS;
process.env.ADMIN_USERNAME = "test-admin";
process.env.ADMIN_PASSWORD = "SecureAdmin15!";

async function main() {
  const { createOneTimeToken, hashPassword, passwordMatches } = await import("../server/auth.js");
  const {
    consumeAuthToken, createAuthToken, createSession, createUser, createUserApplication, findSessionUser,
    getPrivateData, listUserApplications, markUserVerified, saveAssessmentMatches, saveResumeAnalysis,
  } = await import("../server/auth-store.js");
  const { getResumeDocument, getResumeFile, saveResumeDocument, saveResumeFile } = await import("../server/resume-vault.js");
  const { closeJobDatabaseForTests } = await import("../server/job-database.js");
  const { adminCredentialsValid, adminLoginConfigured, createAdminCookie } = await import("../server/admin-access.js");

  try {
  const passwordHash = await hashPassword("SecurePassword2026");
  assert.equal(await passwordMatches(passwordHash, "SecurePassword2026"), true);
  assert.equal(await passwordMatches(passwordHash, "wrong-password"), false);
  assert.equal(await adminLoginConfigured(), true);
  assert.equal(await adminCredentialsValid("test-admin", "SecureAdmin15!"), true, "environment credentials bootstrap a hashed database administrator");
  assert.equal(await adminCredentialsValid("test-admin", "wrong-password"), false);
  assert.equal(await adminCredentialsValid("test-admin", "SecureAdmin15!"), true, "database-backed administrator login remains valid");
  process.env.ADMIN_PASSWORD = "RotatedSecureAdminPassword2026";
  assert.equal(await adminCredentialsValid("test-admin", "RotatedSecureAdminPassword2026"), true, "environment credential rotation updates the hashed database administrator");
  assert.equal(await adminCredentialsValid("test-admin", "SecureAdmin15!"), false, "the previous password stops working after rotation");
  assert.match(createAdminCookie(), /HttpOnly/);
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

  const document = { schemaVersion: 1 as const, identity: { fullName: "Alice Candidate", givenName: "Alice", surname: "Candidate", email: "alice@example.com", phone: "", location: "", links: [] }, headline: "Product Analyst", summary: "Analytics specialist", skills: [{ name: "SQL", category: "Data", evidence: "Built SQL dashboards", confidence: .96 }], experience: [], education: [], certifications: [], projects: [], languages: [], keywords: ["sql", "analytics"], sectionsDetected: ["skills"], wordCount: 4, characterCount: 20, extractionConfidence: .9, warnings: [] };
  await saveResumeFile(alice.id, { originalname: "alice-resume.pdf", mimetype: "application/pdf", size: 11, buffer: Buffer.from("private pdf") });
  await saveResumeDocument(alice.id, "Built SQL dashboards", document);
  assert.equal((await getResumeFile(alice.id))?.data.toString(), "private pdf");
  assert.equal((await getResumeDocument(alice.id))?.document.identity.email, "alice@example.com");
  assert.equal(await getResumeFile(bob.id), null, "encrypted resume files must be isolated by user");
  assert.equal(await getResumeDocument(bob.id), null, "encrypted resume documents must be isolated by user");

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
