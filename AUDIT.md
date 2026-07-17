# Recommendation Loss Audit

**Purpose:** Validate (or kill) the three hypothesized loss patterns before defining the MVP:
1. Captured into a silo that never resurfaces
2. Zero-artifact (spoken) recommendations that are never captured
3. Provenance decay — the item survives but the who/why is lost

**Scope:** Human recommendations only — a specific person pointed you at a specific thing
(friend, colleague, family, a creator speaking directly to camera). Pure algorithmic feed
suggestions don't count, but note them separately if they blur.

---

## Part 1 — Retrospective sweep (~30 min, do today)

Go **artifact-first, not memory-first**. Open each of these and pull every human
recommendation from the last ~90 days:

- Camera roll (screenshots)
- Instagram saved posts / DMs
- YouTube Watch Later
- WhatsApp starred messages + skim recent chats
- Browser bookmarks and open tabs
- Notes app

Target 15–25 items. For the "Found in <30s?" column, **actually attempt the retrieval** —
imagine it's Friday night and you want this thing; time yourself. Don't estimate.

| # | What | Type (movie/book/restaurant/product/other) | How it arrived | Where it lives now | Found in <30s? | Remember who + why? | Ever acted on it? |
|---|------|-------------------------------------------|----------------|--------------------|----------------|---------------------|-------------------|
| 1 |      |                                           |                |                    |                |                     |                   |
| 2 |      |                                           |                |                    |                |                     |                   |

---

## Part 2 — Forward log (7 days, runs in parallel)

The retrospective **cannot see** spoken recommendations that died — they left no artifact.
This log is the only instrument that measures them. Log every recommendation within a
minute of receiving it, in whatever is fastest (notes app is fine):

| Date | What | Type | Channel (spoken / chat / feed / share / screenshot / other) | Artifact existed? | What you did in the moment |
|------|------|------|--------------------------------------------------------------|-------------------|----------------------------|
|      |      |      |                                                              |                   |                            |

---

## Pre-registered decision rules

Written **before** data collection, so the data can't be rationalized afterward:

- **Spoken/zero-artifact < 10% of forward-log volume** → cut the quick-add field; V1 shrinks to five pieces.
- **Provenance remembered for > 70% of retrospective items** → demote the "from whom" field to optional nicety.
- **> 50% of items are findable but were never acted on** → loss is NOT the bottleneck; the capture-first premise itself is wrong and we revisit direction (the problem would be decision/motivation, not preservation).
- **Movies/TV < 30% of items** → question the movies-first vertical choice.
- **Desktop/browser sources > 30%** → browser capture enters V1 scope.
- **Screenshots > 40% of captures** → image ingestion becomes the primary path; camera-roll integration tripwire activates.

## Known biases (accepted, not ignored)

- **Survivorship:** Part 1 only sees what left a trace. Part 2 exists to correct this.
- **n = 1, and the founder is atypical.** Acceptable for scoping V1 dogfooding. Before
  committing build time beyond a walking skeleton, 3–5 friends should run Part 2 for a
  week to turn anecdote into signal.

## Status

- [ ] Part 1 complete (date: ___)
- [ ] Part 2 started (date: ___)
- [ ] Part 2 complete (date: ___)
- [ ] Findings reviewed against decision rules
