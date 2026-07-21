import { normalizeCapture } from "./normalize";
import { extractT0 } from "./extract/t0-url-patterns";
import { extractT1 } from "./extract/t1-page-metadata";
import { extractT2 } from "./extract/t2-text-parse";
import {
  runOcr,
  ocrHasSignal,
  ocrConfidenceToScore,
  selectCandidateLines,
  type OcrResult,
} from "./extract/t3-ocr";
import { visionExtract } from "./extract/t4-vision";
import { scoreResolution, RESOLVE_AT, CONFIRM_AT } from "./score";
import { TmdbResolver, type EntityResolver, type ResolveOptions } from "./resolver";
import type {
  Candidate,
  EntityMatch,
  ItemState,
  PayloadType,
  ResolutionResult,
} from "./types";

// Stage 2 orchestration — the extraction waterfall (ARCHITECTURE.md). Each
// tier runs only if the previous produced no confident result. Text/URL:
// T0 (url patterns) → T1 (page metadata) → T2 (text parse). Image: T3 (OCR
// → T2 parse) → T4 (vision LLM). Image tiers reuse the SAME resolver +
// scorer, so nothing about the state machine changes.

export type PipelineOptions = {
  /** highest tier allowed to run (default: all implemented) */
  maxTier?: number;
  resolver?: EntityResolver;
  /** forwarded to the resolver — see ResolveOptions */
  onRetry?: () => void | Promise<void>;
  /** image bytes, required for the T3/T4 image tiers */
  image?: { bytes: Buffer; contentType: string };
};

const CONFIDENT = 0.5;

type Attempt = {
  candidate: Candidate | null;
  match: EntityMatch | null;
  score: number;
  state: ItemState;
  llmUsed: boolean;
};

const EMPTY_ATTEMPT: Attempt = {
  candidate: null,
  match: null,
  score: 0,
  state: "needs_hint",
  llmUsed: false,
};

export async function resolveCapture(
  payloadType: PayloadType,
  payload: string,
  whoHint?: string | null,
  opts: PipelineOptions = {}
): Promise<ResolutionResult> {
  const maxTier = opts.maxTier ?? 99;
  const resolver = opts.resolver ?? new TmdbResolver();
  const resolveOpts: ResolveOptions = { onRetry: opts.onRetry };
  const capture = normalizeCapture(payloadType, payload, whoHint);

  // Text/URL waterfall → a single candidate.
  let candidate: Candidate | null = null;
  if (maxTier >= 0) candidate = extractT0(capture);
  if ((!candidate || candidate.confidence < CONFIDENT) && maxTier >= 1) {
    candidate = (await extractT1(capture)) ?? candidate;
  }
  if ((!candidate || candidate.confidence < CONFIDENT) && maxTier >= 2) {
    candidate = extractT2(capture) ?? candidate;
  }

  let best = candidate
    ? await evaluate(candidate, resolver, resolveOpts, false)
    : EMPTY_ATTEMPT;

  // Image tiers — only for image captures, only when the text path hasn't
  // already produced a strong match.
  let ocr: OcrResult | undefined;
  if (
    payloadType === "image" &&
    opts.image &&
    best.score < RESOLVE_AT &&
    maxTier >= 3
  ) {
    // T3 — OCR → T2 parse → resolver, best across candidate lines.
    ocr = await runOcr(opts.image.bytes);
    if (ocrHasSignal(ocr)) {
      const confidence = ocrConfidenceToScore(ocr.meanConfidence);
      for (const line of selectCandidateLines(ocr)) {
        // parseWho off: OCR text must not fabricate provenance (Law 4).
        const parsed = extractT2({ payloadType: "text", text: line }, { parseWho: false });
        if (!parsed) continue;
        const c: Candidate = {
          ...parsed,
          tier: "T3",
          confidence,
          whoHint: capture.whoHint,
        };
        const attempt = await evaluate(c, resolver, resolveOpts, false);
        if (attempt.score > best.score) best = attempt;
      }
    }

    // T4 — vision fallback, only if OCR couldn't clear the confirm bar.
    if (best.score < CONFIRM_AT && maxTier >= 4) {
      const vc = await visionExtract(opts.image.bytes, opts.image.contentType);
      if (vc) {
        const attempt = await evaluate(
          { ...vc, whoHint: capture.whoHint },
          resolver,
          resolveOpts,
          true
        );
        if (attempt.score > best.score) best = attempt;
      }
    }
  }

  return {
    state: best.state,
    candidate: best.candidate,
    match: best.match,
    score: best.score,
    tierUsed: best.candidate?.tier ?? null,
    llmUsed: best.llmUsed,
    whoHint: best.candidate?.whoHint ?? capture.whoHint,
    ocr: ocr
      ? { text: ocr.text, meanConfidence: ocr.meanConfidence, lineCount: ocr.lines.length }
      : undefined,
  };
}

async function evaluate(
  candidate: Candidate,
  resolver: EntityResolver,
  resolveOpts: ResolveOptions,
  llmUsed: boolean
): Promise<Attempt> {
  const matches = await resolver.resolve(candidate, resolveOpts);
  const { state, score, match } = scoreResolution(candidate, matches);
  return { candidate, match, score, state, llmUsed };
}
