# US-10: Download the character as one game-ready GLB

**kind:** ui

## TASK

Every character — the eight gallery characters and the one a BYO-key visitor just generated — gets a "game-ready .glb" download: a single file containing the rigged mesh plus all five named clips (`idle/walk/run/jump/emote`) with facing consistency baked in, loadable by stock three.js / Blender / engine importers with zero extra decoders. Today's downloads can't do this: gallery rows serve mesh-stripped clip files (useless outside this app), and live rows serve six separate full-fat Meshy files.

## DEPENDENCIES

- P1 #7 (US-05 completion actions — the live download disclosure this extends)
- P2 #1 (US-07 shares `completion-actions.tsx` — not parallel-safe; sequence after)

## FILES TOUCHED

- `lib/glb/` (new: `merge.ts`, `facing-bake.ts`, `merge-browser.ts`)
- `scripts/pregen/` (new merge step; `manifest.ts`, `check-gallery.mts`)
- `public/gallery/<slug>/character.<hash>.glb` (generated, one per character)
- `components/gallery/manifest.ts`, `components/gallery/gallery-strip.tsx` (download row)
- `components/pipeline/completion.ts`, `components/pipeline/completion-actions.tsx` (download row + merge trigger)
- `docs/ARCHITECTURE.md` (§5 revision + trade-off log entry)
- `package.json` (dependency promotion only — see CONSTRAINTS)
- `tests/`, `lib/glb/__tests__/`, `scripts/pregen/__tests__/`

## CONTEXT

- **Proven offline 2026-08-04** (spike scripts `scripts/spike-merge-clips.mjs`, `scripts/spike-verify-facing.mjs`; viewer `../glb-merge-test/index.html`): gltf-transform `mergeDocuments` + retarget every animation channel onto the rig skeleton by bone name (bone names match across all Meshy outputs of one character — zero retargeting) + dispose copied scenes/nodes + `prune()` + `unpartition()`. Spike knight: six files / 42.5 MB → one 8.7 MB file, five clips, verified playing in a stock three.js viewer.
- **Yaw bake**: Meshy clips don't share root orientation (`clip-facing.ts` normalizes at runtime). The spike ported that math onto gltf-transform rotation accessors and baked it into the file — all five clips measured an identical mean yaw (50.25°) in the written GLB. `lib/glb/facing-bake.ts` is that port; three.js supplies only quaternion math (already a runtime dep, browser-safe). Export the mean-yaw measurement for test assertions.
- **`rig.glb` ships a junk rig-pose animation** (`Armature|clip0|baselayer`) — strip it or the merged file carries a sixth clip.
- **Gallery derivation needs no Meshy credits**: optimized gallery assets reconstruct the merged file offline — meshopt geometry decodes to standard glTF on read (Node has `meshoptimizer` as devDep), sharp converts WebP textures back to PNG/JPEG, and the stripped clip GLBs still carry full animations + the node hierarchy their tracks target.
- **"Game-ready" is machine-checkable**: `extensionsRequired` empty, textures `image/png` or `image/jpeg` only (core glTF). No meshopt, no WebP, no KTX2 in the output.
- **Size reality** (`optimize.ts` finding): lossless PNG at 2048 made an 8.1 MB rig. So baseColor goes JPEG (q≈90) when no alpha is needed, PNG otherwise; normal maps (if present — Meshy rigging usually drops all but baseColor+emissive) stay PNG. Hard gate: merged gallery file ≤ 8.5 MB (never worse than one raw animate GLB); expected ~2–5 MB with JPEG baseColor.
- **Meshy rig material quirks** (see `meshy-material.ts`): rig output duplicates baseColor into emissive at factor [1,1,1] and sets `specularColorFactor [2,2,2]` — the app normalizes at load. The merged download should ship with the same normalization applied (emissive cleared, specular reset) or downstream engines render the self-glow hack; `dedup()` then collapses the duplicated texture.
- **Live runs merge in the browser**: fetch the run's six GLBs through the existing asset proxy (`proxiedAssetUrl`, browser-cached if the visitor hit "Play it"), merge with gltf-transform `WebIO`, save via blob anchor named from the prompt slug. Raw Meshy textures ship as-is (~9 MB) — no browser-side recompression, no `meshoptimizer` in the client chunk.
- **ARCHITECTURE §5 revision required**: US-05 recorded "no client-side transform pass." This spec supersedes it narrowly — transforms allowed only behind an explicit download click, in a lazy chunk (`await import`), never on the critical path. First-frame budget and initial bundle are untouched; that was §5's actual intent. Trade-off log entry required.
- Expired-asset path already exists: the whole completion download block degrades past Meshy's ~3-day retention (US-05) — the merge button inherits that gate for free.

