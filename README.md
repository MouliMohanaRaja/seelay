# Seelay

A recommendation inbox: capture trusted human recommendations (movies & TV first) from
anywhere — a shared link, a screenshot, a quick note after dinner — resolve them
automatically into structured entities with provenance intact ("Dark (2017), from
Priya"), and find them in one trusted list when the moment comes to choose.

## Run it

```bash
npm install
cp .env.example .env.local   # then fill in real values — never commit them
npm run dev                  # http://localhost:3000
```

## Where things are decided

- [PRD.md](PRD.md) — what V1 is and is not; the trust contract
- [ARCHITECTURE.md](ARCHITECTURE.md) — engine-first design, pipeline, stack
- [PLAN.md](PLAN.md) — staged roadmap; single source of truth for progress
- [ASSUMPTIONS.md](ASSUMPTIONS.md) — the hypotheses dogfooding must attack
- [CLAUDE.md](CLAUDE.md) — standing orders for AI sessions
