import { normalizeCapture } from "./normalize";
import { extractT0 } from "./extract/t0-url-patterns";
import { extractT1 } from "./extract/t1-page-metadata";
import { extractT2 } from "./extract/t2-text-parse";
import { scoreResolution } from "./score";
import { TmdbResolver, type EntityResolver } from "./resolver";
import type { Candidate, PayloadType, ResolutionResult } from "./types";

// Stage 2 orchestration — the extraction waterfall (ARCHITECTURE.md).
// Each tier runs only if the previous produced no confident candidate.
// Tiers present: T0, T1, T2 — each kept because it measurably improved
// coverage on test/resolution-set.json (see PLAN.md 1.3 verify record).
// T3 images are Stage 2; T4 (Intelligent Fallback) only after the T0–T2
// numbers justified it.

export type PipelineOptions = {
  /** highest tier allowed to run (default: all implemented) */
  maxTier?: number;
  resolver?: EntityResolver;
  /** forwarded to the resolver — see ResolveOptions */
  onRetry?: () => void | Promise<void>;
};

const CONFIDENT = 0.5;

export async function resolveCapture(
  payloadType: PayloadType,
  payload: string,
  whoHint?: string | null,
  opts: PipelineOptions = {}
): Promise<ResolutionResult> {
  const maxTier = opts.maxTier ?? 99;
  const resolver = opts.resolver ?? new TmdbResolver();
  const capture = normalizeCapture(payloadType, payload, whoHint);

  let candidate: Candidate | null = null;
  if (maxTier >= 0) {
    candidate = extractT0(capture);
  }

  if ((!candidate || candidate.confidence < CONFIDENT) && maxTier >= 1) {
    candidate = (await extractT1(capture)) ?? candidate;
  }
  if ((!candidate || candidate.confidence < CONFIDENT) && maxTier >= 2) {
    candidate = extractT2(capture) ?? candidate;
  }

  const matches = candidate
    ? await resolver.resolve(candidate, { onRetry: opts.onRetry })
    : [];
  const { state, score, match } = scoreResolution(candidate, matches);

  return {
    state,
    candidate,
    match,
    score,
    tierUsed: candidate?.tier ?? null,
    llmUsed: false,
    whoHint: candidate?.whoHint ?? capture.whoHint,
  };
}
