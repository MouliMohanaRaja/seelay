export type PayloadType = "url" | "text" | "image";

export type NormalizedCapture = {
  payloadType: PayloadType;
  url?: string;
  text?: string;
  whoHint?: string;
};

export type Tier = "T0" | "T1" | "T2" | "T3" | "T4";

export type Candidate = {
  tier: Tier;
  /** extractor self-rating, 0..1 */
  confidence: number;
  title?: string;
  year?: number;
  mediaType?: "movie" | "tv";
  imdbId?: string;
  tmdbId?: number;
  whoHint?: string;
};

export type EntityMatch = {
  tmdbId: number;
  mediaType: "movie" | "tv";
  title: string;
  year: number | null;
  posterRef: string | null;
  /** 0..1 — how well this entity matches the candidate */
  matchQuality: number;
};

// raw → resolving → (retrying)* → resolved | needs_confirm | needs_hint
// needs_hint/needs_confirm → resolving (on a hint retry) → ...
// resolved | needs_confirm → confirmed (on user confirm)
// "retrying" and a failed run landing in "needs_hint" are both backend
// truth, not a UI-side guess — see route handlers in app/api/items and
// app/api/captures.
export type ItemState =
  | "raw"
  | "resolving"
  | "retrying"
  | "resolved"
  | "needs_confirm"
  | "needs_hint"
  | "confirmed";

export type ResolutionResult = {
  state: ItemState;
  candidate: Candidate | null;
  match: EntityMatch | null;
  score: number;
  tierUsed: Tier | null;
  llmUsed: boolean;
  whoHint?: string;
  // Read-only diagnostics from the image path, ignored by the DB writer and
  // never affecting behaviour — used by the 2.2 verify harness to explain
  // why each image succeeded or failed. See test/image-resolution.ts.
  ocr?: {
    text: string;
    meanConfidence: number;
    lineCount: number;
    candidateLines: string[]; // OCR lines actually fed to matching
  };
  // TMDB candidates returned for the winning attempt (top matches).
  tmdbCandidates?: {
    title: string;
    year: number | null;
    mediaType: "movie" | "tv";
    matchQuality: number;
  }[];
  // True when the T4 vision step was reached AND a provider was configured
  // (i.e. a real fallback call was made), regardless of whether it rescued.
  t4Attempted?: boolean;
  // True when that call was rejected with a transient rate limit (HTTP 429).
  // The item still settles through the normal state machine (needs_hint);
  // this flag only records why T4 produced nothing.
  t4RateLimited?: boolean;
};
