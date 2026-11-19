import "server-only";

import { randomBytes } from "node:crypto";

/**
 * Sends email through the Gmail API as one fixed sender account, using an
 * OAuth refresh token for the gmail.send scope (see scripts/gmail-token.mjs).
 * Plain fetch, no SDK: one call to refresh the access token, one to send.
 */

export type OutgoingEmail = { to: string; subject: string; text: string; html: string };

export class EmailNotConfiguredError extends Error {
  constructor() {
    super("Gmail sending is not configured (GMAIL_* variables are missing).");
    this.name = "EmailNotConfiguredError";
  }
}

export class EmailSendError extends Error {
  constructor(
    /** TOKEN_EXPIRED: re-run `npm run gmail:token`. */
    public readonly reason: "TOKEN_EXPIRED" | "REJECTED" | "UNAVAILABLE",
    message: string,
  ) {
    super(message);
    this.name = "EmailSendError";
  }
}

function config() {
  const clientId = process.env.GMAIL_CLIENT_ID?.trim();
  const clientSecret = process.env.GMAIL_CLIENT_SECRET?.trim();
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN?.trim();
  const sender = process.env.GMAIL_SENDER?.trim();
  if (!clientId || !clientSecret || !refreshToken || !sender) return null;
  return { clientId, clientSecret, refreshToken, sender };
}

export function isEmailConfigured() {
  return config() !== null;
}

// Access tokens last about an hour; reuse one until shortly before expiry.
let cached: { token: string; expiresAt: number } | null = null;

async function accessToken(cfg: NonNullable<ReturnType<typeof config>>) {
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      refresh_token: cfg.refreshToken,
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
  };
  if (!response.ok || !body.access_token) {
    if (body.error === "invalid_grant") {
      throw new EmailSendError(
        "TOKEN_EXPIRED",
        "Gmail refresh token expired or was revoked. Run `npm run gmail:token` and update GMAIL_REFRESH_TOKEN.",
      );
    }
    throw new EmailSendError("UNAVAILABLE", `Gmail token refresh failed (${body.error ?? response.status}).`);
  }
  cached = { token: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 };
  return cached.token;
}

// --- MIME message ---------------------------------------------------------

/** Header values must never contain line breaks (header injection). */
function headerSafe(value: string) {
  return value.replace(/[\r\n]+/g, " ").trim();
}

/** RFC 2047 encoding so non-ASCII group names survive in the subject. */
function encodeHeader(value: string) {
  const safe = headerSafe(value);
  return /^[\x20-\x7e]*$/.test(safe) ? safe : `=?UTF-8?B?${Buffer.from(safe, "utf8").toString("base64")}?=`;
}

function base64Lines(content: string) {
  return Buffer.from(content, "utf8").toString("base64").replace(/.{1,76}/g, "$&\r\n");
}

export function buildMimeMessage(from: string, email: OutgoingEmail) {
  const to = headerSafe(email.to);
  if (!/^[^\s@<>,;"]+@[^\s@<>,;"]+$/.test(to)) throw new EmailSendError("REJECTED", "Invalid recipient address.");
  const boundary = `cirkit-${randomBytes(12).toString("hex")}`;
  return [
    `From: CirKit <${headerSafe(from)}>`,
    `To: ${to}`,
    `Subject: ${encodeHeader(email.subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    base64Lines(email.text),
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    base64Lines(email.html),
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

/** Sends one email. Throws EmailNotConfiguredError or EmailSendError. */
export async function sendEmail(email: OutgoingEmail): Promise<{ messageId: string }> {
  const cfg = config();
  if (!cfg) throw new EmailNotConfiguredError();

  const raw = Buffer.from(buildMimeMessage(cfg.sender, email), "utf8").toString("base64url");
  const send = async (token: string) =>
    fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ raw }),
      signal: AbortSignal.timeout(15_000),
    });

  let response = await send(await accessToken(cfg));
  if (response.status === 401) {
    // Cached access token was revoked early; refresh once and retry.
    cached = null;
    response = await send(await accessToken(cfg));
  }
  const body = (await response.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
  if (!response.ok || !body.id) {
    const reason = response.status >= 500 || response.status === 429 ? "UNAVAILABLE" : "REJECTED";
    throw new EmailSendError(reason, `Gmail send failed (${response.status}): ${body.error?.message ?? "unknown error"}`);
  }
  return { messageId: body.id };
}
