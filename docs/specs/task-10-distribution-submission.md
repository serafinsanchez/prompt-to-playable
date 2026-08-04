# TASK-10: Distribution plan + submission bundle

**kind:** infra _(content task — the cold-visitor test and the actual send are human steps)_

## TASK

Write the 1–2 paragraph distribution plan, run the cold-visitor test with 2–3 real people against the 15-second metric, check the bundle against every line of the assignment PDF, and submit.

## DEPENDENCIES

- P2 #2 (perf/a11y verified before real people hit the link)
- P2 #3 (README/repo is deliverable #1's front door)
- P2 #4 (video is deliverable #2)

## FILES TOUCHED

- `docs/distribution-plan.md` (new)
- `docs/submission-checklist.md` (new: assignment PDF line-items → evidence)

## CONTEXT

- **The assignment PDF** lives in the parent workspace: `../Developer Experience Manager Assignment.pdf` (outside this repo — read it there; do not copy it into the public repo). The submission bundle per PRD §context: (1) the app live on Vercel + public GitHub repo, (2) ready-to-publish content (video + README-as-landing-page), (3) the distribution plan.
- **The 15-second metric** is the PRD's primary success metric: "a cold visitor (no instructions, no API key) is controlling a character within 15 seconds of page load. Verified before submission by watching 2–3 people try the link unprompted." Design the test to be honest: send the bare prod link with no framing, watch (screen share or in person), time to first movement input that visibly moves the character.
- **Distribution plan inputs:** the demo's natural communities (Three.js/R3F — r/threejs, R3F discord, @threejs-flavored X; game-dev hobbyists — r/gamedev, itch-adjacent spaces; Meshy's own discord/community), positioning (teach-the-API angle: "every API call on screen" is the differentiator vs. yet-another-AI-3D demo), and the user's existing presence (GitHub, X, portfolio — ask the user rather than inventing reach they don't have). 1–2 paragraphs, per the assignment — concrete channels + first-week sequencing, not a marketing essay.
- **Fresh-eyes check before sending:** the PRD's dual-audience note (the hiring team evaluates whether the demo would convert the target developer) means the checklist should be read as an evaluator: does each deliverable prove its line in the PDF?

## REQUIREMENTS

1. `docs/submission-checklist.md`: every requirement line from the assignment PDF as a checkbox with a pointer to its evidence (URL, file, or video timestamp). Any line the bundle doesn't satisfy is flagged loudly, not papered over.
2. `docs/distribution-plan.md`: 1–2 paragraphs — channels, positioning, existing presence, first-week sequencing. Draft agent-side, finalize with the user's real channels.
3. Cold-visitor protocol written (how to run it honestly), then executed by the user with 2–3 people; results recorded (pass/fail + observed time) in the checklist. A miss is a finding to fix, not a footnote.
4. Bundle assembly: live URL, repo URL, video file/link, plan — wherever the PDF says to send them, staged and ready.
5. Human steps clearly listed: run the cold-visitor sessions, approve the plan, send the submission.

## CONSTRAINTS

- Do NOT submit anything on the user's behalf — staging and checklists only; the send is theirs.
- Do NOT copy the assignment PDF (or quotes identifying the company's internal process) into the public repo — checklist items paraphrase.
- Do NOT ship over a failed cold-visitor test or an unchecked PDF line — flag and stop.
- do NOT install new packages.

## ACCEPTANCE CRITERIA

- [ ] Checklist covers every line of the assignment PDF with evidence pointers, zero unresolved flags
- [ ] Distribution plan finalized with the user (their channels, their voice)
- [ ] 15s metric verified with 2–3 real people, results recorded
- [ ] All three deliverables staged; user confirms sent

## DONE DEFINITION

Mark P2 #5 `[x]` in `docs/backlog/phase-2-ship.md`. This closes P2 — run `prd-revise` at the phase boundary per CLAUDE.md.
