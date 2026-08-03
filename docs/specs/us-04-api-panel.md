# US-04: See the API call behind every stage

**kind:** ui

## TASK

Give every pipeline stage an expandable panel showing the actual Meshy request that produced it — real endpoint path (v1/v2 visible), request body, credit cost — copyable.

## DEPENDENCIES

- P1 #5.2

## FILES TOUCHED

- `components/pipeline/` (api-panel component; stage-row expansion hook-in)
- `lib/` (small request-descriptor map — see CONTEXT for placement decision)
- `tests/`

## CONTEXT

- This is the DevRel differentiator (inbox note): the demo must *teach the API while it entertains* (CLAUDE.md). The panel shows what a developer would write, not an abstraction.
- Source of truth for the shapes shown: `lib/meshy/client.ts` — real paths are exported constants (`TEXT_TO_3D_PATH = /openapi/v2/text-to-3d`, `RIGGING_PATH`, `ANIMATIONS_PATH`, `REMESH_PATH` — the v2/v1 split is itself a teaching point) and the create bodies are visible in the client (`mode: "preview"`, `preview_task_id`, `input_task_id` + `target_polycount`, `rig_task_id` + integer `action_id` from `ANIMATION_CLIP_ACTIONS`). The animations shape is a spike-discovered correction (README "API corrections") — exactly the gotcha the panel exists to teach.
- Placement decision: derive each stage's displayed request from a descriptor map colocated with the panel, built against the exported client constants — do NOT intercept the transport or duplicate path strings by hand. If a stage's real task id should appear in the body (it should, once known), read it from the run snapshot.
- Mono type per DESIGN.md — "the mono voice is load-bearing: pipeline rail, API panel, credit counts". Copy button per panel; syntax presentation stays restrained (this is a build log, not a code editor theme party).
- Credits: per-call cost from `STAGE_CREDITS` pre-run, real `consumed_credits` once terminal.
- The user's key NEVER appears in the panel — show the header as `x-meshy-key: •••` / `Authorization: Bearer •••` (ARCHITECTURE §4: never logged, never displayed).

## REQUIREMENTS

1. Each stage row expands (click/keyboard) to its panel: method + real path, request body JSON with real chained task ids from the run, credit cost line.
2. v2 vs v1 is visibly called out (the split is deliberate Meshy API surface — one mono badge does it).
3. Copy button copies a curl-equivalent or JSON body (pick one, be consistent); copied state feedback inline, no toast.
4. Panels work for all 9 stages including the 5 animate calls (each shows its own `action_id` + clip name).
5. Key redaction: masked header line always; a unit test asserts no store/sessionStorage key value can reach panel output.
6. Tests: descriptor map ↔ client constants stay in sync (import the constants, compare); Playwright: expand a stage, assert path text, copy works.

## CONSTRAINTS

- Do NOT intercept or wrap the transport for display purposes; the descriptor map + run snapshot is the whole data source.
- Do NOT modify `lib/meshy/` logic (importing its exported constants is the point, changing them isn't).
- Do NOT invent API surface — paths shown must be the proxy-relative real Meshy paths (`/api/meshy` + real path is acceptable and honest; note the passthrough in one caption line).
- do NOT install new packages (no syntax-highlighting libraries — mono + restraint).

## ACCEPTANCE CRITERIA

- [ ] `npx tsc --noEmit` passes; `npm run test` passes; `bash scripts/check-tokens.sh` passes
- [ ] A test file exists for the new work (sync test + redaction test at minimum)
- [ ] design-reviewer pass
- [ ] Manual: a developer reading the refine panel could reproduce the call in curl without opening docs

## DONE DEFINITION

Mark P1 #6 `[x]` in `docs/backlog/phase-1-the-demo.md`.
