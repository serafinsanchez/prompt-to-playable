# TASK-09: Demo video (2–3 min), ready to publish

**kind:** infra _(content task — recording and editing are human steps; the agent produces the script, shot list, and captions)_

## TASK

Produce a publish-ready 2–3 minute demo video: cold-open on gameplay inside 10 seconds, live generation with the stage rail, the API-panel beat, the download beat, and a closer — tightly scripted, captioned, watchable without audio.

## DEPENDENCIES

- P2 #1 (the signature completion beat is the emotional core of the generation segment — record after it lands)

## FILES TOUCHED

- `docs/video/` (new: script.md, shot-list.md, captions.srt — checked in so the video is reproducible)

## CONTEXT

- **Beat structure comes from the inbox item + PRD:** cold-open on gameplay (<10s in — mirrors the 15s cold-visitor metric), live generation with the rail (the wait *is* the product; show stage completions landing), API panel beat (the demo must teach the API while it entertains — PRD's core thesis), download beat ("type it, play it, keep it" — US-05's completion copy), closer (live link + repo).
- **Material to script from:** DESIGN.md §Voice for on-screen text (mono, numbers-as-copy: "55 credits. About 6 minutes."); `components/pipeline/api-descriptor.ts` for the exact API calls shown in the panel beat; the gallery characters in `public/gallery/` (knight, goblin-scout, street-samurai, etc.) for the cold-open variety shots.
- **Time compression:** a real run takes minutes; the script must plan the cut (time-lapse the rail between beats, never fake the UI — the rail's real states are the footage). A fixture-driven run (the same mocking pattern the Playwright specs use) is legitimate for capturing stage-completion moments deterministically; label nothing as real-time that isn't.
- **Watchable without audio** is an acceptance criterion → captions carry the narration; on-screen UI text does the teaching. Write `captions.srt` from the script so editing is assembly, not authoring.
- **Human/agent split:** agent writes script + shot list + captions and can capture UI footage/GIF segments via browser tooling; screen recording of actual gameplay feel, editing, and the final export are the user's. The spec is done from the agent side when the kit is complete and the user has what they need to record in one sitting.

## REQUIREMENTS

1. `docs/video/script.md`: full narration + on-screen text, timed to 2–3 minutes, gameplay on screen within the first 10 seconds; each beat (cold-open / live gen / API panel / download / closer) marked with target timestamps.
2. `docs/video/shot-list.md`: every shot with source (live app, which character, which pipeline state, how to reach it — including the fixture-run recipe for deterministic stage completions), plus recording settings (viewport, DPR, cursor visibility).
3. `docs/video/captions.srt` matching the script's timing skeleton (retimed in the edit is fine).
4. Recording checklist: what to verify before capture (polished US-07 motion in, prod build not dev, reduced-motion OFF, clean localStorage).
5. Human steps clearly listed at the end: record, edit, export (1080p+, publish-ready), place the export where TASK-10 bundles it.

## CONSTRAINTS

- Do NOT modify app code to make the video easier — no demo-mode flags, no sped-up polling. Fixture runs use only the existing test plumbing.
- Do NOT fake UI states in the edit that the app can't produce.
- Do NOT mark this backlog row done until the publish-ready export exists — the kit alone is not the acceptance bar.
- do NOT install new packages.

## ACCEPTANCE CRITERIA

- [ ] Script/shot-list/captions checked into `docs/video/` and internally consistent
- [ ] Gameplay appears in the first 10 seconds of the scripted timeline
- [ ] Watchable-without-audio verified (script review: every spoken point has a caption or on-screen equivalent)
- [ ] Publish-ready export exists (human-confirmed), 2–3 minutes

## DONE DEFINITION

Mark P2 #4 `[x]` in `docs/backlog/phase-2-ship.md`.
