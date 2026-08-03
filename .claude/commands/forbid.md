---
description: Append a project-specific forbidden default to DESIGN.md when you spot a pattern the agent keeps reaching for that doesn't fit the brand. Builds your taste rules over time.
argument-hint: <thing to forbid and why, e.g. "backdrop-blur on cards — feels generic glassmorphism">
allowed-tools: Read, Edit
---

# Forbid: $ARGUMENTS

Append the input to the project-specific forbidden section of DESIGN.md.

## Steps

1. Read `DESIGN.md`. If absent, instruct the user to run the design-md-builder skill first and stop.
2. Find the section titled `## Forbidden defaults` and within it the line `**Project-specific rejections:**`.
3. Parse `$ARGUMENTS`. Format the new entry as:

   ```
   - No <specific thing>. (Reason: <one sentence>.)
   ```

   If the input doesn't include a reason, ask for one. The reason is what makes the rule survive future re-reads.

4. **Reject vague forbids.** If the input is something like "no ugly stuff," "less generic," or "better animations," refuse to append and ask: *"Be specific. What pattern have you seen the agent reach for that doesn't fit?"* Do not append until you have a specific pattern.
5. Show the user the diff (just the line being appended). Confirm before writing.
6. After writing, suggest:

   ```
   git add DESIGN.md && git commit -m "design: forbid <short summary>"
   ```

   so the rule is versioned and survives.

## Examples of acceptable forbids

- `No backdrop-blur on cards. (Reason: feels like generic glassmorphism, not our editorial direction.)`
- `No hover scales over 1.02. (Reason: decorative, not communicating state.)`
- `No Lucide icons in marketing surfaces. (Reason: identifiable as default-stack; use our custom icon set.)`
- `No animated gradient text. (Reason: 2023 SaaS cliche, undermines our seriousness.)`

## Examples to reject

- "No ugly things"
- "Less generic stuff"
- "Better animations"
- "Make it nicer"

If the user resists giving specifics, push once. If they still won't, decline and explain that vague rules are worse than no rules.
