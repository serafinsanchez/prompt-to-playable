# US-05: Play the character I just made, then download it

**kind:** ui

## TASK

Close the loop: when a live pipeline run succeeds, the generated character drops into the playground with all 5 clips bound and controllable, and a download button delivers the rigged animated GLB.

## DEPENDENCIES

- P1 #2.2 (controller must survive a character swap)
- P1 #5.1 (a completed run to react to)

## FILES TOUCHED

- `components/scene/` (swap-in from run results — reuses the US-02 swap path if landed, else the US-01a slot directly)
- `components/pipeline/` (completion actions: play state, download button)
- `tests/`

## CONTEXT

- Asset URLs: on success each stage's `modelUrl` is set from `taskGlbUrl()` (`lib/meshy/client.ts` — absorbs `model_urls.glb` vs `result.rigged_character_glb_url` vs `result.animation_glb_url`). Playing needs the **rig GLB + 5 animation GLBs** (same shape as the spike knight: clips bound via one mixer, `app/spike/page.tsx` pattern via US-01a's loader).
- **3-day URL expiry** (CLAUDE.md convention; ARCHITECTURE Trade-off log): Meshy URLs are signed and die. For the in-session loop, fetching at swap/download time is fine; the download button must exist the moment the run succeeds so the user keeps their character. Do not persist Meshy URLs as if permanent — a resumed run older than the expiry window gets honest copy ("assets expired — Meshy keeps results 3 days") rather than a broken fetch.
- Download target: the rigged **animated** GLB. Meshy returns one GLB per animation task (each carrying its clip); "the" download is the rig GLB + the clips — pragmatic call: download the rig GLB as the primary artifact and offer the 5 clip GLBs (zip only if achievable without a new package; otherwise 6 labeled buttons in a popover is honest and fine).
- Live downloads stay raw — no gltf-transform pass client-side (ARCHITECTURE §5: "user already waited minutes; a 8.5 MB fetch is fine").
- CORS note: Meshy asset URLs are direct asset-host links; if browser fetch for the download is CORS-blocked, route the download through the existing passthrough proxy only if the asset host is within its allowlist — otherwise `<a href>` direct navigation downloads fine. Verify, don't assume.
- The swap-in moment is the emotional payoff ("type it, play it, keep it") — swap should feel like an arrival (380ms budget, DESIGN.md), but the full signature choreography remains P2.

## REQUIREMENTS

1. On run success, a completion state appears (mono, DESIGN.md voice: e.g. "55 credits. 6 minutes. Yours.") with two actions: play it (or auto-swap — pick one and justify against "no surprise scene hijack while the user is mid-control") and download.
2. Swap-in binds all 5 generated clips through the US-01a loader; controls + camera work identically to gallery characters; idle plays immediately.
3. Download delivers the rigged GLB (+ clip GLBs per CONTEXT decision) with sensible filenames derived from the prompt slug.
4. Expired-asset path: resumed succeeded run past expiry shows the honest-copy state instead of broken buttons.
5. Gallery (if US-02 landed) and generated character coexist: swapping to a gallery character and back to "your character" works within the session.
6. Tests: completion-state render from a fixture succeeded run; download href/filename logic unit-tested; Playwright happy path with mocked GLB URLs.

## CONSTRAINTS

- Do NOT re-implement clip binding or the controller — this spec is wiring, states, and the download affordance.
- Do NOT persist generated-character GLBs anywhere server-side (no uploads, no gallery insertion — PRD non-goal: persistent user gallery).
- Do NOT modify `lib/meshy/` or the proxy allowlist without surfacing it first (CORS finding = report, then decide).
- do NOT install new packages (no zip library unless the user approves one when asked).

## ACCEPTANCE CRITERIA

- [ ] `npx tsc --noEmit` passes; `npm run test` passes; `bash scripts/check-tokens.sh` passes
- [ ] A test file exists for the new work
- [ ] Manual (requires one live run or the spike-run task ids in localStorage): finished character playable + downloaded file opens in a GLB viewer with animations present
- [ ] design-reviewer pass on the completion state

## DONE DEFINITION

Mark P1 #7 `[x]` in `docs/backlog/phase-1-the-demo.md`.
