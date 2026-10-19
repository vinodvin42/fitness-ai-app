/**
 * Connectivity harness — shared journey helpers (16 Oct 2026).
 *
 * The journeys drive the real Express app in-process with supertest, on
 * the same endpoints the surfaces call (each journey names the client
 * file). This tests the API, its database writes and the cross-surface
 * reads. It does NOT run the mobile apps or web portals themselves, and it
 * does not test the deployed hosts or their configured API URLs.
 *
 * Logins go over HTTP, exactly like the surfaces. The login limiter allows
 * 10 logins per IP per 15 minutes per test file, so each journey file logs
 * in each account once and reuses the token.
 */
import crypto from "node:crypto";
import request from "supertest";
import { expect } from "vitest";
import type { Express } from "express";
import { createApp } from "../../../src/app";
import { mockPaymentSignature } from "../../../src/providers";
import { loadWorld, syntheticPassword, type SyntheticWorld } from "./syntheticWorld";
import { appendEvidence, type EvidenceEntry } from "./evidence";

export { describeResponse } from "./evidence";

/** Appends one evidence entry, stamped with this run's id and the current Vitest test name. */
export function record(entry: EvidenceEntry): void {
  appendEvidence(entry, { runId: loadWorld().runId, testName: expect.getState().currentTestName ?? "(outside a test)" });
}

/**
 * For a step whose precondition (an earlier step) did not hold: records the
 * step as blocked, naming why, and fails the test. Prevents a later step
 * from "passing" without testing anything.
 */
export function blockOn(entry: Omit<EvidenceEntry, "verdict" | "observed">, reason: string): never {
  record({ ...entry, verdict: "blocked", observed: `Not executed: ${reason}`, blockedBy: reason });
  throw new Error(`${entry.check} blocked: ${reason}`);
}

export const CONFIGURATION =
  "In-process API (createApp + supertest), disposable PostgreSQL fynrox_*_test, NODE_ENV=test, " +
  "PAYMENT_PROVIDER=mock, AI_PROVIDER=mock, FOOD_DATA_PROVIDER=seed, no SMTP/Sentry/Redis/Razorpay keys";

export interface Journey {
  app: Express;
  world: SyntheticWorld;
  /** Synthetic TEST-ONLY password for this run's accounts (from the environment, never stored). */
  password: string;
}

export function startJourney(): Journey {
  return { app: createApp() as Express, world: loadWorld(), password: syntheticPassword() };
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

async function expectLogin(res: request.Response, what: string, pick: (body: any) => string | undefined): Promise<string> {
  const token = res.status === 200 ? pick(res.body) : undefined;
  if (!token) throw new Error(`${what} login failed: HTTP ${res.status} ${res.body?.error?.code ?? ""}`.trim());
  return token;
}

/** user-mobile: apps/user-mobile/src/api/auth.ts → POST /auth/login */
export async function loginUser(j: Journey, email: string): Promise<string> {
  const res = await request(j.app).post("/auth/login").send({ email, password: j.password });
  return expectLogin(res, "user", (b) => b?.tokens?.accessToken);
}

/** coach-mobile: apps/coach-mobile/src/api/professionalAuth.ts → POST /professionals/auth/login */
export async function loginCoach(j: Journey, email: string): Promise<string> {
  const res = await request(j.app).post("/professionals/auth/login").send({ email, password: j.password });
  return expectLogin(res, "coach", (b) => b?.tokens?.accessToken);
}

/** admin-web: apps/admin-web/src/lib/auth.tsx → POST /admin/auth/login (MFA is off under NODE_ENV=test) */
export async function loginAdmin(j: Journey, email: string): Promise<string> {
  const res = await request(j.app).post("/admin/auth/login").send({ email, password: j.password });
  return expectLogin(res, "admin", (b) => b?.token);
}

/** gym-portal: apps/gym-portal/src/lib/auth.tsx → POST /gym-portal/auth/login */
export async function loginGym(j: Journey, email: string): Promise<string> {
  const res = await request(j.app).post("/gym-portal/auth/login").send({ email, password: j.password });
  return expectLogin(res, "gym", (b) => b?.token);
}

/** creator-portal → POST /influencers/auth/login */
export async function loginCreator(j: Journey, email: string): Promise<string> {
  const res = await request(j.app).post("/influencers/auth/login").send({ email, password: j.password });
  return expectLogin(res, "creator", (b) => b?.tokens?.accessToken);
}

/**
 * Buys the TEST-ONLY plan through the real order + verify endpoints the
 * user app uses (apps/user-mobile/src/api/payments.ts), signed by the
 * local mock provider. No network call is made.
 */
export async function buyTestPlan(j: Journey, userToken: string) {
  const order = await request(j.app)
    .post("/payments/razorpay/orders")
    .set(bearer(userToken))
    .send({ purpose: "subscription", referenceId: j.world.plan.id });
  if (order.status !== 201) throw new Error(`order failed: HTTP ${order.status} ${order.body?.error?.code ?? ""}`);
  const orderId = order.body.orderId as string;
  const paymentId = `pay_tst_${crypto.randomBytes(6).toString("hex")}`;
  const verify = await request(j.app)
    .post("/payments/razorpay/verify")
    .set(bearer(userToken))
    .send({ razorpayOrderId: orderId, razorpayPaymentId: paymentId, razorpaySignature: mockPaymentSignature(orderId, paymentId) });
  return { order, verify, orderId, providerPaymentId: paymentId };
}

/** Signs a webhook body with the TEST-ONLY webhook secret, as the gateway would. */
export function signWebhook(rawBody: string): string {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) throw new Error("RAZORPAY_WEBHOOK_SECRET (test-only) is required for webhook checks");
  return crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
}

export function futureIso(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}
