import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveCapture } from "../lib/resolve/pipeline";
import type { PayloadType } from "../lib/resolve/types";

// PLAN.md 1.3 verify harness. Run: npm run test:resolution [-- --max-tier=N]
// Gate: >= 12/15 correct top match; LLM-free rate reported alongside.

const root = resolvePath(dirname(fileURLToPath(import.meta.url)), "..");

// Minimal .env.local loader (no dotenv dep); tolerates spaces around "=".
const envPath = resolvePath(root, ".env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}

type Case = {
  id: string;
  class: string;
  capture: { payload_type: PayloadType; payload: string };
  expect: {
    title: string;
    year?: number;
    media_type: "movie" | "tv";
    who?: string;
  };
  expected_tier: string;
};

const arg = process.argv.find((a) => a.startsWith("--max-tier="));
const maxTier = arg ? Number(arg.split("=")[1]) : 99;

const set = JSON.parse(
  readFileSync(resolvePath(root, "test/resolution-set.json"), "utf8")
) as { cases: Case[] };

async function main() {
  let pass = 0;
  let llmCalls = 0;
  const states: Record<string, number> = {};

  console.log(
    `resolution set v1 — max tier: ${maxTier === 99 ? "all" : "T" + maxTier}\n`
  );

  for (const c of set.cases) {
    let res;
    try {
      res = await resolveCapture(c.capture.payload_type, c.capture.payload, null, {
        maxTier,
      });
    } catch (e) {
      console.log(
        `FAIL  ${c.id.padEnd(28)} ERROR: ${e instanceof Error ? e.message : String(e)}`
      );
      states.error = (states.error ?? 0) + 1;
      continue;
    }
    if (res.llmUsed) llmCalls++;
    states[res.state] = (states[res.state] ?? 0) + 1;

  const got = res.match;
  const ok =
    !!got &&
    got.title.toLowerCase() === c.expect.title.toLowerCase() &&
    (c.expect.year === undefined || got.year === c.expect.year) &&
    got.mediaType === c.expect.media_type &&
    (c.expect.who === undefined || res.whoHint === c.expect.who);

    if (ok) pass++;
    const gotStr = got
      ? `${got.title} (${got.year}) ${got.mediaType}${res.whoHint ? ` who=${res.whoHint}` : ""}`
      : "—";
    console.log(
      `${ok ? "PASS" : "FAIL"}  ${c.id.padEnd(28)} tier=${res.tierUsed ?? "--"}  state=${res.state.padEnd(13)} ${gotStr}`
    );
  }

  const total = set.cases.length;
  console.log(`\nresult: ${pass}/${total} correct top match`);
  console.log(`states: ${JSON.stringify(states)}`);
  console.log(
    `LLM-free rate: ${(((total - llmCalls) / total) * 100).toFixed(0)}% (${llmCalls} T4 calls)`
  );
  console.log(`gate (>=12/15): ${pass >= 12 ? "MET" : "not met"}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
