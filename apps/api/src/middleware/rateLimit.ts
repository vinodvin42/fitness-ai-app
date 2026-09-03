import rateLimit from "express-rate-limit";
import { AuthedRequest } from "./auth";

/**
 * Go-live hardening (25 Aug 2026) — previously NOTHING in this API was
 * rate-limited: /auth/login, /admin/auth/login, /professionals/auth/login,
 * and the payment order/verify endpoints could all be hit at unlimited
 * speed. Applied per-route in app.ts/aiCoach.routes.ts rather than
 * globally, since a blanket limiter would also throttle read-heavy
 * authenticated traffic (dashboards, directories) that has no
 * brute-force or cost risk.
 *
 * All three use express-rate-limit's default in-memory store, which is
 * correct for a single-process deployment (this app has no clustering/
 * multi-instance setup anywhere in this build) but resets on restart and
 * doesn't share state across instances — swap in a Redis store
 * (`rate-limit-redis`) before ever running more than one instance behind
 * a load balancer.
 */

// Login endpoints: the real brute-force target. Keyed by IP (the
// library's default) — 10 attempts per 15 minutes is generous enough for
// a real user who mistypes a password a few times, tight enough to make
// credential-stuffing impractical.
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: "too_many_requests", message: "Too many attempts — try again in a few minutes" } },
});

// Signup + payment-order-creation: lower stakes than login (no password
// to guess), but still real abuse surface (fake account creation,
// hammering Razorpay order creation). Looser than the login limiter.
export const writeRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: "too_many_requests", message: "Too many requests — try again in a few minutes" } },
});

// AI Coach messages (25 Aug 2026, Phase 2 §H) — the one endpoint in this
// app that spends real per-call money against a third-party LLM API, so
// this is cost control as much as abuse prevention (see
// aiCoach.service.ts's own doc comment). Keyed by the authenticated user
// rather than IP — this middleware only ever runs after requireAuth (see
// aiCoach.routes.ts), and "how much can one account spend" is what
// actually matters here; IP-keying would let multiple users behind one
// NAT share a bucket unfairly, or let one user reset their own bucket by
// switching networks. 20 messages per 15 minutes is generous for a real
// back-and-forth conversation, tight enough to bound worst-case cost from
// one compromised or abusive account.
export const aiCoachRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req as AuthedRequest).userId ?? "anonymous",
  message: { error: { code: "too_many_requests", message: "Too many messages — try again in a few minutes" } },
});

// Two-Factor Authentication code checks (25 Aug 2026, gap §17) — a 6-digit
// TOTP code is only 1,000,000 combinations; without a limit here, both
// POST /auth/2fa/verify (unauthenticated — only a short-lived challenge
// token stands between an attacker and a real session) and POST
// /users/me/2fa/enable (authenticated, lower stakes, but still worth
// bounding) would be brute-forceable well within a code's 30-second
// validity window at unlimited request speed. Keyed by IP like
// authRateLimit — 2fa/verify runs before any user identity is trusted
// from the request itself, only from the challenge token's payload, so
// IP is the only signal available; enable already runs after requireAuth
// but reuses the same limiter for one consistent bound rather than a
// second bespoke one.
export const twoFactorRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: "too_many_requests", message: "Too many attempts — try again in a few minutes" } },
});
