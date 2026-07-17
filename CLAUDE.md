# CLAUDE.md — standing orders for Seelay

## What this is

A recommendation inbox (movies & TV first): capture trusted human recommendations from
anywhere, resolve them asynchronously into TMDB entities with provenance, show them in
one chronological receipt list. Founder is in vision mode; dogfooding refines, it does
not judge existence.

## Authoritative documents — read before acting, never regenerate

- **PLAN.md** — the single source of truth. Find the current step there; do that step,
  respect its fence, run its verify. Update PLAN.md (status line, scores, decision log)
  when a step completes. Revising the plan is fine; revising it silently is not.
- **PRD.md** — scope and the trust contract (Laws 1–4). Law 1: no capture is ever
  lost. Law 2: capture never blocks. Law 3: never silently guess. Law 4: provenance is
  never fabricated.
- **ARCHITECTURE.md** — engine-first. Pipeline stages are pure-function modules in
  `lib/resolve/`, not services. Extraction is a waterfall T0–T4; T4 (LLM) is
  vendor-neutral, invoked last, always logged.
- **ASSUMPTIONS.md** — update statuses with evidence at stage boundaries.

## Stack

Next.js (TypeScript, app router) on Vercel · Supabase (Postgres + storage) · TMDB API ·
tesseract.js OCR · pluggable LLM fallback (env-configured). Student/indie budget: free
tiers first; every LLM call logged and counted.

## Commands

- `npm run dev` — local server at http://localhost:3000
- `npm run build` — production build (must pass before any push)
- `npm run lint` — ESLint

## Where things live (as they get built)

- `app/` — pages and API routes (`app/api/captures/`, `app/api/items/`)
- `lib/resolve/` — normalizer, extractor tiers, resolver interface, scorer
- `test/resolution-set.json` — versioned resolution test set (accuracy gates live here)

## Don'ts

- Never commit `.env.local` or any real key — placeholders go in `.env.example` only.
- Never regenerate or bulk-rewrite PRD/ARCHITECTURE/PLAN/ASSUMPTIONS — surgical edits
  with the user's direction only.
- No features beyond the current PLAN.md step — the fences exist to stop scope creep
  (no decision-support UI, no tags/folders, no social, no second vertical).
- No new services, queues, or per-stage infrastructure — modules, not plumbing.
- Don't add a second EntityResolver implementation or an LLM adapter framework.

## Before saying "done"

1. `npm run build` passes.
2. The step's own verify line in PLAN.md has been executed and its result recorded.
3. The change is visible working in the running app (click it, don't infer it).
4. Committed with a message referencing the PLAN.md step (e.g. "1.2: capture API").
