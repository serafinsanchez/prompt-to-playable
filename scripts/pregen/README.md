# Pregen — gallery generation + optimization (TASK-06a)

Runs the curated prompt list (`prompts.ts`) through the shared six-stage
`lib/meshy/` pipeline state machine, downloads every GLB the moment its task
succeeds (Meshy's signed URLs die in 3 days), optimizes them with the
programmatic @gltf-transform NodeIO API, and writes `public/gallery/<slug>/`
plus `manifest.json` with real receipts. This script is also the project's
published example of driving the Meshy pipeline from Node — read
`runner.ts` first.

## How to run

```bash
# rebuild the gallery from spike-output/ — no network, no credits.
# This is how the committed knight entry was produced.
npm run pregen -- --offline

# zero-credit smoke against Meshy test mode (stops at rig: the dummy
# mesh fails pose estimation — spike README)
npm run pregen -- --test

# LIVE: ~55 credits per character. TASK-06b owns spending these.
MESHY_API_KEY=msy_... npm run pregen
```

Live runs are resumable per character: every pipeline snapshot is persisted
to `.pregen/runs/<slug>.json` (gitignored, versioned via `lib/meshy/storage`).
A crashed run restarts polling its stored task ids instead of re-spending
credits, and prompts already present in `manifest.json` are skipped.

## Optimization path chosen: meshopt + texture resize — NO KTX2

ARCHITECTURE §5 resolved "meshopt + texture resize + KTX2" for pregen, with
the note that **the <5s first-frame budget is the gate, not any specific
codec**, and that programmatic KTX2 requires the external `toktx` binary.
Measured on the spike knight (2026-08-03), meshopt alone clears the gate:

| file | raw | optimized | treatment |
|---|---|---|---|
| rig.glb | 8.49 MB | **2.44 MB** | dedup → prune → texture 2048→1024 PNG → meshopt |
| animate-*.glb ×5 | 8.50–8.56 MB each | **~33 KB each** | strip mesh/material/texture, keep named nodes + clip → meshopt |
| full character | ~51 MB | **~2.6 MB** | first playable frame = rig + idle ≈ 2.5 MB |

KTX2 is therefore **not** applied — it would add a native-binary dependency
for headroom we do not need. Revisit if a future character's rig lands over
~4 MB. The two clip insights doing the heavy lifting:

1. Meshy ships the full mesh + 6.5 MB texture in every animation GLB, but the
   app's clip loader (`components/scene/character.tsx`) only reads
   `gltf.animations[0]` — so clips are stripped to animation-only files.
2. `EXT_meshopt_compression` + `KHR_mesh_quantization` decode in drei's
   `useGLTF` out of the box; no loader changes needed.

## Receipts

`manifest.json` carries real numbers only: per-stage `consumed_credits` as
reported by each task, and active generation seconds (linear stages + the
longest of the five parallel animate tasks; queue waits excluded). The
committed knight entry's receipts come from the day-0 spike's live run
(`scripts/spike/README.md`, balance 185 → 130): 55 credits, 431s active,
29,015 tris. Offline mode refuses to run without `spike-output/run.json` —
receipts are never invented.

## Files

- `index.ts` — CLI: mode selection, wiring, per-character loop
- `runner.ts` — drives one character through the `lib/meshy/` state machine
- `optimize.ts` — the NodeIO pass (rig vs clip treatments, codec decision)
- `manifest.ts` — `GalleryEntry` shape, validator, receipts, file writer
- `offline.ts` — rebuilds the knight from `spike-output/` (zero network)
- `prompts.ts` — curated biped prompts (spike guidance baked in)
