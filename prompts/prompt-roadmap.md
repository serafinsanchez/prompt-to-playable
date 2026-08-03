# Prompt: draft ROADMAP.md from PRD.md

## Preflight (do this first, fail loud if anything is off)

1. Verify `docs/PRD.md` exists and is non-empty.
2. Verify it does **not** still contain `{{PLACEHOLDER}}` markers or boilerplate template text.
3. If either check fails, STOP and tell the user to fill in the PRD first. Do not proceed against an unfilled or missing doc.

---

Read `docs/PRD.md`. Draft `docs/ROADMAP.md` with the following structure:

## Constraints

- **2–4 phases.** Typical names: `P0 Setup`, `P1 Core`, `P2 Polish`, `P3 Stretch`. Adapt to the project.
- Each phase must be **shippable on its own** — partial value, not partial implementation.
- **Order phases by dependency**, not by excitement. Setup before features. Auth before authorized features. Read before write.
- Pull explicit **non-goals** from the PRD into a final "Out of scope for V1" section. If the PRD doesn't have non-goals, ask the user before drafting.

## Per-phase template

```markdown
## P{n}: {Phase theme — one short sentence}

**Acceptance criteria:**
- [ ] {testable outcome 1}
- [ ] {testable outcome 2}
- [ ] {testable outcome 3}

**Depends on:** P{n-1} complete (or "none" for P0)

**Out of scope for this phase:** {what people will ask for that doesn't ship here}
```

## What NOT to put in the roadmap

- Implementation details (file names, function names, library choices) — that's the backlog's job.
- Specific tasks — those live in `docs/backlog.md`.
- Estimates / dates — unless the PRD explicitly requires them.

## Final section

End the file with:

```markdown
## Out of scope for V1

- {item from PRD non-goals}
- {item from PRD non-goals}
```

Pull these verbatim from the PRD's non-goals section. This is the single most important part of the roadmap.
