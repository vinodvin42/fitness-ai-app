import { env } from "../config/env";

/**
 * AI provider configuration (20 Aug 2026) — originally closed just the
 * infrastructure half of gap §13; `generateCompletion()` is now called by
 * the real AI Coach chat feature (apps/api/src/modules/aiCoach/aiCoach.service.ts,
 * 27 Aug 2026). Three providers are supported: Anthropic and OpenAI direct,
 * plus Azure OpenAI (4 Sep 2026) for deployments that want AI billed
 * through the same Azure subscription/resource group the rest of the
 * stack runs on (see infra/azure/*.bicep) instead of a separate
 * Anthropic/OpenAI account — AI_PROVIDER picks which one is active, and
 * only that provider's key(s) need to be set.
 *
 * Uses the platform's native `fetch` (Node 18+) directly rather than
 * adding the `openai`/`@anthropic-ai/sdk` packages as dependencies — all
 * three providers' chat-completion APIs are simple enough to call
 * directly (Azure OpenAI's is the same request/response shape as
 * OpenAI's own), and this keeps the dependency footprint minimal.
 */

export function isAiConfigured(): boolean {
  if (env.AI_PROVIDER === "anthropic") return Boolean(env.ANTHROPIC_API_KEY);
  if (env.AI_PROVIDER === "azure-openai") {
    // All three required together — env.ts's own boot-time check already
    // refuses to start with only some of these set, so by the time this
    // runs it's really just "all set" or "AI_PROVIDER isn't azure-openai".
    return Boolean(env.AZURE_OPENAI_API_KEY && env.AZURE_OPENAI_ENDPOINT && env.AZURE_OPENAI_DEPLOYMENT);
  }
  return Boolean(env.OPENAI_API_KEY);
}

const DEFAULT_MODEL: Record<typeof env.AI_PROVIDER, string> = {
  anthropic: "claude-sonnet-4-5",
  openai: "gpt-4o-mini",
  // Azure OpenAI has no meaningful "default" here — it deploys base
  // models under a name you pick yourself (AZURE_OPENAI_DEPLOYMENT), so
  // there's nothing generic to fall back to the way there is for the two
  // direct-API providers. getAiProviderStatus() below reports the actual
  // deployment name instead of this placeholder.
  "azure-openai": "(set via AZURE_OPENAI_DEPLOYMENT)",
};

export function getAiProviderStatus() {
  return {
    provider: env.AI_PROVIDER,
    configured: isAiConfigured(),
    model:
      env.AI_PROVIDER === "azure-openai"
        ? (env.AZURE_OPENAI_DEPLOYMENT ?? DEFAULT_MODEL["azure-openai"])
        : (env.AI_MODEL ?? DEFAULT_MODEL[env.AI_PROVIDER]),
  };
}

/** Optional image input for vision-capable calls (JPEG/PNG, base64 without the data-URL prefix). */
export interface CompletionImage {
  mediaType: "image/jpeg" | "image/png";
  base64: string;
}

/** OpenAI/Azure chat-completions content: plain string when text-only (unchanged), content parts when an image is attached. */
function openAiContent(prompt: string, image?: CompletionImage) {
  if (!image) return prompt;
  return [
    { type: "text", text: prompt },
    { type: "image_url", image_url: { url: `data:${image.mediaType};base64,${image.base64}` } },
  ];
}

async function generateWithAnthropic(prompt: string, image?: CompletionImage): Promise<string> {
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
      messages: [
        {
          role: "user",
          content: image
            ? [
                { type: "image", source: { type: "base64", media_type: image.mediaType, data: image.base64 } },
                { type: "text", text: prompt },
              ]
            : prompt,
        },
      ],
    }),
  });
  if (!res.ok) {
    throw new Error(`Anthropic API error ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as { content?: Array<{ text?: string }> };
  return data.content?.[0]?.text ?? "";
}

async function generateWithOpenAi(prompt: string, image?: CompletionImage): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: env.AI_MODEL ?? DEFAULT_MODEL.openai,
      messages: [{ role: "user", content: openAiContent(prompt, image) }],
    }),
  });
  if (!res.ok) {
    throw new Error(`OpenAI API error ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content ?? "";
}

async function generateWithAzureOpenAi(prompt: string, image?: CompletionImage): Promise<string> {
  // Azure OpenAI's Chat Completions payload/response shape is identical to
  // OpenAI's own (both are versions of the same API) — only the URL and
  // auth header differ, so the response is parsed the same way
  // generateWithOpenAi() does above. The URL is per-resource
  // (AZURE_OPENAI_ENDPOINT) + per-deployment (AZURE_OPENAI_DEPLOYMENT),
  // not a shared api.openai.com host — that's the "one Azure OpenAI
  // resource can host several named deployments" model env.ts's own
  // comment describes.
  const url = `${env.AZURE_OPENAI_ENDPOINT}/openai/deployments/${env.AZURE_OPENAI_DEPLOYMENT}/chat/completions?api-version=${env.AZURE_OPENAI_API_VERSION}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      // Azure OpenAI authenticates with a plain `api-key` header, not
      // `Authorization: Bearer` — a real difference from OpenAI's own API,
      // not an oversight.
      "api-key": env.AZURE_OPENAI_API_KEY!,
    },
    body: JSON.stringify({
      messages: [{ role: "user", content: openAiContent(prompt, image) }],
    }),
  });
  if (!res.ok) {
    throw new Error(`Azure OpenAI API error ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content ?? "";
}

/** Provider-agnostic single-turn text generation. Throws if unconfigured — callers should check `isAiConfigured()` first if they want to degrade gracefully instead. */
export async function generateCompletion(prompt: string, options?: { image?: CompletionImage }): Promise<string> {
  if (!isAiConfigured()) {
    throw new Error(
      "AI provider not configured — set ANTHROPIC_API_KEY, OPENAI_API_KEY, or the AZURE_OPENAI_* trio (see .env.example)",
    );
  }
  if (env.AI_PROVIDER === "anthropic") return generateWithAnthropic(prompt, options?.image);
  if (env.AI_PROVIDER === "azure-openai") return generateWithAzureOpenAi(prompt, options?.image);
  return generateWithOpenAi(prompt, options?.image);
}
