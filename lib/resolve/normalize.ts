import type { NormalizedCapture, PayloadType } from "./types";

// Stage 1 — Normalizer. Deterministic only, no AI, no network (hard rule,
// ARCHITECTURE.md). Testable with plain fixtures.

const STRIP_PARAMS = [/^utm_/i, /^fbclid$/i, /^gclid$/i, /^igsh$/i, /^si$/i, /^feature$/i];

export function normalizeCapture(
  payloadType: PayloadType,
  payload: string,
  whoHint?: string | null
): NormalizedCapture {
  const trimmed = payload.trim();
  if (payloadType === "url") {
    return { payloadType, url: normalizeUrl(trimmed), whoHint: whoHint ?? undefined };
  }
  return { payloadType, text: trimmed, whoHint: whoHint ?? undefined };
}

export function normalizeUrl(raw: string): string {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return raw;
  }
  if (u.hostname === "youtu.be") {
    u = new URL(`https://www.youtube.com/watch?v=${u.pathname.slice(1)}`);
  }
  const kept = new URLSearchParams();
  for (const [k, v] of u.searchParams) {
    if (!STRIP_PARAMS.some((re) => re.test(k))) kept.append(k, v);
  }
  u.search = kept.toString();
  u.hash = "";
  let s = u.toString();
  if (s.endsWith("/")) s = s.slice(0, -1);
  return s;
}
