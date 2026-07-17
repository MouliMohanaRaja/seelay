# Assumptions Register

Every foundational belief this product is built on, labeled honestly. Vision mode means
we build without validating these first — this register is the list dogfooding is
expected to attack. Review at every stage boundary (see PLAN.md); update status in
place. An assumption nobody has tried to break by Stage 5 is a red flag, not a comfort.

Statuses: `UNTESTED` → `SUPPORTED` / `CHALLENGED` / `DEAD` (with evidence and date).

---

**A1 — The three loss patterns and their ranking.**
Silo burial > zero-artifact loss > provenance decay, by frequency; zero-artifact
highest impact per item. *Status: UNTESTED (derived from priors, not the founder's
audit — the audit was deferred).* Challenged if: dogfooding shows losses concentrating
elsewhere. Test vehicle: AUDIT.md forward log run during Stage 4 dogfooding.

**A2 — Capture is the V1 bottleneck, not decision or motivation.**
People receive more good recs than they consume; the loss happens before the decision
moment. *Status: UNTESTED.* Challenged if: captured items pile up findable-but-unacted-on
(>50%), which would mean motivation/decision is the real bottleneck and capture-first
was the wrong wedge. This is the assumption whose death would hurt most.

**A3 — The magic lives in the engine, not the shell.**
"Blurry screenshot → Past Lives (2023), from Priya" is the magical moment, and it is
form-factor independent. *Status: UNTESTED.* Challenged if: an accurate engine in a
humble shell still feels dead — that would mean interaction fidelity matters more than
argued, and strengthens the native-app case. Test vehicle: Stage 2 screenshot demo +
shell gate.

**A4 — The founder's recs arrive mostly via chat, Instagram, and conversation.**
Underpins both the capture-surface priorities and the bot option's appeal.
*Status: UNTESTED (the deferred audit would have measured exactly this).* Test vehicle:
forward log during Stage 4.

**A5 — Movies & TV is the right first vertical.**
Clearest decision moment, best entity data (TMDB). *Status: UNTESTED.* Challenged if:
dogfooding shows most captured recs are restaurants/products/books — meaning the founder
is building the easy vertical, not their real one.

**A6 — Provenance materially changes behavior at decision time.**
"From Priya" makes an item trusted and acted on; without it items get skipped.
*Status: UNTESTED.* Challenged if: provenance fields go unfilled or unread during
dogfooding. Consequence if dead: the product's claimed moat (the provenance graph)
weakens substantially.

**A7 — Unification without proactive resurfacing is enough.**
One trusted place changes decision-time behavior from "check seven graveyards" to
"check one." *Status: UNTESTED.* Challenged if: items are captured faithfully but the
receipt is never opened. Consequence: resurfacing/notifications move from V2 into V1.

**A8 — The founder is a usable proxy for the eventual user.**
n = 1, and user zero is maximally motivated. *Status: ACCEPTED RISK, not an assumption
we can test on ourselves.* Mitigation scheduled: 3–5 friends run the AUDIT.md forward
log and/or the product itself at Stage 5, before build investment beyond the plan.

**A9 — Screenshot harvesting beats reflex replacement.**
Users keep screenshotting as they already do; the product ingests rather than retrains.
*Status: UNTESTED.* Challenged if: screenshots keep dying in the camera roll because
"share it to the inbox later" never happens. Consequence: camera-roll integration
tripwire fires (PLAN.md R4).

**A10 — The extraction waterfall is accurate enough to be trusted.**
Deterministic tiers (URL patterns, metadata, text parse, free OCR) plus an LLM
fallback resolve real captures correctly. The 3-second promise and Law 3 of the trust
contract both depend on it. *Status: UNTESTED.* Measured directly at PLAN.md steps 1.3
and 2.2 with real inputs, including Hindi/regional titles. This is the plan's earliest
tripwire by design.

**A11 — A majority of real captures resolve with zero LLM calls.**
The budget constraint's load-bearing bet: deterministic tiers carry most of the volume.
*Status: UNTESTED.* Sensor: LLM-free rate at PLAN.md 1.3, 2.2, and the Stage-4 numbers
page. Challenged if: screenshots dominate real captures AND OCR underperforms on them,
making the LLM tier the common path. Consequence if dead: revise the budget expectation
honestly (the fallback still costs pennies at this scale) or invest in better free OCR
— never silently weaken the accuracy bar (see R1's budget corollary).

---

## Deliberately deferred

- **The personal audit** (AUDIT.md) — methodology written and pre-registered; execution
  deferred by founder decision (2026-07-16) to run alongside Stage 4 dogfooding instead
  of before the build. The pre-registered decision rules in AUDIT.md still apply when
  it runs.
