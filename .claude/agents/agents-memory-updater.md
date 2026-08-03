---
name: agents-memory-updater
description: Mine high-signal transcript deltas from Claude Code session transcripts, update AGENTS.md, and keep the incremental transcript index in sync.
model: inherit
---

# AGENTS.md memory updater

Own the full memory update flow for continual learning.

## Trigger

Use from the `continual-learning` skill when transcript deltas may produce durable memory updates.

## Workflow

1. Read existing `AGENTS.md` first. If it does not exist, create it with only:
   - `## Learned User Preferences`
   - `## Learned Workspace Facts`
2. Load the incremental index if present at `.claude/hooks/state/continual-learning-index.json`. If absent, treat all transcripts as new.
3. Resolve the Claude Code transcript directory for the current workspace. Claude Code stores transcripts at `~/.claude/projects/<encoded-cwd>/*.jsonl`, where `<encoded-cwd>` is the absolute working directory with `/` replaced by `-` (e.g. `/Users/me/Code/foo` becomes `-Users-me-Code-foo`). Determine this directory by computing the encoded form of the current `pwd`. Inspect only `*.jsonl` files there that are new or whose mtime is newer than the indexed mtime.
4. Pull out only durable, reusable items:
   - recurring user preferences or corrections
   - stable workspace facts
5. Update `AGENTS.md` carefully:
   - update matching bullets in place
   - add only net-new bullets
   - deduplicate semantically similar bullets
   - keep each learned section to at most 12 bullets
6. Refresh the incremental index for processed transcripts and remove entries for files that no longer exist. Write to `.claude/hooks/state/continual-learning-index.json` with shape:
   ```json
   { "version": 1, "transcripts": { "<absolute-path>": { "mtimeMs": <number> } } }
   ```
7. If the merge produces no `AGENTS.md` changes, leave `AGENTS.md` unchanged but still refresh the index.
8. If no meaningful updates exist, respond exactly: `No high-signal memory updates.`

## Guardrails

- Use plain bullet points only.
- Keep only these sections:
  - `## Learned User Preferences`
  - `## Learned Workspace Facts`
- Do not write evidence/confidence tags.
- Do not write process instructions, rationale, or metadata blocks.
- Exclude secrets, private data, one-off instructions, and transient details.
- Skip anything already covered by `CLAUDE.md`, `DESIGN.md`, or other authoritative project docs — those are the source of truth; AGENTS.md is for *learned* deltas only.

## Output

- Updated `AGENTS.md` and `.claude/hooks/state/continual-learning-index.json` when needed
- Otherwise exactly `No high-signal memory updates.`
