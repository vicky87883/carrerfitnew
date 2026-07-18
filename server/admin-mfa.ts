import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function configuredAdminEmails() {
  return (process.env.ADMIN_EMAILS || "admin@carrerfit.com").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean);
}
export function isAdminEmail(email: string) { return configuredAdminEmails().includes(email.toLowerCase()); }
export function generateTotpSecret() { return base32(randomBytes(20)); }
export function totpUri(email: string, secret: string) {
  return `otpauth://totp/${encodeURIComponent(`CarrerFit:${email}`)}?secret=${secret}&issuer=CarrerFit&algorithm=SHA1&digits=6&period=30`;
}
export function validTotp(secret: string, code: string) {
  if (!/^\d{6}$/.test(code)) return false;
  for (let offset = -1; offset <= 1; offset += 1) {
    const expected = totp(secret, Math.floor(Date.now() / 30_000) + offset);
    if (timingSafeEqual(Buffer.from(expected), Buffer.from(code))) return true;
  }
  return false;
}
export function encryptMfaSecret(secret: string) {
  const key = keyMaterial(); const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return `v1.${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${ciphertext.toString("base64url")}`;
}
export function decryptMfaSecret(value: string) {
  const [version, ivValue, tagValue, ciphertextValue] = value.split(".");
  if (version !== "v1" || !ivValue || !tagValue || !ciphertextValue) throw new Error("Invalid MFA secret.");
  const decipher = createDecipheriv("aes-256-gcm", keyMaterial(), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextValue, "base64url")), decipher.final()]).toString("utf8");
}

function totp(secret: string, counter: number) {
  const buffer = Buffer.alloc(8); buffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", base32Decode(secret)).update(buffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const value = ((digest[offset] & 0x7f) << 24) | (digest[offset + 1] << 16) | (digest[offset + 2] << 8) | digest[offset + 3];
  return String(value % 1_000_000).padStart(6, "0");
}
function base32(input: Buffer) {
  let bits = 0; let value = 0; let output = "";
  for (const byte of input) { value = (value << 8) | byte; bits += 8; while (bits >= 5) { output += alphabet[(value >>> (bits - 5)) & 31]; bits -= 5; } }
  return bits ? `${output}${alphabet[(value << (5 - bits)) & 31]}` : output;
}
function base32Decode(input: string) {
  let bits = 0; let value = 0; const bytes: number[] = [];
  for (const char of input.replace(/[=\s-]/g, "").toUpperCase()) { const index = alphabet.indexOf(char); if (index < 0) throw new Error("Invalid MFA secret."); value = (value << 5) | index; bits += 5; if (bits >= 8) { bytes.push((value >>> (bits - 8)) & 255); bits -= 8; } }
  return Buffer.from(bytes);
}
function keyMaterial() {
  const secret = process.env.AUTH_SECRET || "";
  if (secret.length < 32) throw new Error("AUTH_SECRET must be configured before MFA can be used.");
  return createHash("sha256").update(`carrerfit-admin-mfa:${secret}`).digest();
}
