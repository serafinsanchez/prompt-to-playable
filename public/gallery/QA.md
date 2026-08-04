# Gallery QA log — TASK-06b live run (2026-08-03/04 UTC)

Live generation via `npm run pregen` against the real Meshy API. All receipts
in `manifest.json` come from the script (per-task `consumed_credits` + clock
timestamps) — nothing hand-edited.

## Credit ledger

| checkpoint | balance |
|---|---|
| before run (verified live via `client.getBalance()`) | **8000** |
| after run | **7615** |
| **total spent** | **385 = 7 characters × 55** |

- Spike gate satisfied: planned 7 × 55 ≈ 385 + ~100 headroom ≪ 8000.
- **Zero retry credit cost.** The one mid-run failure (below) was a local
  network blip, not a Meshy task failure — the resumed run re-attached to the
  already-paid task ids (snapshots in `.pregen/runs/`), so no stage was
  re-purchased. No Meshy task failed across the entire run; no character was
  dropped. Rig first-try success: **8/8** (incl. the spike knight) — well above
  the ~70% trigger in `docs/ARCHITECTURE.md` §5, so no prompt tightening needed.

## Run incidents

- `2026-08-04T02:01Z` — the pregen process died with `fetch failed` (transient
  local network error while polling shield-maiden's remesh). Restarted; the
  runner resumed shield-maiden from its stored snapshot (preview/refine/remesh
  restored, zero re-spend). Incidental fix landed in `scripts/pregen/index.ts`:
  a per-character 2-attempt retry (resume-based) so one throw no longer kills
  the remaining queue — after 2 failed attempts a character is dropped and
  logged, per the spike failure pattern.
- Queue reality: unlike the spike's ~2h remesh queue, every stage this run
  processed immediately (~7 min/character end-to-end).

## Per-character QA

Binding check: `npx tsx scripts/pregen/check-gallery.mts` (the
`scripts/spike/check-binding.mts` pattern pointed at `public/gallery/`).
"binds 5/5" = each clip GLB holds exactly one animation and every channel
target node exists in that character's rig skeleton (zero missing → all five
clips play on the rig via one AnimationMixer, as proven on `/spike`).
"texture ok" = the optimized rig still carries its baked PBR texture after the
dedup → prune → 1024px resize → meshopt pass.

| character | credits | active s | tris | binding | texture | run clip (strobe) | rig size |
|---|---|---|---|---|---|---|---|
| knight (spike seed) | 55 | 431 | 29015 | binds 5/5, 24 targets/clip | ok (1) | 0.77s loop — visually verified on `/spike` (day-0) | 2.44 MB |
| robot-butler | 55 | 405 | 30908 | binds 5/5, 24 targets/clip | ok (1) | 0.77s loop, full 72-track data — flag for eyeball pass | 2.48 MB |
| goblin-scout | 55 | 434 | 30950 | binds 5/5, 24 targets/clip | ok (1) | same | 2.88 MB |
| astronaut | 55 | 443 | 31005 | binds 5/5, 24 targets/clip | ok (1) | same | 2.64 MB |
| shield-maiden | 55 | 598* | 30893 | binds 5/5, 24 targets/clip | ok (1) | same | 2.80 MB |
| street-samurai | 55 | 423 | 31180 | binds 5/5, 24 targets/clip | ok (1) | same | 2.83 MB |
| clockwork-puppet | 55 | 423 | 30824 | binds 5/5, 24 targets/clip | ok (1) | same | 2.96 MB |
| desert-ranger | 55 | 353 | 31164 | binds 5/5, 24 targets/clip | ok (1) | same | 2.31 MB |

\* shield-maiden's active seconds include dead time from the crashed process
(timestamps span the restart); actual Meshy processing was in line with the
others.

Clip durations are identical across characters (Meshy animation library):
idle 4.03s, walk 4.23s, run 0.77s, jump 1.93s, emote 5.37s.

## Browser sweep

Beyond the structural check, a Playwright sweep against the running app
(real manifest, no stubs) clicked every gallery card and confirmed each rig
GLB decoded and bound in the scene (`window.__ptpCharacterRig` hook from
`tests/gallery.spec.ts`): **8/8 bound, zero page errors**.

## First-frame payload (<5s broadband budget)

First playable frame = rig + idle clip. Worst case is clockwork-puppet at
2.96 MB + 33 KB ≈ **2.99 MB**; default character (knight) is
2.44 MB + 33 KB ≈ **2.47 MB** ≈ 0.7s at 30 Mbps. All eight characters are
inside the budget; the formal throttled pass is P2 TASK-07.

## Left for human review

- Visual strobe eyeball of the 0.77s run loop on the 7 new characters (the
  structural check above proves the clip binds and carries full track data;
  only human eyes can judge the loop aesthetically). Keys/gallery cards on the
  running app make this a ~2-minute pass.
- Cosmetic skinning check during emote (the spike knight's cloak-stretch
  lesson) — prompts were curated to avoid loose geometry, but eyeball it.
