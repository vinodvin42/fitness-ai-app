import nodemailer, { Transporter } from "nodemailer";
import { env } from "../config/env";

/**
 * Generic SMTP mailer (18 Sep 2026, gap §53) — built for Forgot/Reset
 * Password, the first real transactional-email need in this codebase.
 * Deliberately lazy, same reasoning as lib/razorpayClient.ts's own doc
 * comment: the transporter is only constructed the first time a route
 * actually needs it, not at module-import time, so an unconfigured SMTP
 * relay never blocks the whole API from booting — only email-sending
 * routes should degrade (a real 503), not the whole process.
 *
 * Deliberately generic SMTP via `nodemailer`, not a vendor SDK
 * (`@sendgrid/mail`, Postmark's client, etc.) — this build environment
 * has no real mail-provider account to wire up, and generic SMTP works
 * with whatever real relay a human supplies later (SendGrid, Postmark,
 * SES, or a plain Workspace/Gmail relay all speak SMTP), same
 * "provider-agnostic, one integration point" reasoning as
 * lib/aiClient.ts's multi-provider support.
 */

let transporter: Transporter | null = null;

export function isEmailConfigured(): boolean {
  return Boolean(env.SMTP_HOST && env.SMTP_PORT && env.SMTP_USER && env.SMTP_PASS && env.SMTP_FROM);
}

function getTransporter(): Transporter {
  if (!isEmailConfigured()) {
    throw new Error(
      "Email is not configured — set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and SMTP_FROM (see .env.example)",
    );
  }
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      // 465 is SMTP-over-TLS-from-the-start ("implicit TLS"); every other
      // port (587/25/etc.) starts plaintext and upgrades via STARTTLS,
      // which nodemailer negotiates itself when `secure` is false — this
      // mirrors the real-world convention essentially every SMTP relay
      // (SendGrid, Postmark, SES, Gmail) follows rather than hardcoding one.
      secure: env.SMTP_PORT === 465,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    });
  }
  return transporter;
}

interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
}

/** Throws if unconfigured — callers should check `isEmailConfigured()` first if they want to degrade gracefully instead (see auth.service.ts's forgotPassword). */
export async function sendEmail(input: SendEmailInput): Promise<void> {
  const client = getTransporter();
  await client.sendMail({
    from: env.SMTP_FROM,
    to: input.to,
    subject: input.subject,
    text: input.text,
  });
}
