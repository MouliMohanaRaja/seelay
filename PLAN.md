# PLAN — Recommendation Inbox V1

## Handoff block (paste this first in any fresh session)

This project is a **recommendation inbox**: capture trusted human recommendations
(movies & TV first) from anywhere, resolve them automatically into structured entities
with provenance, and show them in one trusted list. The founder is in **vision mode** —
dogfooding refines the product, it does not judge whether it should exist. The chosen
architecture is **engine-first**: a Next.js/Supabase/TMDB engine whose extraction
waterfall is deterministic-first (URL patterns → metadata → text parse → free OCR) with
a logged LLM fallback as the last tier, two narrow API contracts, and thin swappable
shells on top; the first-shell decision (bot vs. native app) is deliberately deferred
to gate 2.4 below. Budget constraint: student/indie — free tiers and open source
first, paid AI demoted to fallback and measured. Read [PRD.md](PRD.md) for scope
and the trust contract, [ARCHITECTURE.md](ARCHITECTURE.md) for contracts and stack,
[ASSUMPTIONS.md](ASSUMPTIONS.md) for what dogfooding must attack. **Status: STAGE 1
COMPLETE — walking skeleton done end-to-end: capture API, deterministic waterfall
(T0–T2, 100% LLM-free), receipt with the full backend-driven state machine, and
quick-add all built and verified locally. Stage-1 boundary review recorded in
ASSUMPTIONS.md (engine assumptions supported; all behavioral assumptions still
untested by construction — need real dogfooding). Only open Stage-1 item: the 1.1
Vercel deploy + phone verify (founder step). Step 2.1 done. Step 2.2
DONE — **accuracy gate MET, R1 cleared**: T4 configured (Gemini, gemini-3.6-flash) and
the same-dataset A/B on 12 real founder screenshots went **T3-only 1/12 → T3+T4 9/12**
(bar ≥7/10, budget corollary applied — extraction was the gap, vision closed it; TMDB
had 100% of the titles). Residual failures are structural (multi-title collage,
Tamil-script, title-buried-in-comments). Next: 2.3 — full hint loop on images (mostly
built; verify from a phone), then gate 2.4 (first-shell decision). Also still open:
1.1 Vercel deploy + phone verify.** Update this block as stages complete.

## Decision log

| Decision | Reason | Date |
|---|---|---|
| Vision mode, not validation mode | Founder has lived the problem for years; commitment is to the mission, evidence steers the how | 2026-07-16 |
| Capture is V1's magical moment | If the inbox leaks, nothing downstream matters | 2026-07-16 |
| Engine-first; shells are experiments | The magic (resolution + provenance) is shell-independent; defers the costliest decision to a better-informed gate | 2026-07-16 |
| Personal audit deferred to Stage 4 | Founder chose speed of building over pre-validation; AUDIT.md pre-registered so it can't be rationalized later | 2026-07-16 |
| Movies & TV first vertical | Clearest decision moment; best entity data (TMDB) | 2026-07-16 |
| Stack: Next.js + Vercel + Supabase + TMDB + pluggable LLM fallback | One deployable, no ops, types shared with future shells | 2026-07-16 |
| Trust contract Laws 1–4 (see PRD) | Failure behavior is the brand for a trust product | 2026-07-16 |
| Deterministic-first extraction waterfall (T0–T3 free, T4 = logged LLM fallback); resolver behind a one-implementation interface | Student/indie budget constraint; enforced by ordering + the LLM-free-rate metric, not prohibition — zero-AI absolutism rejected so budget theater can't fail the capture magic | 2026-07-16 |
| T4 is a vendor-neutral **Intelligent Fallback**: one narrow interface, provider chosen by env config (free-tier/local preferred during MVP) | Architecture describes the capability, not the vendor; portability is guaranteed by rerunning the versioned test set after a swap, not by the abstraction itself | 2026-07-16 |

## Stage 1 — Walking skeleton (deployed, end-to-end)

**Visible endpoint:** on a phone browser, type "dark netflix — from priya" into a
deployed page; *Dark (2017)* appears in the list with poster and "from Priya."

