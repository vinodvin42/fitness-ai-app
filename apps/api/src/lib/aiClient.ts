import { env } from "../config/env";

/**
 * AI provider configuration (20 Aug 2026) — closes the infrastructure
 * half of gap §13, deliberately not the feature itself. This is just the
 * plumbing: reading which provider/key is configured and exposing a
 * thin, provider-agnostic text-generation call, so a real AI feature
 * (AI Coach chat, a workout generator, diet-log vision, readiness
 * scoring) can be wired in later without a fresh "how do we even call
 * an AI provider" decision each time. Nothing in this app calls
 * `generateCompletion()` yet — building the AI Coach screen itself needs
 * conversation persistence, prompt design, streaming responses, rate
 * limiting, and cost controls, none of which this pass attempted. See
 * docs/mobile/07-open-questions-gaps.md §13 for the rest of what's still
 * genuinely unbuilt.
 *
 * Uses the platform's native `fetch` (Node 18+) directly rather than
 * adding the `openai`/`@anthropic-ai/sdk` packages as dependencies —
 * both providers' chat-completion APIs are simple enough to call
 * directly, and this keeps the dependency footprint minimal for
 * something no feature actually calls yet.
 */

export function isAiConfigured(): boolean {
  if (env.AI_PROVIDER === "anthropic") return Boolean(env.ANTHROPIC_API_KEY);
  return Boolean(env.OPENAI_API_KEY);
}

const DEFAULT_MODEL: Record<typeof env.AI_PROVIDER, string> = {
  anthropic: "claude-sonnet-4-5",
  openai: "gpt-4o-mini",
};

export function getAiProviderStatus() {
  return {
    provider: env.AI_PROVIDER,
    configured: isAiConfigured(),
    model: env.AI_MODEL ?? DEFAULT_MODEL[env.AI_PROVIDER],
  };
}

async function generateWithAnthropic(prompt: string): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: env.AI_MODEL ?? DEFAULT_MODEL.anthropic,
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) {
    throw new Error(`Anthropic API error ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as { content?: Array<{ text?: string }> };
  return data.content?.[0]?.text ?? "";
}

async function generateWithOpenAi(prompt: string): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: env.AI_MODEL ?? DEFAULT_MODEL.openai,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) {
    throw new Error(`OpenAI API error ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content ?? "";
}

/** Provider-agnostic single-turn text generation. Throws if unconfigured — callers should check `isAiConfigured()` first if they want to degrade gracefully instead. */
export async function generateCompletion(prompt: string): Promise<string> {
  if (!isAiConfigured()) {
    throw new Error(
      "AI provider not configured — set ANTHROPIC_API_KEY or OPENAI_API_KEY (see .env.example)",
    );
  }
  return env.AI_PROVIDER === "anthropic" ? generateWithAnthropic(prompt) : generateWithOpenAi(prompt);
}
