import type { Candidate } from "../types";

// T4 — the Intelligent Fallback (ARCHITECTURE.md). Vendor-neutral: the
// provider is an env decision, not an architectural one. Invoked ONLY when
// T3 (OCR) can't produce a confident-enough candidate, and every invocation
// is logged and counted (the A11 LLM-free-rate metric / budget line).
// See docs/2.2-image-extraction.md.
//
// Providers implemented: "anthropic", "gemini" (Google AI Studio), and any
// OpenAI-compatible endpoint (the default — set FALLBACK_LLM_BASE_URL for
// OpenRouter/Groq/local/etc). No model shopping (2.2 fence): one
// env-configured model.

type FallbackConfig = {
  provider: string;
  model: string;
  apiKey: string;
  baseUrl?: string;
};

function readConfig(): FallbackConfig | null {
  const provider = process.env.FALLBACK_LLM_PROVIDER?.trim();
  const model = process.env.FALLBACK_LLM_MODEL?.trim();
  const apiKey = process.env.FALLBACK_LLM_API_KEY?.trim();
  if (!provider || !model || !apiKey) return null;
  return {
    provider: provider.toLowerCase(),
    model,
    apiKey,
    baseUrl: process.env.FALLBACK_LLM_BASE_URL?.trim() || undefined,
  };
}

export function fallbackConfigured(): boolean {
  return readConfig() !== null;
}

const PROMPT =
  "This image is a screenshot that may reference a single movie or TV show. " +
  "Identify the one title it is about. Respond with ONLY a JSON object, no prose: " +
  '{"title": string|null, "year": number|null, "media_type": "movie"|"tv"|null, "confidence": number}. ' +
  "confidence is 0..1 for how sure you are. If no title is identifiable, set title to null.";

type VisionJson = {
  title: string | null;
  year: number | null;
  media_type: "movie" | "tv" | null;
  confidence: number;
};

// HTTP failure from a provider, carrying the status and (truncated) response
// body so transient errors like 429 can be recognised and diagnosed.
class ProviderHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
    provider: string
  ) {
    super(`${provider} ${status}`);
  }
}

async function httpError(
  res: Response,
  provider: string
): Promise<ProviderHttpError> {
  let body = "";
  try {
    body = (await res.text()).slice(0, 500);
  } catch {
    // body unavailable — status alone still identifies the failure
  }
  return new ProviderHttpError(res.status, body, provider);
}

export type VisionOutcome = {
  candidate: Candidate | null;
  // True when the provider rate-limited the call (HTTP 429). Never fails the
  // capture: the pipeline records it and the item settles at needs_hint
  // exactly like any other unresolved capture. No immediate retry — the
  // existing hint loop is the recovery path.
  rateLimited: boolean;
};

const NO_OUTCOME: VisionOutcome = { candidate: null, rateLimited: false };

export async function visionExtract(
  image: Buffer,
  contentType: string
): Promise<VisionOutcome> {
  const cfg = readConfig();
  if (!cfg) return NO_OUTCOME; // unconfigured → T4 is a no-op (item settles at needs_hint)

  console.log(
    `[T4] Intelligent Fallback invoked: provider=${cfg.provider} model=${cfg.model}`
  );

  let parsed: VisionJson | null = null;
  try {
    parsed =
      cfg.provider === "anthropic"
        ? await callAnthropic(cfg, image, contentType)
        : cfg.provider === "gemini" || cfg.provider === "google"
          ? await callGemini(cfg, image, contentType)
          : await callOpenAICompatible(cfg, image, contentType);
  } catch (e) {
    if (e instanceof ProviderHttpError && e.status === 429) {
      // Transient rate limit — expected on free tiers. Log the provider's
      // response for diagnostics and continue gracefully.
      console.warn(
        `[T4] rate-limited by ${cfg.provider} (HTTP 429); capture continues to needs_hint. Provider response: ${e.body || "<empty>"}`
      );
      return { candidate: null, rateLimited: true };
    }
    console.error("[T4] vision call failed:", e);
    return NO_OUTCOME;
  }

  if (!parsed || !parsed.title) return NO_OUTCOME;
  return {
    candidate: {
      tier: "T4",
      confidence: Math.min(0.7, Math.max(0, Number(parsed.confidence) || 0.5)),
      title: parsed.title,
      year: parsed.year ?? undefined,
      mediaType: parsed.media_type ?? undefined,
    },
    rateLimited: false,
  };
}

function parseJson(text: string): VisionJson | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const o = JSON.parse(m[0]);
    return {
      title: typeof o.title === "string" && o.title.trim() ? o.title.trim() : null,
      year: typeof o.year === "number" ? o.year : null,
      media_type: o.media_type === "tv" || o.media_type === "movie" ? o.media_type : null,
      confidence: typeof o.confidence === "number" ? o.confidence : 0.5,
    };
  } catch {
    return null;
  }
}

async function callAnthropic(
  cfg: FallbackConfig,
  image: Buffer,
  contentType: string
): Promise<VisionJson | null> {
  const base = cfg.baseUrl ?? "https://api.anthropic.com";
  const res = await fetch(`${base}/v1/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": cfg.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: cfg.model,
      max_tokens: 256,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: contentType,
                data: image.toString("base64"),
              },
            },
            { type: "text", text: PROMPT },
          ],
        },
      ],
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw await httpError(res, "anthropic");
  const json = (await res.json()) as { content?: { text?: string }[] };
  return parseJson(json.content?.[0]?.text ?? "");
}

async function callGemini(
  cfg: FallbackConfig,
  image: Buffer,
  contentType: string
): Promise<VisionJson | null> {
  const base = cfg.baseUrl ?? "https://generativelanguage.googleapis.com";
  const res = await fetch(
    `${base}/v1beta/models/${cfg.model}:generateContent`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": cfg.apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                inline_data: {
                  mime_type: contentType,
                  data: image.toString("base64"),
                },
              },
              { text: PROMPT },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(20000),
    }
  );
  if (!res.ok) throw await httpError(res, "gemini");
  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = (json.candidates?.[0]?.content?.parts ?? [])
    .map((p) => p.text ?? "")
    .join("");
  return parseJson(text);
}

async function callOpenAICompatible(
  cfg: FallbackConfig,
  image: Buffer,
  contentType: string
): Promise<VisionJson | null> {
  const base = cfg.baseUrl ?? "https://api.openai.com/v1";
  const dataUrl = `data:${contentType};base64,${image.toString("base64")}`;
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      max_tokens: 256,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: PROMPT },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw await httpError(res, "openai-compatible");
  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return parseJson(json.choices?.[0]?.message?.content ?? "");
}
