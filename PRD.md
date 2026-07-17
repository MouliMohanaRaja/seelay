# PRD — Recommendation Inbox (V1: Movies & TV)

## Mission

Preserve trusted human recommendations from the moment they're discovered until the
moment they become relevant. V1 makes one moment magical: **capture**.

## Mode (decided 2026-07-16)

**Vision mode.** The founder is building this because the problem is personally real;
dogfooding exists to refine *how* the product works, not to judge *whether* it should
exist. Everything except the core mission is revisable on evidence: interaction models,
capture mechanisms, data model, target user. See [ASSUMPTIONS.md](ASSUMPTIONS.md) for
what dogfooding is expected to attack.

## Constraints (added 2026-07-16)

**Student/indie budget.** The MVP must run on free tiers and open-source components
wherever reasonably possible. Paid AI is not banned — it is demoted: the extraction
pipeline is deterministic-first (URL patterns, metadata, text parsing, free OCR), with
the cheapest capable LLM as a logged last-tier fallback. The constraint is enforced by
ordering and measurement (the "LLM-free resolution rate" metric), not prohibition —
budget absolutism must never be the reason the capture magic fails. The fallback LLM
itself is vendor-neutral: an implementation decision behind one interface, with
free-tier or locally hosted models preferred during the MVP where practical.

## User zero

The founder. Recommendations arrive primarily via WhatsApp, Instagram, and spoken
conversation (assumption A4 — untested). First vertical: movies & TV, chosen for the
clearest decision moment ("what do we watch tonight?") and the best structured data
(TMDB). Universality is the mission, not the V1.

## The problem V1 solves

Three loss patterns (hypothesized, ranked — see A1):

1. **Silo burial** — recs captured into screenshots, Instagram saves, starred messages,
   tabs; scattered across seven graveyards nobody visits at decision time.
2. **Zero-artifact loss** — spoken recommendations with nothing to save; the
   highest-trust recs die within hours.
3. **Provenance decay** — the item survives but *who recommended it and why* is lost;
   an untrusted item is skipped, which equals lost.

Explicitly NOT the problem: discovery (users already receive more good recs than they
consume), organization (folders/tags are the disease, not the cure), decision support
(V2 payoff, not V1).

## V1 scope — the engine plus a receipt

The **engine** is the product; shells (bot, app, web) are experiments on top of it.

1. **Ingestion** — accepts URLs, free text, and images through a shell-agnostic API.
   Capture is instant; all processing is asynchronous.
2. **Quick-add** — a free-text path for zero-artifact recs ("dark netflix — from
   priya"). OS dictation keyboard provides voice for free; we build no voice feature.
3. **Entity resolution** — every capture is resolved in the background to a structured
   movie/TV entity (TMDB), with confidence tiers (see trust contract).
4. **Provenance** — source app and timestamp captured automatically; "from whom" is one
   optional free-text string. Not a contacts integration. A string.
5. **The receipt** — a single chronological list proving the catch: each item resolved,
   with provenance intact and unresolved items visibly queued. It is a receipt, not a
   decision tool — no filters, no sorting, no availability data.
6. **One vertical, founder's phone first.**

## The trust contract (decided 2026-07-16)

The product's premise is trust in the inbox, so failure behavior is the brand:

- **Law 1 — Nothing is ever lost.** The raw capture is stored immutably before any
  processing. Total resolution failure still leaves a visible raw item.
- **Law 2 — Capture never blocks.** The user's gesture completes instantly; resolution
  is async and its outcome is shown later, at the receipt.
- **Law 3 — The engine never silently guesses.** High confidence → auto-resolve (raw
  original retained and inspectable). Medium → top candidate shown with one-tap
  confirm. Low → item flagged "needs a hint" with a one-word fix path.
- **Law 4 — Provenance is never fabricated.** Auto-captured metadata only; the "who"
  comes only from the user.

## Capture promise

- Share/forward path: ≤ 3 seconds of user attention.
- Quick-add: ≤ 10 seconds including typing.
- Screenshot harvest: 0 seconds at the moment (user screenshots as they already do;
  sharing it to the inbox can happen any time later).

## Non-goals for V1 (each challenged out by the loss-pattern rule)

- "Where to watch" / streaming availability — decision support, prevents no loss.
- Ratings, reviews, notes — nothing dies for lack of a rating.
- Tags, folders — manual structure is the failure mode we're replacing.
- Social sending/sharing — growth layer, explicitly sequenced later.
- Auto camera-roll scanning — deferred with tripwire (see PLAN.md risk R4).
- Proactive resurfacing/reminders — V2's first question, after unification is tested.
- Additional verticals — schema designed for extension, nothing built.

## Success measures (refinement metrics, per vision mode)

- **Capture coverage:** share of received recs that land in the inbox (weekly
  self-report during dogfooding; AUDIT.md forward log is the instrument).
- **Resolution accuracy:** ≥ 90% correct auto-resolution on URLs; ≥ 75% on screenshots
  at first, improving with iteration.
- **Provenance completeness:** share of items carrying a "who."
- **Habit pulse:** week-3 captures/week not down more than 50% from week 1. If it is,
  the vision-mode tripwire fires (PLAN.md risk R5).
- **LLM-free resolution rate:** the share of captures resolved by deterministic tiers
  alone (target: a clear majority). This is the budget constraint made measurable.

## Open decisions

- **First shell** (bot vs. native app vs. PWA) — deliberately deferred to the gate at
  the end of PLAN.md Stage 2, with written criteria. Not open for re-debate before then.
