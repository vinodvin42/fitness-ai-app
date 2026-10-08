import type { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { ApiHttpError } from "../../middleware/errorHandler";
import { generateCompletion, isAiConfigured } from "../../lib/aiClient";
import { isAiCoachEnabledByAdmin } from "../adminAiOps/adminAiOps.service";
import { getCurrentSubscription } from "../subscriptions/subscriptions.service";
import { BRAND_AI_NAME, BRAND_NAME } from "@fitness-ai-app/config";

/**
 * AI Coach chat (docs/mobile/03-screen-inventory.md §H, docs/platform/roadmap.md
 * Phase 2 §H). Closes the feature half of gap §13 — apps/api/src/lib/aiClient.ts
 * (20 Aug 2026) already had the provider plumbing, but its own doc comment
 * named four things still missing before a real conversation could be wired
 * up: conversation persistence, prompt design, rate limiting, and cost
 * controls. This module is those four:
 *   - persistence: AiCoachMessage (prisma/schema.prisma) — one flat,
 *     ordered log per user, both sides of the conversation.
 *   - prompt design: buildSystemPrompt() below grounds every reply in the
 *     user's own real onboarding goals, recent training, and latest
 *     measurement — pulled fresh from Postgres on every message, not
 *     cached — so this reads as an actual coach who knows the user, not a
 *     bare LLM passthrough. It's built as one prompt string (not a real
 *     system+messages array) since aiClient.ts's generateCompletion() is
 *     deliberately a single-turn `prompt -> string` wrapper — a real
 *     provider-native message-array shape would be a reasonable next step
 *     if this grows past a first slice, not required to make this real.
 *   - rate limiting: aiCoachRateLimit (middleware/rateLimit.ts), applied
 *     in aiCoach.routes.ts.
 *   - cost controls: aiCoachRateLimit again (bounds calls/user/window),
 *     sendAiCoachMessageSchema's 2000-char cap (bounds tokens/call), and
 *     MAX_HISTORY_MESSAGES below (bounds how much prior conversation gets
 *     re-sent — and re-billed — on every new turn).
 *
 * Deliberately NOT built this pass: streaming responses (the one item
 * from aiClient.ts's original list still open — this returns a full
 * completion in one response, same as every other mutation in this app;
 * a streaming UI is a real, separate frontend+transport undertaking, not
 * a small addition), and any AI feature besides this chat (a workout
 * generator, diet-log vision, readiness scoring — see roadmap.md Phase 2
 * §H's closing note that those should sequence alongside this, not
 * inside it).
 *
 * Same "unconfigured means quietly off" pattern as Razorpay/Sentry: if no
 * AI_PROVIDER API key is set, sendMessage() returns a real 503 rather
 * than a fake or canned reply — a scripted response would misrepresent
 * itself as AI when it isn't, which is exactly what
 * docs/mobile/07-open-questions-gaps.md §13 warned against.
 *
 * **27 Aug 2026 (Module 11 AI Operations):** sendMessage() gained a second,
 * separate 503 gate — a real admin on/off switch
 * (`adminAiOps.service.ts`'s `AiCoachSettings` singleton), distinct from
 * the "not configured" check above. reports/build-plan.html's own
 * "needs your decision" framing for 11.01–11.03's full Feature Console
 * named this exact slice as the smaller, genuinely buildable alternative.
 */

// How many prior messages (both roles combined) get replayed into the
// prompt as conversation context. Bounds both the token cost of every
// new turn and how far back the model can "remember" — 20 messages is
// roughly the last 10 exchanges, generous for a coaching chat's usual
// back-and-forth without letting a long-lived conversation's cost grow
// unbounded per turn.
const MAX_HISTORY_MESSAGES = 20;

// How many messages a GET returns in one call — same "cap it, report the
// cap honestly" precedent as adminAuditLogs.service.ts's 200-row limit,
// not silent pagination and not an unbounded query against a table that
// only ever grows.
const MAX_RETURNED_MESSAGES = 200;

// Per-tier daily AI Coach message quota (user messages per UTC day). The
// single place to tune limits; users with no active subscription get basic.
export const AI_COACH_DAILY_LIMITS = {
  basic: 5,
  pro: 50,
  elite: 200,
} as const;
export type AiCoachTier = keyof typeof AI_COACH_DAILY_LIMITS;

function nextUtcMidnight(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
}

export async function getUsage(userId: string) {
  const now = new Date();
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const [subscription, used] = await Promise.all([
    getCurrentSubscription(userId),
    prisma.aiCoachMessage.count({ where: { userId, role: "user", failed: false, createdAt: { gte: dayStart } } }),
  ]);
  const rawTier = subscription?.plan.tier;
  const tier: AiCoachTier = rawTier === "pro" || rawTier === "elite" ? rawTier : "basic";
  return { used, limit: AI_COACH_DAILY_LIMITS[tier], resetsAt: nextUtcMidnight(now), tier };
}

/** One real context item that was injected into the prompt for an assistant reply (shown in "Why this?"). */
export interface AiCoachSourceDTO {
  kind: "goals" | "training_level" | "recent_workouts" | "latest_weight" | "protein_today";
  label: string;
  value: string;
}

export interface AiCoachMessageDTO {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: Date;
  /** Assistant replies only; absent for replies generated before sources were recorded. */
  sources?: AiCoachSourceDTO[];
}

function toDTO(m: { id: string; role: string; content: string; createdAt: Date; sources?: unknown }): AiCoachMessageDTO {
  const dto: AiCoachMessageDTO = { id: m.id, role: m.role as "user" | "assistant", content: m.content, createdAt: m.createdAt };
  if (m.role === "assistant" && Array.isArray(m.sources) && m.sources.length > 0) {
    dto.sources = m.sources as unknown as AiCoachSourceDTO[];
  }
  return dto;
}

export async function listMessages(
  userId: string,
): Promise<{ messages: AiCoachMessageDTO[]; truncated: boolean }> {
  const [totalCount, recent] = await Promise.all([
    prisma.aiCoachMessage.count({ where: { userId, failed: false } }),
    prisma.aiCoachMessage.findMany({
      where: { userId, failed: false },
      orderBy: { createdAt: "desc" },
      take: MAX_RETURNED_MESSAGES,
    }),
  ]);

  return {
    messages: recent.reverse().map(toDTO),
    truncated: totalCount > MAX_RETURNED_MESSAGES,
  };
}

/**
 * Pulls a small, real snapshot of this user's data to ground the coach's
 * replies — not exhaustive (that would bloat every prompt's token cost
 * for diminishing benefit), just enough that "what are my goals" or "how
 * has my training been going" get a real, specific answer instead of a
 * generic one.
 */
async function buildSystemPrompt(userId: string): Promise<{ prompt: string; sources: AiCoachSourceDTO[] }> {
  const now = new Date();
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const [profile, recentSessions, latestMeasurement, todayMeals] = await Promise.all([
    // Narrow select: health fields are encrypted at rest and are never put in the coach prompt.
    prisma.onboardingProfile.findUnique({ where: { userId }, select: { goals: true, trainingLevel: true } }),
    prisma.workoutSession.findMany({
      where: { userId, status: "completed" },
      orderBy: { completedAt: "desc" },
      take: 3,
      include: { workout: { select: { name: true } } },
    }),
    prisma.bodyMeasurement.findFirst({ where: { userId }, orderBy: { loggedAt: "desc" } }),
    prisma.mealLog.aggregate({
      where: { userId, loggedAt: { gte: todayStart } },
      _sum: { proteinG: true },
      _count: { _all: true },
    }),
  ]);

  const goals = profile?.goals?.length ? profile.goals.join(", ") : "not specified yet";
  const level = profile?.trainingLevel ?? "not specified yet";
  const recentWorkoutsText = recentSessions.length
    ? recentSessions
        .map(
          (s: { workout: { name: string }; completedAt: Date | null }) =>
            `${s.workout.name}${s.completedAt ? ` (${s.completedAt.toISOString().slice(0, 10)})` : ""}`,
        )
        .join("; ")
    : "no completed workouts logged yet";
  const weightText = latestMeasurement?.weightKg
    ? `${latestMeasurement.weightKg} kg, logged ${latestMeasurement.loggedAt.toISOString().slice(0, 10)}`
    : "not logged yet";

  // Only items genuinely injected into the prompt are recorded (this is what
  // "Why this?" shows) — "not specified yet"/"not logged yet" fallbacks carry
  // no data, so they are not listed as sources.
  const sources: AiCoachSourceDTO[] = [];
  if (profile?.goals?.length) sources.push({ kind: "goals", label: "Your goals", value: goals });
  if (profile?.trainingLevel) sources.push({ kind: "training_level", label: "Training level", value: String(level) });
  if (recentSessions.length) sources.push({ kind: "recent_workouts", label: "Recent workouts", value: recentWorkoutsText });
  if (latestMeasurement?.weightKg) sources.push({ kind: "latest_weight", label: "Latest weight", value: weightText });
  const mealCount = todayMeals._count._all;
  const proteinToday = todayMeals._sum.proteinG ?? 0;
  if (mealCount > 0) {
    sources.push({
      kind: "protein_today",
      label: "Protein logged today",
      value: `${proteinToday} g across ${mealCount} food log${mealCount === 1 ? "" : "s"}`,
    });
  }
  const proteinText = mealCount > 0 ? ` Protein logged today: ${proteinToday} g.` : "";

  const prompt = [
    `You are the ${BRAND_AI_NAME} Coach inside the ${BRAND_NAME} fitness app — a supportive, knowledgeable fitness and nutrition coach speaking directly to the user.`,
    "Keep replies short and practical: 2-4 short paragraphs or a brief list, never a wall of text. Be encouraging but honest, never a licensed medical professional.",
    "If the user's message touches on pain, injury, a medical condition, or anything that sounds like it needs a diagnosis, say so plainly and recommend they speak with a doctor or physical therapist before continuing.",
    `What you actually know about this user right now — stated goals: ${goals}. Training level: ${level}. Most recent completed workouts: ${recentWorkoutsText}. Latest logged weight: ${weightText}.${proteinText}`,
    "Use this only when it's actually relevant to what they asked — don't recite it back unprompted, and never invent details beyond what's listed here; ask a clarifying question instead of guessing.",
  ].join("\n\n");
  return { prompt, sources };
}

export async function sendMessage(
  userId: string,
  content: string,
  clientId?: string,
): Promise<{ userMessage: AiCoachMessageDTO; assistantMessage: AiCoachMessageDTO }> {
  if (!isAiConfigured()) {
    throw new ApiHttpError(
      503,
      "ai_coach_not_configured",
      "The AI Coach isn't configured on this server yet — set ANTHROPIC_API_KEY or OPENAI_API_KEY",
    );
  }

  // Distinct from the check above on purpose (27 Aug 2026, Module 11 AI
  // Operations) — "not configured" is an infrastructure fact, this is a
  // product/admin decision layered on top of an otherwise-working
  // provider. See adminAiOps.service.ts's own doc comment.
  if (!(await isAiCoachEnabledByAdmin())) {
    throw new ApiHttpError(
      503,
      "ai_coach_disabled",
      "The AI Coach has been temporarily turned off by an admin — try again later",
    );
  }

  // Idempotent retry (Figma AI 02 "Retry with this draft"): the client resends
  // the same clientId when retrying a failed send. If that user message is
  // already stored AND answered, return the stored pair untouched; if it is
  // stored but its reply failed, reuse the row instead of inserting a duplicate.
  const existing = clientId
    ? await prisma.aiCoachMessage.findUnique({ where: { userId_clientId: { userId, clientId } } })
    : null;
  if (existing && !existing.failed) {
    const reply = await prisma.aiCoachMessage.findFirst({
      where: { userId, role: "assistant", createdAt: { gte: existing.createdAt } },
      orderBy: { createdAt: "asc" },
    });
    if (reply) return { userMessage: toDTO(existing), assistantMessage: toDTO(reply) };
  }

  // Per-tier daily quota (distinct from the 15-minute burst rate limit).
  // Failed sends don't count (getUsage ignores `failed` rows), so a retry is
  // charged exactly once, when it succeeds.
  const usage = await getUsage(userId);
  if (usage.used >= usage.limit) {
    throw new ApiHttpError(429, "ai_limit_reached", "You've reached today's AI Coach message limit", {
      limit: usage.limit,
      resetsAt: usage.resetsAt.toISOString(),
    });
  }

  // Persisted before the AI call, not after — a slow or failed upstream call
  // should never silently drop what the user typed. If the reply then fails,
  // the row is flagged `failed` (hidden from the thread, history and quota)
  // and re-used by a retry carrying the same clientId.
  let userMessage;
  if (existing) {
    userMessage = await prisma.aiCoachMessage.update({ where: { id: existing.id }, data: { content, failed: false, createdAt: new Date() } });
  } else {
    try {
      userMessage = await prisma.aiCoachMessage.create({
        data: { userId, role: "user", content, clientId: clientId ?? null },
      });
    } catch (err) {
      // A concurrent send with the same clientId won the unique race.
      if (clientId && (err as { code?: string }).code === "P2002") {
        throw new ApiHttpError(409, "ai_coach_duplicate_send", "This message is already being sent");
      }
      throw err;
    }
  }

  const [{ prompt: systemPrompt, sources }, history] = await Promise.all([
    buildSystemPrompt(userId),
    prisma.aiCoachMessage.findMany({
      where: { userId, failed: false },
      orderBy: { createdAt: "desc" },
      take: MAX_HISTORY_MESSAGES,
    }),
  ]);

  const transcript = history
    .reverse()
    .map((m: { role: string; content: string }) => `${m.role === "user" ? "User" : "Coach"}: ${m.content}`)
    .join("\n");
  const prompt = `${systemPrompt}\n\nConversation so far:\n${transcript}\n\nCoach:`;

  let replyText: string;
  try {
    replyText = (await generateCompletion(prompt)).trim();
  } catch {
    // Flag the stored message so it isn't shown/counted/replayed; the client
    // keeps the text as an unsent draft and retries with the same clientId.
    // 503 ai_unavailable: the clients' "temporarily unavailable" state.
    await prisma.aiCoachMessage.update({ where: { id: userMessage.id }, data: { failed: true } });
    throw new ApiHttpError(
      503,
      "ai_unavailable",
      "The AI Coach couldn't respond right now — try again in a moment",
    );
  }

  const assistantMessage = await prisma.aiCoachMessage.create({
    data: {
      userId,
      role: "assistant",
      // A genuinely empty completion is rare but real (e.g. provider-side
      // content filtering) — this is an honest fallback string, not a
      // fabricated answer, same spirit as this app's other empty-states.
      content: replyText || "I don't have a response for that — could you try rephrasing?",
      // Exactly the context items injected into this reply's prompt.
      sources: sources.length > 0 ? (sources as unknown as Prisma.InputJsonArray) : undefined,
    },
  });

  return { userMessage: toDTO(userMessage), assistantMessage: toDTO(assistantMessage) };
}

/** Deletes this user's whole AI Coach conversation (Figma AI 01 settings → Clear conversation). */
export async function clearConversation(userId: string): Promise<{ deleted: number }> {
  const { count } = await prisma.aiCoachMessage.deleteMany({ where: { userId } });
  return { deleted: count };
}
