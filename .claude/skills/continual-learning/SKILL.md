---
name: continual-learning
description: Orchestrate continual learning by delegating transcript mining and AGENTS.md updates to the `agents-memory-updater` subagent. Use when the user asks to mine prior chats, maintain AGENTS.md, or run the continual-learning loop — or when the Stop hook fires a follow-up.
---

# Continual Learning

Keep `AGENTS.md` current by delegating the memory update flow to one subagent.

## Trigger

Use when the user asks to mine prior chats, maintain `AGENTS.md`, or run the continual-learning loop. Also fires automatically when `.claude/hooks/continual-learning-stop.ts` blocks a Stop event with the follow-up reason.

## Workflow

1. Call the `agents-memory-updater` subagent.
2. Return the updater result verbatim.

## Guardrails

- Keep the parent skill orchestration-only.
- Do not mine transcripts or edit files in the parent flow.
- Do not bypass the subagent.