## REQUIREMENTS

1. `lib/glb/merge.ts`: `mergeCharacter(rigDoc, clipDocs)` — strips base animations, merges/retargets the five clips by bone name, throws with a clear message on a missing bone, prunes duplicates, single output buffer. Output: exactly five clips named `idle/walk/run/jump/emote`, one mesh, one skin.
2. `lib/glb/facing-bake.ts`: bakes every clip's mean hips yaw to idle's (port of `clip-facing.ts`); exports the measurement function.
3. Pregen step writes `public/gallery/<slug>/character.<hash>.glb` per character derived from existing gallery assets (no live Meshy calls); applies material normalization; manifest entries gain `gameReadyPath` + `gameReadySizeBytes`.
4. `check-gallery.mts` gates every entry: file exists, parses, five named clips, one mesh/skin, uniform mean yaw across clips, `extensionsRequired` empty, PNG/JPEG textures only, ≤ 8.5 MB.
5. Gallery download disclosure gains a "game-ready .glb" row (plain anchor, `download` attr, honest size copy in mono per DESIGN.md) above the existing per-file rows, which stay (they teach the API's real output shape).
6. Live completion download disclosure gains the same row as a **button** with full states (idle / loading "Merging…" / error + retry / hidden when expired). Click → lazy-import `lib/glb/merge-browser.ts` → fetch six proxied GLBs → merge + bake → blob download named `<prompt-slug>.glb`. Errors render inline in the row — no toasts.
7. `docs/ARCHITECTURE.md`: §5 text updated + trade-off log entry for the client-transform revision and the dependency promotion.
8. Tests: Vitest on `lib/glb/` with small synthetic fixtures (mini skeleton + clips with known yaws — assert clip set, junk-clip strip, yaw uniformity, bone-mismatch throw; no multi-MB fixtures in repo); pregen gate test per req 4; Playwright — gallery row real-download (download event, non-trivial byte size), live row via the seeded-localStorage run envelope with fixture assets, axe pass on both disclosures.

## CONSTRAINTS

- No new packages. Promoting existing devDeps `@gltf-transform/core|extensions|functions` to `dependencies` is authorized; `meshoptimizer` and `sharp` stay dev-only and must not enter any client chunk (verify via build output).
- gltf-transform loads only inside the lazy merge chunk — never in the initial bundle. First-frame and bundle budgets stay green (TASK-07 gates).
- Do NOT touch the app's own character load path (`clip-binding.ts`, `character.tsx`, runtime `clip-facing.ts` stay as-is — stripped clips are smaller than the merged file).
- No server-side involvement: no new routes, no proxy changes, no zip bundling.
- Main-thread merge is acceptable (fetch-dominated, click-triggered); a Web Worker only if real-device testing shows jank — note it, don't pre-build it.
- Run `architecture-reviewer` (deps promotion + §5 revision) and `design-reviewer` (both download rows) before done.

## ACCEPTANCE CRITERIA

- [ ] `npm run typecheck`, `npm run lint`, `npm run test`, `bash scripts/check-tokens.sh` pass; Playwright suite green
- [ ] Every `manifest.json` entry has a `gameReadyPath` whose file passes the req-4 gates (8/8 characters — full dataset, no subset)
- [ ] Manual: a downloaded gallery `character.glb` AND a live-run merged file each load in stock three.js `GLTFLoader` (no decoders configured) showing five clips with consistent facing — verify via the offline viewer
- [ ] architecture-reviewer and design-reviewer passes recorded

## DONE DEFINITION

Mark P2 #8 `[x]` in `docs/backlog/phase-2-ship.md`.
