import type { Candidate, NormalizedCapture } from "../types";

// T2 — deterministic text parsing. No network, no AI. Splits who-hints,
// strips service words and filler, detects media-type hints; whatever
// remains is the title query.

const SERVICE_WORDS = [
  "netflix",
  "prime video",
  "amazon prime",
  "prime",
  "hotstar",
  "jiocinema",
  "sonyliv",
  "zee5",
  "hulu",
  "disney plus",
  "disney\\+",
  "hbo max",
  "hbo",
  "apple tv\\+",
  "apple tv",
  "youtube",
  "ott",
];

const WHO_PATTERNS = [
  /[—–-]\s*from\s+(.+)$/i,
  /,?\s*\bfrom\s+([a-z][a-z .]{1,40})$/i,
  /,?\s*\brecommended\s+by\s+([a-z][a-z .]{1,40})$/i,
  /,?\s*([a-z][a-z .]{1,40})\s+recommended(?:\s+it)?\s*$/i,
];

const FILLER_LEAD = /^(watch|see|check out|add)\s+/i;
const FILLER_TRAIL =
  /\s+(this weekend|this week|tonight|sometime|someday|later)\s*$/i;

export function extractT2(capture: NormalizedCapture): Candidate | null {
  const raw = capture.text;
  if (!raw) return null;
  let text = raw.trim();
  let who: string | undefined;

  for (const re of WHO_PATTERNS) {
    const m = text.match(re);
    if (m && m.index !== undefined) {
      who = m[1].trim().replace(/[.,]+$/, "");
      text = text.slice(0, m.index).trim();
      break;
    }
  }

  let mediaType: "movie" | "tv" | undefined;
  if (/\b(series|show|season)\b/i.test(text)) mediaType = "tv";
  else if (/\b(movie|film)\b/i.test(text)) mediaType = "movie";
  text = text.replace(/\b(series|show|season|movie|film)\b/gi, " ");

  for (const w of SERVICE_WORDS) {
    text = text.replace(new RegExp(`(^|\\s)(on\\s+)?${w}(?=\\s|$)`, "gi"), " ");
  }

  text = text.replace(FILLER_LEAD, "").replace(FILLER_TRAIL, "");

  let year: number | undefined;
  const ym = text.match(/\(\s*((?:19|20)\d{2})\s*\)/);
  if (ym) {
    year = Number(ym[1]);
    text = text.replace(ym[0], " ");
  }

  text = text
    .replace(/[—–|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[,.]+$/, "");
  if (!text) return null;

  return {
    tier: "T2",
    confidence: 0.6,
    title: text,
    mediaType,
    year,
    whoHint: who ?? capture.whoHint,
  };
}
