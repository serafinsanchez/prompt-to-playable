# TASK-06b: Live gallery generation run — 8+ characters

**kind:** backend

## TASK

Run the pregen script live for the curated prompt list until `public/gallery/` holds 8+ optimized characters with real receipts, within the credit budget.

## DEPENDENCIES

- P1 #3.1
- **External gate:** credit top-up. Balance after the spike is ~130; 8–12 characters need 440–660 credits plus headroom. The request email is drafted in `scripts/spike/README.md` ("Credit budget vs P1 gallery plan") — kickoff of this spec is blocked until credits land or the user authorizes a smaller gallery.

## FILES TOUCHED

- `public/gallery/` (8+ character directories + regenerated `manifest.json`)
- `scripts/pregen/` (prompt list finalization; incidental fixes surfaced by the live run)

## CONTEXT

- Cost per character is **55 credits** (spike-validated; `docs/ARCHITECTURE.md` §4). Track balance via `client.getBalance()` before/after each character; stop before overdraft.
- Rig-success bet (`docs/ARCHITECTURE.md` §5): if first-try rig success drops below ~70% across the run, that's the trigger to tighten prompt guidance — log it in the Trade-off log.
- Queue reality (spike README run 2): remesh can sit `PENDING` behind ~500 tasks for hours at peak. The runner's resumability (TASK-06a req 1) is what makes this survivable — plan for the run to span sessions.
- Prompt curation rules: bipeds, standing, arms at sides/visible; no capes/skirts/loose geometry (emote stretch); character variety is a product goal — the gallery shows "the range of what Meshy makes" (US-02).
- Per-character QA before committing: all 5 clips play (spot-check via `/spike`-style binding check or `scripts/spike/check-binding.mts` pattern); run clip (0.77s loop) doesn't strobe; textures survived optimization.

## REQUIREMENTS

1. 8+ characters generated, optimized, committed under `public/gallery/` with manifest receipts from real run data.
2. Per-character binding QA performed and noted (a line per character in the pregen output or a QA log next to the manifest).
3. Credit ledger: record balance before/after the run; if any character needed retries, the retry cost is visible in the receipts or QA log.
4. Failures follow the spike pattern: failed tasks auto-refund; a character abandoned after 2 failed attempts is dropped and logged, not fought.

## CONSTRAINTS

- Do NOT start without confirming the credit balance covers the planned run + ~100 credit headroom; if it doesn't, stop and surface to the user (smaller gallery is a user decision, not an agent one).
- Do NOT hand-edit `manifest.json` — receipts come from the script.
- Do NOT modify `lib/meshy/` or `app/`.
- do NOT install new packages.

## ACCEPTANCE CRITERIA

- [ ] `public/gallery/manifest.json` lists 8+ entries; every GLB committed and loading
- [ ] Each entry's receipts (prompt, per-stage credits, total time, poly count) populated from real run data
- [ ] `npm run test` still passes (manifest schema test from TASK-06a validates the full set)
- [ ] Total first-frame payload for the default character stays inside the <5s broadband budget (checked with throttling in devtools; the formal pass is P2 TASK-07)

## DONE DEFINITION

Mark P1 #3.2 `[x]` in `docs/backlog/phase-1-the-demo.md`.
