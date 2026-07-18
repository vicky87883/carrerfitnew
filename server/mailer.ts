import nodemailer from "nodemailer";
import { appUrl, mailConfigured } from "./auth.js";

let transporter: ReturnType<typeof nodemailer.createTransport> | null = null;

export async function sendVerificationEmail(input: { email: string; name: string; token: string }) {
  const url = appUrl(`/api/auth/verify?token=${encodeURIComponent(input.token)}`);
  return send({
    to: input.email, subject: "Confirm your CarrerFit.com account",
    text: `Hello ${input.name},\n\nConfirm your email to open your private CarrerFit workspace:\n${url}\n\nThis link expires in 24 hours. If you did not create this account, ignore this email.`,
    html: emailHtml("Confirm your email", `Welcome, ${escapeHtml(input.name)}. Confirm your address to open your private CarrerFit workspace.`, url, "Confirm email", "This link expires in 24 hours."),
  });
}

export async function sendPasswordResetEmail(input: { email: string; name: string; token: string }) {
  const url = appUrl(`/reset-password?token=${encodeURIComponent(input.token)}`);
  return send({
    to: input.email, subject: "Reset your CarrerFit.com password",
    text: `Hello ${input.name},\n\nReset your password:\n${url}\n\nThis link expires in 30 minutes and can be used once. If you did not request it, ignore this email.`,
    html: emailHtml("Reset your password", `Hello ${escapeHtml(input.name)}. Use the secure link below to choose a new password.`, url, "Reset password", "This link expires in 30 minutes and can be used once."),
  });
}
export async function sendAdminAccessEmail(token: string) {
  const url = appUrl(`/api/admin/confirm?token=${encodeURIComponent(token)}`);
  return send({
    to: process.env.ADMIN_EMAIL || "", subject: "Confirm CarrerFit administrator sign-in",
    text: `A CarrerFit administrator sign-in was requested. Confirm access: ${url}\n\nThis link expires in 15 minutes. If this was not you, ignore this email.`,
    html: emailHtml("Confirm administrator sign-in", "Use the secure link below to open the CarrerFit administrator control centre.", url, "Confirm admin access", "This link expires in 15 minutes. If this was not you, ignore this email."),
  });
}

async function send(message: { to: string; subject: string; text: string; html: string }) {
  if (!mailConfigured()) throw new Error("SMTP_NOT_CONFIGURED");
  transporter ||= nodemailer.createTransport({
    host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 465),
    secure: /^(1|true|yes)$/i.test(process.env.SMTP_SECURE || "true"),
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
    connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000,
  });
  await transporter.sendMail({ from: process.env.SMTP_FROM, ...message });
}

function emailHtml(title: string, copy: string, url: string, label: string, footnote: string) {
  return `<!doctype html><html><body style="margin:0;background:#f4f6fb;font-family:Arial,sans-serif;color:#172033"><table role="presentation" width="100%"><tr><td align="center" style="padding:40px 16px"><table role="presentation" width="560" style="max-width:100%;background:#fff;border-radius:18px;padding:36px"><tr><td><div style="font-weight:800;color:#6039d7;font-size:20px">CarrerFit.com</div><h1 style="font-size:28px;margin:28px 0 12px">${title}</h1><p style="line-height:1.65;color:#546079">${copy}</p><p style="margin:28px 0"><a href="${escapeHtml(url)}" style="background:#6039d7;color:#fff;padding:14px 22px;border-radius:10px;text-decoration:none;font-weight:700">${label}</a></p><p style="font-size:13px;color:#7b8498">${footnote}</p></td></tr></table></td></tr></table></body></html>`;
}
function escapeHtml(value: string) { return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]!); }
