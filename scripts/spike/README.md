# TASK-05 day-0 spike — findings

> Evidence log for the de-risk gate (`docs/specs/task-05-day0-spike.md`).
> Numbers below come from live runs of `run-pipeline.ts`; the script itself
> was developed against the zero-credit test-mode key.

## How to run

```bash
# develop / smoke: zero credits, real API surface
npx tsx scripts/spike/run-pipeline.ts --test

# live: ~55 credits per full run
MESHY_API_KEY=msy_... npx tsx scripts/spike/run-pipeline.ts [--prompt "..."]

# resume from a paid refine task (remesh → rig → animate, ~25 credits)
MESHY_API_KEY=msy_... npx tsx scripts/spike/run-pipeline.ts --from-refine <task_id>

# verify clip↔skeleton binding of the downloaded GLBs (free, offline)
npx tsx scripts/spike/check-binding.mts
```

GLBs land in `spike-output/` (gitignored) the moment each stage succeeds; the
rig + clip GLBs are also copied to `public/spike/` so `/spike` can load them.
Then open `/spike` (`npm run dev`) — keys 1–5 switch clips.

## API corrections discovered (already applied to lib/meshy)

- `v1/animations` takes `rig_task_id` + integer `action_id` — not the
  `input_task_id` / `action`-string shape the other chained endpoints use.
- Rigging results nest the GLB at `result.rigged_character_glb_url`;
  animation results at `result.animation_glb_url`. Only text-to-3d uses
  `model_urls.glb`. `taskGlbUrl()` in `lib/meshy/client.ts` absorbs this.
- Chosen action ids (Animation Library Reference): idle=0 (Idle),
  walk=30 (Casual_Walk), run=14 (Run_02), jump=466 (Regular_Jump),
  emote=28 (Big_Wave_Hello).
- Test-mode caveat: the dummy refine mesh fails rigging with
  `422 Pose estimation failed` — rig/animate stages are only exercisable live.

## Live run log

### Run 1 — 2026-08-03, machine lane (prompt → preview → refine → rig ✗)

Prompt: `low-poly knight in full plate armor, standing upright, arms at sides, facing forward`

| stage | result | credits | time | output |
|---|---|---|---|---|
| preview | SUCCEEDED | 20 | 59s | 10.02 MB, 583,574 tris |
| refine | SUCCEEDED | 10 | 2.6m | 24.37 MB, 583,574 tris |
| rig | create rejected (400) | 0 | — | — |

- Balance 185 → 155 (delta 30 = published preview 20 + refine 10 exactly).
- Rig rejection: `The input model has 583574 faces which exceeds the 300,000
  face limit for rigging. Please use the Remesh API (POST /openapi/v2/remesh)…`
  — **refine outputs are ~583k tris, so a remesh stage before rig is
  mandatory in the live pipeline, not optional.** (The error recommends
  v2/remesh; v1/remesh still accepts creates — run 2 chained from it fine.)
- "low-poly" in the prompt did NOT produce a low-poly mesh.

### Run 2 — 2026-08-03, resume lane (`--from-refine` → remesh → rig → animate ×5)

| stage | result | credits | active time | output |
|---|---|---|---|---|
| remesh (30k target) | SUCCEEDED | 5 | ~2.5m (**+~2h queued**) | 28.84 MB, 29,015 tris |
| rig | SUCCEEDED (first try) | 5 | 49s | 8.49 MB |
| animate ×5 | all SUCCEEDED | 15 | 13–17s each | 8.50–8.56 MB each |

- Balance 155 → 130 (delta 25, matches published prices exactly).
- **Queue reality:** the remesh sat `PENDING` behind **477–532 tasks**
  (`preceding_tasks` field on the task object) for ~2 hours at peak; actual
  processing was ~2.5 minutes. The product's stage rail should surface
  `preceding_tasks` when present — "queued behind N tasks" is honest copy.
- Task ids for every stage are in `spike-output/run.json`.

## Findings

- **Rig success: 1/1 first-try** on the remeshed knight (the biped-prompt
  guidance works). The only rig failure was self-inflicted: feeding the raw
  583k-tri refine output (400, over the 300k-face limit).
- **5-clip merge: CLEAN — the bet holds.** All five animation GLBs carry one
  clip each (`Armature|<Action>|baselayer`, 72 tracks targeting 24 nodes);
  every target node exists in the rig's 26-node skeleton
  (`check-binding.mts` — zero missing). In `/spike`, all five clips play on
  the rigged skeleton via one `AnimationMixer` with no retargeting. Clip
  durations: idle 4.03s, walk 4.23s, run 0.77s, jump 1.93s, emote 5.37s.
- **Cosmetic caveat:** the knight's cloak stretches during the emote wave
  (loose-geometry skinning). Fine for the demo; avoid prompts with
  capes/skirts for gallery characters, or pick emotes with lower arms.
- **Sizes:** raw Meshy GLBs are heavy — textures dominate (29k tris still
  ≈8.5 MB). The pregen gltf-transform pass (meshopt + texture downscale,
  KTX2 if needed) is what protects the <5s first-frame budget; hotlinking
  raw task GLBs never will.
- **Run clip is 0.77s** — short loop; fine for locomotion blending but
  worth QA per character.
- Total spike spend: **55 credits** (30 run 1 + 25 run 2), balance 185 → 130.

## Credit budget vs P1 gallery plan

Live per-character cost is **55 credits** with the now-mandatory remesh stage
(preview 20 + refine 10 + remesh 5 + rig 5 + 5×3 animate), not the 50 in
ARCHITECTURE §4. The gallery plan (~8–12 characters) needs **440–660 credits**
plus spike/retry/on-camera headroom; the balance after this spike will be
~130. **Budget is short → credit-request email below.**

### Draft email (for Serafin to send)

> **Subject:** Meshy trial credits for the DevRel take-home demo
>
> Hi [name],
>
> I'm building my take-home as a browser demo that turns a prompt into a
> playable game character (text-to-3D → remesh → rig → 5 animation clips),
> with a pre-generated gallery so cold visitors get payoff instantly.
>
> The day-0 pipeline validation is done and the numbers are: 55 credits per
> character end-to-end, and I'd like to pre-generate an 8–12 character
> gallery (440–660 credits) plus headroom for retries and a live on-camera
> generation, so roughly **700–800 credits** total. My trial balance is
> ~130 after validation runs.
>
> Could you top up the account tied to [account email]? Happy to share the
> validation numbers or trim the gallery if that's easier.
>
> Thanks!
