import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Unit tests for src/lib/aiClient.ts's provider-agnostic completion call —
 * deliberately NOT a DB-backed integration test like every other file in
 * this directory (see helpers.ts's own comment), because there's no
 * database interaction here at all: this module only reads config/env.ts
 * and calls the network. `fetch` and config/env.ts are both mocked so
 * these run offline, deterministically, without a real Anthropic/OpenAI/
 * Azure OpenAI account — the three providers' request shapes (URL, auth
 * header, body) and response parsing are what's actually under test.
 *
 * Each test calls vi.resetModules() + a fresh dynamic import so its own
 * mocked env.ts (and therefore aiClient.ts's own module-level references
 * to `env`) take effect — mutating the shared `env` singleton the way the
 * rest of the app reads it would leak between tests otherwise.
 */

const baseEnv = {
  AI_PROVIDER: "anthropic" as "anthropic" | "openai" | "azure-openai",
  ANTHROPIC_API_KEY: undefined as string | undefined,
  OPENAI_API_KEY: undefined as string | undefined,
  AI_MODEL: undefined as string | undefined,
  AZURE_OPENAI_API_KEY: undefined as string | undefined,
  AZURE_OPENAI_ENDPOINT: undefined as string | undefined,
  AZURE_OPENAI_DEPLOYMENT: undefined as string | undefined,
  AZURE_OPENAI_API_VERSION: "2024-10-21",
};

async function loadAiClient(envOverrides: Partial<typeof baseEnv>) {
  vi.resetModules();
  vi.doMock("../src/config/env", () => ({ env: { ...baseEnv, ...envOverrides } }));
  return import("../src/lib/aiClient");
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.doUnmock("../src/config/env");
});

describe("aiClient — Azure OpenAI provider", () => {
  it("isAiConfigured()/getAiProviderStatus() reflect the AZURE_OPENAI_* trio, not the Anthropic/OpenAI keys", async () => {
    const { isAiConfigured, getAiProviderStatus } = await loadAiClient({
      AI_PROVIDER: "azure-openai",
      AZURE_OPENAI_API_KEY: "test-key",
      AZURE_OPENAI_ENDPOINT: "https://example-resource.openai.azure.com",
      AZURE_OPENAI_DEPLOYMENT: "gpt-4o-mini-deploy",
    });

    expect(isAiConfigured()).toBe(true);
    expect(getAiProviderStatus()).toEqual({
      provider: "azure-openai",
      configured: true,
      model: "gpt-4o-mini-deploy", // the deployment name, not a base model name
    });
  });

  it("reports unconfigured when any one of the three azure-openai settings is missing", async () => {
    const { isAiConfigured } = await loadAiClient({
      AI_PROVIDER: "azure-openai",
      AZURE_OPENAI_API_KEY: "test-key",
      AZURE_OPENAI_ENDPOINT: "https://example-resource.openai.azure.com",
      AZURE_OPENAI_DEPLOYMENT: undefined,
    });

    expect(isAiConfigured()).toBe(false);
  });

  it("generateCompletion() calls the per-resource/per-deployment URL with an api-key header and returns the parsed reply", async () => {
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe(
        "https://example-resource.openai.azure.com/openai/deployments/gpt-4o-mini-deploy/chat/completions?api-version=2024-10-21",
      );
      const headers = init.headers as Record<string, string>;
      expect(headers["api-key"]).toBe("test-key");
      expect(headers["authorization"]).toBeUndefined();
      const body = JSON.parse(init.body as string);
      expect(body.messages).toEqual([{ role: "user", content: "How's my week looking?" }]);

      return new Response(
        JSON.stringify({ choices: [{ message: { content: "Solid week — two sessions logged." } }] }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const { generateCompletion } = await loadAiClient({
      AI_PROVIDER: "azure-openai",
      AZURE_OPENAI_API_KEY: "test-key",
      AZURE_OPENAI_ENDPOINT: "https://example-resource.openai.azure.com",
      AZURE_OPENAI_DEPLOYMENT: "gpt-4o-mini-deploy",
    });

    const reply = await generateCompletion("How's my week looking?");
    expect(reply).toBe("Solid week — two sessions logged.");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("generateCompletion() surfaces a non-2xx Azure OpenAI response as a thrown error rather than swallowing it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("deployment not found", { status: 404 })),
    );

    const { generateCompletion } = await loadAiClient({
      AI_PROVIDER: "azure-openai",
      AZURE_OPENAI_API_KEY: "test-key",
      AZURE_OPENAI_ENDPOINT: "https://example-resource.openai.azure.com",
      AZURE_OPENAI_DEPLOYMENT: "gpt-4o-mini-deploy",
    });

    await expect(generateCompletion("hi")).rejects.toThrow(/Azure OpenAI API error 404/);
  });

  it("generateCompletion() throws a clear \"not configured\" error instead of calling fetch when unconfigured", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { generateCompletion } = await loadAiClient({ AI_PROVIDER: "azure-openai" });

    await expect(generateCompletion("hi")).rejects.toThrow(/not configured/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("aiClient — provider selection stays correct for the pre-existing providers", () => {
  it("still uses Authorization: Bearer + api.openai.com for the openai provider", async () => {
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe("https://api.openai.com/v1/chat/completions");
      const headers = init.headers as Record<string, string>;
      expect(headers["authorization"]).toBe("Bearer test-openai-key");
      return new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { generateCompletion } = await loadAiClient({
      AI_PROVIDER: "openai",
      OPENAI_API_KEY: "test-openai-key",
    });

    expect(await generateCompletion("hi")).toBe("ok");
  });

  it("still uses x-api-key + api.anthropic.com for the anthropic provider", async () => {
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe("https://api.anthropic.com/v1/messages");
      const headers = init.headers as Record<string, string>;
      expect(headers["x-api-key"]).toBe("test-anthropic-key");
      return new Response(JSON.stringify({ content: [{ text: "ok" }] }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { generateCompletion } = await loadAiClient({
      AI_PROVIDER: "anthropic",
      ANTHROPIC_API_KEY: "test-anthropic-key",
    });

    expect(await generateCompletion("hi")).toBe("ok");
  });
});

describe("aiClient — image input", () => {
  const image = { mediaType: "image/png" as const, base64: "iVBORw0KGgo=" };

  it("OpenAI sends text + image_url data URL parts", async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      expect(body.messages[0].content).toEqual([
        { type: "text", text: "what is this" },
        { type: "image_url", image_url: { url: "data:image/png;base64,iVBORw0KGgo=" } },
      ]);
      return new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { generateCompletion } = await loadAiClient({ AI_PROVIDER: "openai", OPENAI_API_KEY: "k" });
    expect(await generateCompletion("what is this", { image })).toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("Anthropic sends a base64 image block before the text", async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      expect(body.messages[0].content).toEqual([
        { type: "image", source: { type: "base64", media_type: "image/png", data: "iVBORw0KGgo=" } },
        { type: "text", text: "what is this" },
      ]);
      return new Response(JSON.stringify({ content: [{ text: "ok" }] }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { generateCompletion } = await loadAiClient({ AI_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "k" });
    expect(await generateCompletion("what is this", { image })).toBe("ok");
  });

  it("text-only calls keep a plain string content", async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      expect(JSON.parse(init.body as string).messages[0].content).toBe("hi");
      return new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { generateCompletion } = await loadAiClient({ AI_PROVIDER: "openai", OPENAI_API_KEY: "k" });
    await generateCompletion("hi");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