- **1.1 Scaffold and deploy.**
  Goal: empty Next.js app live on a public Vercel URL, Supabase project connected.
  Where: repo root (new Next.js app), `.env.local`, Vercel + Supabase dashboards.
  Verify: public URL loads a placeholder page from a phone; `captures`/`items` tables
  visible in Supabase.
  Fence: no auth, no styling, no domain purchase.

- **1.2 Capture API (Law 1 + Law 2).**
  Goal: `POST /api/captures` stores a raw capture and returns < 500 ms, no processing.
  Where: `app/api/captures/route.ts`, DB schema per ARCHITECTURE.md.
  Verify: `curl` a text payload → row appears in `captures`; response time logged.
  Fence: no resolution logic in this step; images not yet accepted.
  **Verified 2026-07-18:** text + URL captures return 201 with `raw` items created;
  warm latency 186–457 ms (item insert deferred via `after()` per Law 2; direct
  Supabase RTT ≈ 375 ms is the floor). Image payloads correctly fenced to 400.
  Immutability trigger blocks UPDATE/DELETE on `captures` even for the service role.
  Note: schema needed migration 0002 (missing service_role grants on
  SQL-editor-created tables).

- **1.3 Text/URL resolution pipeline (waterfall T0–T2 + T4).**
  Goal: async pipeline resolves text and URL captures into tiered `items` (Law 3) —
  URL patterns (T0) and page metadata (T1) and text parsing (T2) first, TMDB fuzzy
  match via the `EntityResolver` interface, LLM fallback (T4) only on deterministic
  failure, every T4 call logged.
  Where: `lib/resolve/` (normalizer, extractor tiers, resolver interface + TMDB
  implementation, scorer), a versioned prompt file, `test/resolution-set.json`.
  Verify: scripted run over a 15-input test set — plain titles, "dark netflix from
  priya"-style quick-adds, YouTube/IMDb URLs, and ≥ 4 Hindi/regional titles — ≥ 12/15
  correct top match, AND the LLM-free rate reported (expect ~100% of URL inputs to
  resolve without T4). Record both numbers in this file.
  Fence: no image handling (that's Stage 2); no resolver registry — one interface, one
  implementation; no threshold gold-plating — record accuracy, move on.
  **Verified 2026-07-18 (tier-by-tier, test-first):** T0 alone 3/15 → +T1 4/15 →
  +T2 **15/15** — gate (≥12/15) met. **LLM-free rate: 100% (0 T4 calls); T4 not
  implemented** — deferred until real dogfooding captures produce failures the set
  doesn't contain. All 6 regional titles resolved (R6 sensor green). States: 10
  resolved / 5 needs_confirm — confirms are genuine ambiguity (close runner-ups),
  per Law 3. End-to-end verified through the API: "kantara — from divya" →
  raw → resolved Kantara (2022) who=divya tier=T2; IMDb URL → Dark (2017) tier=T0.
  Field note: transient ECONNRESET to TMDB from local ISP — resolver retries 3×
  with backoff; on final failure items stay raw (Law 1), not lost.

- **1.4 The receipt page.**
  Goal: chronological list showing every item in its state (resolved / needs_confirm /
  needs_hint / raw), provenance visible, one-tap confirm and one-word hint working.
  Where: `app/page.tsx`, `app/api/items/`.
  Verify: capture three inputs of different confidence; all three visible in correct
  states; confirm and hint flows complete from a phone.
  Fence: reverse-chronological only — no filters, no search, no availability, no design
  polish beyond legibility.
  **Verified 2026-07-18 (mobile viewport 375px, light + dark, desktop sanity):** all
  states rendered correctly — resolved (Dark 98%, Kantara 80% with "Matched · N%"),
  needs_confirm (Inception + "Is this the one?"), stalled raw (honest fallback: raw
  > 90s stops saying "Identifying…" and offers the hint field). Confirm flow: UI tap
  → `confirmed` in DB. Hint flow: "that german time travel show" + hint "dark" →
  resolved Dark (2017) via the hint-alone fallback. Original capture text visible on
  every row (Law 1); provenance line under every title. Verify-from-real-phone
  remains a founder step (network URL); viewport-level verification done.
  **Refined 2026-07-18 (backend-driven state machine):** replaced the fixed 90s UI
  stall guess with real server-written states (migration 0003 adds `resolving`,
  `retrying`). Verified end-to-end: happy path stepped raw → resolving → retrying →
  needs_confirm (The Matrix) live; forced-failure path (bad TMDB key) stepped
  raw → resolving → retrying → needs_hint with metadata.resolution_failed +
  "TMDB 401"; UI showed the distinct "couldn't reach the identification service"
  copy; hint retry from the failed state recovered it to resolved (Interstellar)
  and cleared the flag. DB check constraint still rejects unknown states (400).
  Known cruft: a few pre-state-machine `raw` orphan rows from earlier tests show
  "Caught. Starting to identify…" and poll until the 60-tick guard; harmless test
  data, not a code path real captures hit.

- **1.5 Quick-add on the receipt (zero-artifact path).**
  Goal: a text box at the top of the receipt: type → captured → resolves in background.
  Where: `app/page.tsx`.
  Verify: the Stage-1 visible endpoint, exactly as written above.
  Fence: no voice feature (OS dictation covers it); no autocomplete.
  **Verified 2026-07-18 (mobile 375px + desktop):** typed "dark netflix - from priya"
  into the quick-add box → 201 → background-resolved to Dark (2017) Series, who=priya,
  Matched 80%, at the top of the list with poster. Input clears on success; count
  16→17; no console errors. The whole string goes as one text payload — T2 parses the
  who-hint (hyphen/en-dash/em-dash all accepted). Fence honoured: `autoComplete="off"`,
  no voice UI (OS dictation covers it). Input font-size 16px to prevent iOS zoom.

**Stage boundary ritual:** re-read ASSUMPTIONS.md; note anything already creaking
(A10 gets its first real data here from step 1.3's score).

## Stage 2 — Screenshot magic

**Visible endpoint:** share a real Instagram-story screenshot from the founder's camera
roll to the app; it appears in the receipt correctly resolved.

- **2.1 Image ingestion.**
  Goal: `POST /api/captures` accepts images; stored in Supabase storage; raw item
  visible immediately (Law 1).
  Where: `app/api/captures/route.ts`, storage bucket, receipt raw-state rendering.
  Verify: upload a screenshot via the web page → raw item with thumbnail in receipt.
  Fence: no camera-roll scanning; no gallery UI.
  **Verified 2026-07-20:** multipart upload → 201, image stored in the private
  `captures` bucket (auto-created on first use — no dashboard step), proxy
  `GET /api/captures/[id]/image` streams the exact bytes back (27161 B, image/png).
  Item settles at `needs_hint` (2.1 has no image extraction — honest, not
  resolution_failed) with the screenshot thumbnail in the poster slot and provenance
  "Uploaded · date" (not the misleading "Typed"). Non-image types rejected (400).
  Image→hint→resolved verified end-to-end (screenshot + hint "dark" → Dark 2017).
  Build + lint clean; no console errors. UI upload control: "Add a screenshot
  instead" (hidden file input, `accept="image/*"`).
  **Carry to 2.2 (Law 1 on resolved images):** once an image resolves it shows the
  TMDB poster and the screenshot thumbnail is no longer *visible* in the row (still
  *accessible* via the immutable proxy URL). In 2.1 images rest at needs_hint so the
  thumbnail always shows; when 2.2 makes images auto-resolve, add a "view original"
  affordance so Law 1's "visible" clause holds for resolved screenshots too.

- **2.2 Image extraction (OCR-first, LLM-vision fallback).**
  Goal: screenshots flow through the waterfall — tesseract.js OCR (T3) → text parse
  (T2) first; LLM vision (T4) only when OCR yields no confident candidate; TMDB
  matches; scorer weighs the producing tier.
  Where: `lib/resolve/` extractor tiers, prompt file, extend `test/resolution-set.json`.
  Verify: 10 REAL screenshots from the founder's camera roll (not synthetic) — ≥ 7/10
  correct top candidate overall, with per-tier stats recorded (how many resolved by
  OCR alone vs. needed T4). **This is tripwire R1's sensor.** Record both numbers here.
  Fence: no image preprocessing pipeline (deskew/crop models) unless the score demands
  it; T4 stays the cheapest capable model — no model shopping.
  **Implemented + verified 2026-07-21 (design in [docs/2.2-image-extraction.md]):**
  T3 (tesseract.js OCR → T2 parse → TMDB) and T4 (vendor-neutral vision fallback,
  env-configured) built and wired into `resolveCapture`; state machine unchanged.
  End-to-end through the API confirmed: Barbie poster upload → OCR → `needs_confirm`
  "Barbie" (tier T3); Dark Knight poster → garbage OCR → `needs_hint` (honest escalation).
  **Accuracy gate NOT yet met — R1 is live.** The true sensor (founder's 10 real
  camera-roll screenshots) wasn't available, so the harness ran on a *harder proxy*:
  10 real movie POSTERS (`npm run test:images -- <dir>`), T4 unconfigured (no LLM key
  in this env). Result: **4/10** correct — T3 nailed the clean-text posters (Barbie 90%
  OCR, 3 Idiots → resolved, Inception, Oppenheimer) and produced garbage on stylized
  poster ART (Dark Knight/Interstellar/RRR/Kantara → needs_hint), which is exactly the
  case T4 exists for. Per-tier: T3-alone 6/10 produced a candidate (4 correct), 0 T4
  (unconfigured). Latency: first image ~7.2s (OCR worker init + traineddata), then
  250 ms–1.4 s. **Two gates remain before Stage-2 accuracy is validated:** (1) configure
  T4 (`FALLBACK_LLM_*`) so it can rescue OCR-fails cases — the R1 budget corollary says
  OCR-alone-fails-but-LLM-passes is a PASS; (2) re-run on real *screenshots* (UI text,
  which OCR reads far better than stylized posters — see Barbie 90%), not posters.
  **GATE MET 2026-07-22 (T4 = Gemini, A/B on 12 real founder screenshots):** T4
  configured with provider `gemini`, model **gemini-3.6-flash** (2.5-flash is sunset
  for new users; 3.6-flash is the current stable flash — verified against the live
  models API). Same-dataset A/B via the harness's `--max-tier` flag: **T3-only 1/12 →
  T3+T4 9/12** — the ≥7/10 bar cleared via the budget corollary. T4 rescued 8 images
  (Sita Ramam ×2, Top Gun: Maverick, Hi Nanna, The Sheep Detectives, From,
  8 Vasantalu, I Want to Eat Your Pancreas) — every RC1/RC2 extraction failure from
  the engineering analysis (docs/2.2 diagnostics). Residual 3: 39117 multi-title
  collage (needs_hint — correct behaviour, a product question), 39115 Tamil-script
  (Gemini guessed wrong; Law 3 held it at needs_confirm), 39116 Arulvaan-in-comments
  (vision failed — the one miss vs prediction). Latency: T4 adds ~5–10 s per rescued
  image (avg 9.5 s vs 2.9 s T3-only) — fine, resolution is async (Law 2). The
  deterministic cleanup was confirmed marginal: T3-only stayed 1/12.

- **2.3 Full hint loop on images.**
  Goal: a failed image resolution recovers gracefully — "needs a hint" → user types one
  word → re-resolves.
  Where: `lib/resolve/`, receipt page.
  Verify: deliberately feed an ambiguous screenshot; recover it to `confirmed` with one
  hint, from a phone.
  Fence: one hint round only; no chat thread UI.

- **2.4 GATE — first-shell decision.**
  Goal: decide bot vs. native app vs. PWA share-target, with reasons, recorded in the
  decision log above.
  Criteria (written now, before the data): (a) step 2.2 accuracy — magic proven or not
  (tests A3); (b) two weeks of founder reality: where did recs actually arrive and
  which gesture was reached for (tests A4); (c) build-cost honesty for each shell;
  (d) the vision-mode preference declared 2026-07-16 — the founder wants the product
  they believe in, and that preference legitimately carries weight here.
  Verify: decision log row exists with reasons; Stage 3 branch chosen.
  Fence: no shell code before the gate. **This decision is made once — no re-litigating
  at Stage 3.**

## Stage 3 — The real capture surface (one branch only)

**Visible endpoint:** standing in another app (Instagram/WhatsApp) on the founder's
phone, a recommendation is captured in ≤ 3 seconds of attention and lands resolved in
the receipt.

- **Branch A — Bot shell:** webhook adapter translating Telegram (fallback per R2:
  start Telegram, WhatsApp Business API second) messages/forwards/images into Ingestion
  API calls; provenance asked conversationally ("who's this from?"); receipt link
  pinned in chat.
- **Branch B — Native app shell:** minimal app whose share extension posts to the
  Ingestion API; receipt as a webview or simple native list; TestFlight/APK on the
  founder's phone.
- **Branch C — PWA share-target:** installable web app registering as a share target
  (Android-strong, iOS-weak — only viable if the founder is on Android).

Steps for the chosen branch get written at the gate, in this file, with goal / where /
verify / fence — sized one session each.
Fence for the whole stage: the unchosen branches stay unbuilt; the engine does not
change to accommodate the shell (that's what the contracts are for).

## Stage 4 — Instrumented dogfooding

**Visible endpoint:** a numbers page (or weekly note in this repo) showing capture
count, resolution accuracy, provenance completeness, and week-over-week trend.

- **4.1** Metrics: counters per capture source/state, plus the **LLM-free resolution
  rate** (share of captures resolved by T0–T3 alone); weekly rollup visible.
  Verify: numbers page shows real data after one week of use, LLM-free rate included.
  Fence: no analytics platform; a SQL view and a page is plenty.
- **4.2** Run AUDIT.md forward log for 7 days alongside real usage (the deferred
  audit, now with a product in hand). Verify: log complete; capture-coverage number
  computed (recs captured ÷ recs received).
  Fence: the pre-registered decision rules in AUDIT.md apply as written.
- **4.3** Assumptions review: update every A1–A10 status with evidence.
  Verify: ASSUMPTIONS.md has no row still reading UNTESTED without a dated note.

## Stage 5 — n = 6

**Visible endpoint:** five people who are not the founder have each captured at least
one real recommendation, unprompted after day one.

- Onboard 3–5 friends onto the chosen shell; watch first capture live (the onboarding
  friction IS data); collect week-one behavior; re-run assumptions review with external
  evidence; write the V2 decision memo (decision support vs. resurfacing vs. second
  vertical — chosen by which assumption survived strongest).

## Risks and tripwires

- **R1 — Resolution accuracy (A10).** Sensor: scores at 1.3 and 2.2. If 2.2 < 7/10:
  stop, invest in the pipeline (tier tuning, prompt iteration, preprocessing, secondary
  data source) before any shell work — a shell on a weak engine burns the trust
  contract. Budget corollary: if OCR-only fails the bar but LLM-fallback passes it,
  that is a PASS with a pennies bill — do not let budget absolutism fail Stage 2's
  magic (A3) for theater; revise the LLM-free-rate expectation (A11) instead.
- **R2 — WhatsApp platform friction (if Branch A).** Sensor: first webhook setup
  session. Fallback: dogfood on Telegram; treat WhatsApp Business API as a Stage-5
  problem.
- **R3 — Scope creep toward decision support.** Sensor: any step that adds filtering,
  sorting, or availability to the receipt. Rule: rejected on sight until the Stage-5
  memo; the fences exist for exactly this.
- **R4 — Screenshots keep dying in the camera roll (A9).** Sensor: Stage-4 forward log
  shows screenshots received but never shared in. Fallback: revisit camera-roll
  integration (the deferred auto-scan), eyes open about privacy weight.
- **R5 — Vision-mode blindness.** Sensor: founder's own captures/week down > 50% by
  week 3 of Stage 4. Rule: mandatory pause — no Stage 5 until the AUDIT.md rules have
  been applied to the data and the result written into ASSUMPTIONS.md. Vision mode
  changes what failure means; it doesn't excuse not looking at it.
- **R6 — TMDB regional coverage.** Sensor: Hindi/regional titles in the 1.3 test set.
  Fallback: secondary matching source; worst case, graceful `needs_hint` behavior is
  the feature.

## Update discipline

This file is the single source of truth. At every stage boundary: tick the stage,
update the handoff block's status line, record scores where a step demands it, and run
the assumptions review. Revising the plan is expected; revising it silently is the
only failure.
