import { readFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, resolve as resolvePath, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveCapture } from "../lib/resolve/pipeline";
import { fallbackConfigured } from "../lib/resolve/extract/t4-vision";

// PLAN.md 2.2 verify harness. Runs each image in a directory through the
// full image pipeline (T3 OCR → T2 → TMDB → scorer, T4 if configured) and
// reports OCR output, match, final state, tier, T4 usage, and latency.
//
// Usage: npm run test:images -- <dir-with-images-and-manifest.tsv>
// manifest.tsv rows: "<filename>\t<expected title>\t<year>"

const root = resolvePath(dirname(fileURLToPath(import.meta.url)), "..");

const envPath = resolvePath(root, ".env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
function ctype(fn: string): string {
  return fn.endsWith(".png") ? "image/png" : "image/jpeg";
}

async function main() {
  const dir = process.argv[2];
  if (!dir) {
    console.error("usage: tsx test/image-resolution.ts <dir>");
    process.exit(1);
  }
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

  console.log(`image resolution — ${files.length} images`);
  console.log(`T4 (Intelligent Fallback) configured: ${fallbackConfigured()}\n`);

  let correct = 0;
  let ocrAlone = 0;
  let t4Used = 0;
  const latencies: number[] = [];
  const states: Record<string, number> = {};

  for (const fn of files) {
    const bytes = readFileSync(join(dir, fn));
    const exp = expected.get(fn);
    const t0 = Date.now();
    const res = await resolveCapture("image", "", null, {
      image: { bytes: Buffer.from(bytes), contentType: ctype(fn) },
    });
    const ms = Date.now() - t0;
    latencies.push(ms);
    states[res.state] = (states[res.state] ?? 0) + 1;
    if (res.llmUsed) t4Used++;
    if (res.tierUsed === "T3" && !res.llmUsed) ocrAlone++;

    const got = res.match ? `${res.match.title} (${res.match.year})` : "—";
    const ok = !!res.match && !!exp && norm(res.match.title) === norm(exp);
    if (ok) correct++;
    const ocrSnip = (res.ocr?.text ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 48);

    console.log(
      `${ok ? "PASS" : "FAIL"}  ${fn}  exp="${exp ?? "?"}"\n` +
        `      ocr(${res.ocr?.meanConfidence?.toFixed(0) ?? "-"}%): "${ocrSnip}"\n` +
        `      -> ${got}  state=${res.state} tier=${res.tierUsed ?? "-"} llm=${res.llmUsed} ${ms}ms`
    );
  }

  const sorted = [...latencies].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const total = files.length;
  console.log(`\n=== SUMMARY (${total} images) ===`);
  console.log(`correct top candidate: ${correct}/${total}  (bar: >= 7/10)`);
  console.log(`states: ${JSON.stringify(states)}`);
  console.log(`OCR-alone (T3, no LLM): ${ocrAlone}/${total}`);
  console.log(`T4 vision used: ${t4Used}/${total}  (configured: ${fallbackConfigured()})`);
  console.log(
    `latency ms: min ${sorted[0]}, median ${median}, max ${sorted[sorted.length - 1]} (first includes OCR worker init)`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
