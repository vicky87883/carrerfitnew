import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { SMTPServer } from "smtp-server";

async function main() {
  const offset = process.pid % 1000; const port = 3300 + offset; const smtpPort = 4300 + offset;
  const origin = `http://127.0.0.1:${port}`; const database = join(process.cwd(), "server", "data", `auth-api-test-${process.pid}.sqlite`);
  let deliverEmail!: (message: string) => void;
  const emailReceived = new Promise<string>((resolve) => { deliverEmail = resolve; });
  const smtp = new SMTPServer({
    authOptional: true, disabledCommands: ["STARTTLS"],
    onAuth(auth, _session, callback) { callback(null, { user: auth.username || "test" }); },
    onData(stream, _session, callback) { let message = ""; stream.setEncoding("utf8"); stream.on("data", (chunk) => { message += chunk; }); stream.on("end", () => { deliverEmail(message); callback(); }); },
  });
  await new Promise<void>((resolve, reject) => smtp.listen(smtpPort, "127.0.0.1", (error?: Error) => error ? reject(error) : resolve()));
  const server = spawn(process.execPath, ["dist/server/production.js"], {
    cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, PORT: String(port), APP_URL: origin, AUTH_REQUIRED: "true", AUTH_SECRET: "test-secret-that-is-at-least-thirty-two-characters", CARRERFIT_DB_PATH: database, SMTP_HOST: "127.0.0.1", SMTP_PORT: String(smtpPort), SMTP_SECURE: "false", SMTP_USER: "test-user", SMTP_PASSWORD: "test-password", SMTP_FROM: "CarrerFit Test <test@carrerfit.local>" },
  });
  let output = ""; server.stdout.on("data", (chunk) => { output += String(chunk); }); server.stderr.on("data", (chunk) => { output += String(chunk); });
  try {
    await waitForServer(`${origin}/api/health`, server);
    const register = await fetch(`${origin}/api/auth/register`, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ name: "Alice Candidate", email: "alice@example.com", password: "SecurePassword2026" }) });
    assert.equal(register.status, 201, await register.text());
    const rawEmail = (await Promise.race([emailReceived, wait(10_000).then(() => "")])).replace(/=\r?\n/g, "");
    const token = rawEmail.match(/token(?:=3D|=)([A-Za-z0-9_-]{40,})/)?.[1]; assert.ok(token, "confirmation email must contain a token");
    const verified = await fetch(`${origin}/api/auth/verify?token=${token}`, { redirect: "manual" });
    assert.equal(verified.status, 303); assert.equal(verified.headers.get("location"), `${origin}/dashboard?verified=1`);
    const cookie = verified.headers.get("set-cookie")?.split(";")[0]; assert.ok(cookie?.startsWith("carrerfit_session="));
    const dashboard = await fetch(`${origin}/api/dashboard`, { headers: { Cookie: cookie! } });
    assert.equal(dashboard.status, 200); assert.equal((await dashboard.json()).profile.name, "Alice Candidate");
    const logout = await fetch(`${origin}/api/auth/logout`, { method: "POST", headers: { Origin: origin, Cookie: cookie! } }); assert.equal(logout.status, 200);
    const denied = await fetch(`${origin}/api/dashboard`, { headers: { Cookie: cookie! } }); assert.equal(denied.status, 401, "logout must revoke the server session");
    const login = await fetch(`${origin}/api/auth/login`, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ email: "alice@example.com", password: "SecurePassword2026" }) });
    assert.equal(login.status, 200, await login.text()); assert.ok(login.headers.get("set-cookie")?.includes("HttpOnly"));
    console.log("Production auth API passed: register → SMTP confirmation → verified session → dashboard → logout → login.");
  } finally {
    server.kill("SIGTERM"); await Promise.race([new Promise((resolve) => server.once("exit", resolve)), wait(3_000)]);
    await new Promise<void>((resolve) => smtp.close(() => resolve()));
    for (const suffix of ["", "-shm", "-wal"]) rmSync(`${database}${suffix}`, { force: true });
    if (server.exitCode && server.exitCode !== 0) console.error(output);
  }
}

async function waitForServer(url: string, child: ReturnType<typeof spawn>) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) throw new Error("Production server exited before the health check passed.");
    try { if ((await fetch(url)).ok) return; } catch { /* server is still starting */ }
    await wait(100);
  }
  throw new Error("Production server did not become ready.");
}
function wait(milliseconds: number) { return new Promise<void>((resolve) => setTimeout(resolve, milliseconds)); }
main().catch((error) => { console.error(error); process.exit(1); });
