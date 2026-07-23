import { createWorker, type Worker } from "tesseract.js";

// T3 — OCR. Runs server-side inside async resolution (never the capture
// request — Law 2). tesseract.js (WASM) in-process, English only (2.2
// non-goal: no multilingual tuning). Returns a noisy multi-line blob plus
// per-line confidence; selection + matching happen downstream via T2.
// See docs/2.2-image-extraction.md.

export type OcrLine = { text: string; confidence: number; height: number };
export type OcrResult = {
  text: string;
  meanConfidence: number; // tesseract mean, 0..100
  lines: OcrLine[];
};

// Below this mean confidence the OCR blob is treated as noise → escalate to T4.
export const OCR_MIN_MEAN_CONFIDENCE = 30;

// Reuse one worker across calls (loading the WASM core + lang data is the
// expensive part). Cached at module scope like the Supabase client.
let workerPromise: Promise<Worker> | null = null;
function getWorker(): Promise<Worker> {
  if (!workerPromise) workerPromise = createWorker("eng");
  return workerPromise;
}

type TesseractBbox = { x0: number; y0: number; x1: number; y1: number };
type TesseractLine = { text?: string; confidence?: number; bbox?: TesseractBbox };
type TesseractParagraph = { lines?: TesseractLine[] };
type TesseractBlock = { paragraphs?: TesseractParagraph[] };

export async function runOcr(image: Buffer): Promise<OcrResult> {
  const worker = await getWorker();
  const { data } = await worker.recognize(image, {}, { text: true, blocks: true });
  const meanConfidence = data.confidence ?? 0;

  const lines: OcrLine[] = [];
  const blocks = (data as unknown as { blocks?: TesseractBlock[] }).blocks ?? [];
  for (const b of blocks) {
    for (const p of b.paragraphs ?? []) {
      for (const l of p.lines ?? []) {
        const t = (l.text ?? "").trim();
        if (!t) continue;
        const h = l.bbox ? l.bbox.y1 - l.bbox.y0 : 0;
        lines.push({ text: t, confidence: l.confidence ?? meanConfidence, height: h });
      }
    }
  }
  // Fallback if the structured blocks aren't present: split the flat text.
  if (lines.length === 0) {
    for (const t of (data.text ?? "").split("\n").map((s) => s.trim())) {
      if (t) lines.push({ text: t, confidence: meanConfidence, height: 0 });
    }
  }

  return { text: data.text ?? "", meanConfidence, lines };
}

export function ocrHasSignal(ocr: OcrResult): boolean {
  return ocr.meanConfidence >= OCR_MIN_MEAN_CONFIDENCE && ocr.lines.length > 0;
}

// tesseract mean (0..100) → extractor self-rating (0..1), capped at 0.6 and
// scaled by OCR quality so it stays at/below the deterministic tiers. The
// scorer's exact-match floor still auto-resolves an OCR'd title that matches
// TMDB exactly; fuzzy matches scale down honestly (Law 3).
export function ocrConfidenceToScore(meanConfidence: number): number {
  return Math.max(0, Math.min(1, meanConfidence / 100)) * 0.6;
}

// Pick the most title-like lines: prominence (tall text = big title) plus OCR
// confidence, a mild length preference. Obvious chrome loses on score, and
// since the pipeline keeps the best-scoring TMDB match across candidates,
// noisy lines simply don't win — no hard filtering needed.
export function selectCandidateLines(ocr: OcrResult, max = 3): string[] {
  const ranked = ocr.lines
    .filter((l) => l.text.replace(/[^a-z0-9]/gi, "").length >= 2)
    .map((l) => ({
      text: l.text,
      score: l.height * 1.0 + l.confidence * 0.5 + Math.min(l.text.length, 30) * 0.2,
    }))
    .sort((a, b) => b.score - a.score);

  // Select the same raw top lines as before (dedup on the raw text so the
  // cleanup below can NOT change which lines are chosen — ranking untouched),
  // then clean each selected line's query.
  const seen = new Set<string>();
  const out: string[] = [];
  for (const { text } of ranked) {
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const cleaned = cleanCandidateLine(text);
    if (cleaned.replace(/[^a-z0-9]/gi, "").length >= 2) out.push(cleaned);
    if (out.length >= max) break;
  }
  return out;
}

// The one deterministic cleanup justified by the 2.2 diagnostics (RC2): a
// candidate line that IS the title but carries trailing aggregator/trailer
// chrome ("… | Trailer | Ananthika", "… (film) IMDb Letterboxd JustWatch")
// produces a query too noisy for TMDB. Keep the title portion by cutting at
// the first list separator or aggregator marker, and drop parenthetical
// qualifiers. Deliberately narrow — not a re-tuning of line ranking.
const CHROME_MARKER =
  /\b(official\s+)?(trailer|teaser)\b|\b(imdb|letterboxd|justwatch|rotten\s+tomatoes|metacritic|wikipedia|fandom)\b/i;

function cleanCandidateLine(s: string): string {
  let t = s;
  const sep = t.search(/\s[|•·]\s/); // "8 Vasantalu | Trailer | …" → "8 Vasantalu"
  if (sep > 0) t = t.slice(0, sep);
  const marker = t.search(CHROME_MARKER); // "… (film) IMDb Letterboxd" → "… (film)"
  if (marker > 0) t = t.slice(0, marker);
  t = t.replace(/\((?:film|movie|tv series|tv|show|series|\d{4})\)/gi, " ");
  return t.replace(/\s+/g, " ").trim();
}
