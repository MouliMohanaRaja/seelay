import { readFileSync, existsSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve as resolvePath, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveCapture } from "../lib/resolve/pipeline";
import { fallbackConfigured } from "../lib/resolve/extract/t4-vision";
import { OCR_MIN_MEAN_CONFIDENCE } from "../lib/resolve/extract/t3-ocr";
import type { ResolutionResult } from "../lib/resolve/types";

// PLAN.md 2.2 verify harness — DIAGNOSTIC TOOLING ONLY. Runs each image in a
// directory through the real image pipeline and records a structured record
// of why it succeeded or failed. Does not change the pipeline; only reads
// the read-only diagnostics resolveCapture already returns.
//
// Usage: npm run test:images -- <dir-with-images-and-manifest.tsv> [--max-tier=N]
//   --max-tier=3 runs T3-only (no vision); default runs all tiers (T3+T4).
// manifest.tsv rows: "<filename>\t<expected title>\t<year>"
// Writes <dir>/diagnostics.jsonl (one record per image) + prints a summary.

const root = resolvePath(dirname(fileURLToPath(import.meta.url)), "..");

const envPath = resolvePath(root, ".env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}

// The diagnostic reason/outcome codes requested for Step 2.2.
type Reason =
  | "No text detected"
  | "Text detected but no TMDB match"
  | "Multiple ambiguous candidates"
  | "OCR confidence below threshold"
  | "Vision rescued"
  | "Vision failed";

type Diagnostic = {
  image: string;
  expected: string | null;
  correct: boolean;
  ocrText: string; // truncated
  ocrConfidence: number; // tesseract mean, 0..100
  candidateLines: string[];
  tmdbCandidates: { title: string; year: number | null; matchQuality: number }[];
  match: { title: string; year: number | null; mediaType: string } | null;
  state: string;
  tier: string | null;
  llmInvoked: boolean;
  t4Attempted: boolean;
  processingMs: number;
  reasons: Reason[];
};

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
function ctype(fn: string): string {
  return fn.endsWith(".png") ? "image/png" : "image/jpeg";
}
function truncate(s: string, n: number): string {
  const clean = s.replace(/\s+/g, " ").trim();
  return clean.length > n ? clean.slice(0, n) + "…" : clean;
}

// Classify why the image landed where it did. One or more codes may apply.
function classify(res: ResolutionResult): Reason[] {
  const reasons: Reason[] = [];
  const conf = res.ocr?.meanConfidence ?? 0;
  const text = (res.ocr?.text ?? "").trim();
  const hasText = text.length > 0 && (res.ocr?.lineCount ?? 0) > 0;
  const cands = res.tmdbCandidates ?? [];

  if (res.llmUsed) reasons.push("Vision rescued");
  if (!hasText) reasons.push("No text detected");
  if (hasText && conf < OCR_MIN_MEAN_CONFIDENCE)
    reasons.push("OCR confidence below threshold");
  if (hasText && !res.match && cands.length === 0)
    reasons.push("Text detected but no TMDB match");
  if (cands.length >= 2 && cands[1].matchQuality >= cands[0].matchQuality * 0.95)
    reasons.push("Multiple ambiguous candidates");
  if (res.t4Attempted && !res.llmUsed) reasons.push("Vision failed");

  return reasons;
}

async function main() {
  const dir = process.argv.slice(2).find((a) => !a.startsWith("--"));
  if (!dir) {
    console.error("usage: tsx test/image-resolution.ts <dir> [--max-tier=N]");
    process.exit(1);
  }
  const tierArg = process.argv.find((a) => a.startsWith("--max-tier="));
  const maxTier = tierArg ? Number(tierArg.split("=")[1]) : 99;
  const jsonlPath = join(dir, "diagnostics.jsonl");
  writeFileSync(jsonlPath, ""); // reset

  const manifestPath = join(dir, "manifest.tsv");
  const expected = new Map<string, string>();
  if (existsSync(manifestPath)) {
    for (const line of readFileSync(manifestPath, "utf8").split("\n")) {
      const [fn, title] = line.split("\t");
      if (fn && title) expected.set(fn.trim(), title.trim());
    }
  }
  const files = readdirSync(dir)
    .filter((f) => /\.(png|jpe?g)$/i.test(f))
    .sort();

  const configured = fallbackConfigured();
  console.log(`image resolution diagnostics — ${files.length} images`);
  console.log(
    `tiers: ${maxTier >= 4 ? "T3+T4" : `up to T${maxTier}`} · T4 (Intelligent Fallback) configured: ${configured}\n`
  );

  const records: Diagnostic[] = [];
  for (const fn of files) {
    const bytes = readFileSync(join(dir, fn));
    const exp = expected.get(fn) ?? null;
    const t0 = Date.now();
    let res: ResolutionResult;
    try {
      res = await resolveCapture("image", "", null, {
        image: { bytes: Buffer.from(bytes), contentType: ctype(fn) },
        maxTier,
      });
    } catch (e) {
      // A TMDB/network failure (retries exhausted) must not abort the whole
      // run — record it as an upstream error and continue to the next image.
      const rec: Diagnostic = {
        image: fn,
        expected: exp,
        correct: false,
        ocrText: `<upstream error: ${e instanceof Error ? e.message : String(e)}>`,
        ocrConfidence: 0,
        candidateLines: [],
        tmdbCandidates: [],
        match: null,
        state: "error",
        tier: null,
        llmInvoked: false,
        t4Attempted: false,
        processingMs: Date.now() - t0,
        reasons: [],
      };
      records.push(rec);
      writeFileSync(jsonlPath, JSON.stringify(rec) + "\n", { flag: "a" });
      console.log(`ERROR ${fn}  ${rec.ocrText}  ${rec.processingMs}ms`);
      continue;
    }
    const processingMs = Date.now() - t0;
    const correct = !!res.match && !!exp && norm(res.match.title) === norm(exp);

    const rec: Diagnostic = {
      image: fn,
      expected: exp,
      correct,
      ocrText: truncate(res.ocr?.text ?? "", 160),
      ocrConfidence: Math.round(res.ocr?.meanConfidence ?? 0),
      candidateLines: res.ocr?.candidateLines ?? [],
      tmdbCandidates: (res.tmdbCandidates ?? []).map((c) => ({
        title: c.title,
        year: c.year,
        matchQuality: Math.round(c.matchQuality * 100) / 100,
      })),
      match: res.match
        ? { title: res.match.title, year: res.match.year, mediaType: res.match.mediaType }
        : null,
      state: res.state,
      tier: res.tierUsed,
      llmInvoked: res.llmUsed,
      t4Attempted: res.t4Attempted ?? false,
      processingMs,
      reasons: classify(res),
    };
    records.push(rec);
    // Append immediately so partial results survive a slow/interrupted run.
    writeFileSync(jsonlPath, JSON.stringify(rec) + "\n", { flag: "a" });

    console.log(
      `${correct ? "PASS" : "FAIL"}  ${fn}  exp="${exp ?? "?"}"\n` +
        `      ocr ${rec.ocrConfidence}% "${truncate(rec.ocrText, 56)}"\n` +
        `      lines: ${JSON.stringify(rec.candidateLines.slice(0, 4))}\n` +
        `      tmdb:  ${rec.tmdbCandidates.map((c) => `${c.title}(${c.year}) q${c.matchQuality}`).join(", ") || "—"}\n` +
        `      -> ${rec.match ? `${rec.match.title} (${rec.match.year})` : "—"}  ` +
        `state=${rec.state} tier=${rec.tier ?? "-"} llm=${rec.llmInvoked} ${processingMs}ms\n` +
        `      reasons: ${
          rec.reasons.length
            ? rec.reasons.join("; ")
            : rec.correct
              ? "clean match"
              : "no listed failure code (spurious/low-quality match)"
        }`
    );
  }

  // Summary.
  const total = records.length;
  const correct = records.filter((r) => r.correct).length;
  const ocrAlone = records.filter((r) => r.tier === "T3" && !r.llmInvoked).length;
  const t4Used = records.filter((r) => r.llmInvoked).length;
  const lat = records.map((r) => r.processingMs).sort((a, b) => a - b);
  const reasonCounts: Record<string, number> = {};
  for (const r of records)
    for (const reason of r.reasons)
      reasonCounts[reason] = (reasonCounts[reason] ?? 0) + 1;

  console.log(`\n=== SUMMARY (${total} images) ===`);
  console.log(`correct top candidate: ${correct}/${total}  (bar: >= 7/10)`);
  console.log(`OCR-alone (T3, no LLM): ${ocrAlone}/${total}`);
  console.log(`T4 vision used: ${t4Used}/${total}  (configured: ${configured})`);
  console.log(
    `latency ms: min ${lat[0]}, median ${lat[Math.floor(lat.length / 2)]}, max ${lat[lat.length - 1]} (first includes OCR worker init)`
  );
  console.log(`reason tallies: ${JSON.stringify(reasonCounts)}`);
  console.log(`\nper-image records written to ${jsonlPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
