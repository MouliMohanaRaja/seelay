import type { Candidate, EntityMatch, ItemState } from "./types";

// Stage 4 — Confidence Scorer (trust contract Law 3: never silently guess).
// Combines the producing tier's self-rating with match quality; ambiguity
// pushes toward asking instead of guessing. Thresholds tuned against
// test/resolution-set.json (PLAN.md 1.3/2.2).

const RESOLVE_AT = 0.75;
const CONFIRM_AT = 0.45;

export function scoreResolution(
  candidate: Candidate | null,
  matches: EntityMatch[]
): { state: ItemState; score: number; match: EntityMatch | null } {
  if (!candidate || matches.length === 0) {
    return { state: "needs_hint", score: 0, match: null };
  }
  const top = matches[0];
  let score = candidate.confidence * top.matchQuality;

  // A close runner-up means genuine ambiguity — ask, don't guess.
  const runnerUp = matches[1];
  const ambiguous =
    runnerUp !== undefined &&
    runnerUp.tmdbId !== top.tmdbId &&
    runnerUp.matchQuality >= top.matchQuality * 0.95;
  if (ambiguous) score *= 0.85;

  // An exact-title match with no close competitor is deterministic enough to
  // auto-resolve even from a modest tier (still inspectable via the raw link).
  if (top.matchQuality === 1 && !ambiguous) score = Math.max(score, 0.8);

  const state: ItemState =
    score >= RESOLVE_AT
      ? "resolved"
      : score >= CONFIRM_AT
        ? "needs_confirm"
        : "needs_hint";
  return { state, score, match: top };
}
