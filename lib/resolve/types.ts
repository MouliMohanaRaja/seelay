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

export type ItemState =
  | "raw"
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
};
