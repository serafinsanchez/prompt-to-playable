# TASK-06a: Pregen script — pipeline runner + GLB optimizer + manifest writer

**kind:** backend

## TASK

Build `scripts/pregen/`: run the shared 6-stage pipeline for a curated prompt list, download GLBs immediately, optimize via gltf-transform, and write `public/gallery/` + `manifest.json` with receipts — verified offline against the spike GLBs, and seeded with the optimized spike knight as gallery entry #1.

## DEPENDENCIES

- P1 #1 (remesh stage — the shared pipeline must run the 6-stage graph)

## FILES TOUCHED

- `scripts/pregen/` (new: runner, optimizer, manifest writer, prompt list)
- `public/gallery/` (knight entry + `manifest.json`)
- `scripts/pregen/__tests__/` or colocated Vitest files
- `package.json` (one `pregen` script entry)

## CONTEXT

- This script is a first-class deliverable, not tooling: "the pregen script doubles as the 'integration code' teaching artifact" (`docs/ARCHITECTURE.md` §3) — it's the publishable example of driving the Meshy pipeline from Node. Write it to be read.
- Pipeline reuse: `lib/meshy/` is isomorphic by design — `createMeshyClient(createDirectTransport({apiKey}))` + `createPipeline()` driven on a real interval. The spike's `scripts/spike/run-pipeline.ts` does this stage-by-stage; the pregen runner should drive the *state machine* instead (that's the teaching point), reading `MESHY_API_KEY` from env only (never deployed — ARCHITECTURE §4 Secrets).
- Download immediately on SUCCEEDED — Meshy URLs die in 3 days (CLAUDE.md convention; ARCHITECTURE Trade-off log "Gallery is build-time").
- Optimization decision (`docs/ARCHITECTURE.md` §5, resolved): meshopt + texture resize + KTX2 via the **programmatic NodeIO API** of `@gltf-transform/core` + `/functions` (already devDependencies) — not the CLI. Raw GLBs are ~8.5 MB at 29k tris, textures dominate (spike README "Sizes"); one raw character busts the <5s first-frame budget. The budget is the gate, not any specific codec: if programmatic KTX2 needs the external `toktx` binary, prefer meshopt + aggressive texture resize/WebP first and only add the KTX2 step if the size target demands it — log whichever path you take in the manifest tooling README.
- Manifest shape: `GalleryEntry` per `docs/ARCHITECTURE.md` §2 — `slug`, `prompt`, `glbPath`, `creditTotal`, `generationSeconds`, per-stage credit breakdown, poly count. Receipts must be real numbers from the run (task `consumed_credits`, timestamps), not the published prices.
- Offline verification inputs: `spike-output/` holds real full-pipeline GLBs (`rig.glb`, `animate-*.glb`, `run.json` with task ids/timings). The optimizer + manifest writer must be testable against these without spending credits.
- Prompt guidance for the curated list: bipeds, standing, arms visible; avoid capes/skirts (emote skinning stretch — spike README "Cosmetic caveat"); "low-poly" in prompts does NOT reduce polycount (spike run 1).

## REQUIREMENTS

1. `npm run pregen` runs the prompt list through the shared `lib/meshy/` pipeline (direct transport), resumable per character (task ids persisted to a local scratch file so a crashed run doesn't respend credits).
2. Gallery characters need all 5 clips: after the pipeline succeeds, download rig + 5 animation GLBs immediately.
3. Optimizer: gltf-transform programmatic pass (prune, meshopt, texture resize; KTX2 only per the budget note above) producing per-character output in `public/gallery/<slug>/`; log before/after sizes.
4. Manifest writer emits `public/gallery/manifest.json` matching `GalleryEntry` exactly, one entry per completed character, receipts from real run data.
5. Offline mode: an entry point that runs optimizer + manifest writer against `spike-output/` — used by tests and to seed the gallery with the knight (real receipts from `spike-output/run.json` + spike README numbers).
6. Vitest coverage: optimizer output parses as valid glTF and is smaller than input; manifest validates against the `GalleryEntry` type; runner logic (prompt list → pipeline calls) tested with the fixture transport, no network.
7. Commit the optimized knight entry + manifest (this makes US-02 buildable before the live run).

## CONSTRAINTS

- Do NOT run live paid generations in this spec — TASK-06b owns spending credits. Test-mode key and `spike-output/` only.
- Do NOT modify `lib/meshy/` (if the pipeline API is missing something the script needs, stop and surface it).
- Do NOT touch `app/` or `components/`.
- Forbidden: install packages other than those listed under "Allowed packages" below.
- Allowed packages: `meshoptimizer` (gltf-transform's meshopt encoder peer); `sharp` (texture resize) only if `@gltf-transform/functions`' built-in resize proves insufficient.

## ACCEPTANCE CRITERIA

- [ ] `npx tsc --noEmit` passes; `npm run test` passes; a test file exists for the new work
- [ ] `public/gallery/manifest.json` exists with the knight entry; its GLB loads in the app and is materially smaller than the 8.5 MB raw
- [ ] `npm run pregen -- --offline` (or equivalent) reproduces the gallery from `spike-output/` without network

## DONE DEFINITION

Mark P1 #3.1 `[x]` in `docs/backlog/phase-1-the-demo.md`.
