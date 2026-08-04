import { describe, expect, it } from "vitest";

import {
  CHARACTER_SCAFFOLD,
  detectActionLanguage,
  detectHeldProps,
  MAX_PROMPT_LENGTH,
  scaffoldPrompt,
} from "../prompt-craft";

describe("scaffoldPrompt", () => {
  it("appends the character scaffold to the visitor's prompt", () => {
    const result = scaffoldPrompt("a basketball player");

    expect(result.startsWith("a basketball player")).toBe(true);
    expect(result).toContain(CHARACTER_SCAFFOLD);
  });

  it("keeps rig-critical phrasing in the scaffold", () => {
    // The scaffold exists to fix action poses, asymmetry, and fused props —
    // if these phrases go, the point of it goes.
    expect(CHARACTER_SCAFFOLD).toMatch(/standing/);
    expect(CHARACTER_SCAFFOLD).toMatch(/symmetrical/);
    expect(CHARACTER_SCAFFOLD).toMatch(/empty hands/);
  });

  it("caps the combined prompt at Meshy's 600-char limit without losing the scaffold", () => {
    const longPrompt = "a knight ".repeat(100).trim(); // ~900 chars

    const result = scaffoldPrompt(longPrompt);

    expect(result.length).toBeLessThanOrEqual(MAX_PROMPT_LENGTH);
    expect(result.endsWith(CHARACTER_SCAFFOLD)).toBe(true);
  });

  it("trims surrounding whitespace before scaffolding", () => {
    expect(scaffoldPrompt("  a fox  ").startsWith("a fox,")).toBe(true);
  });
});

describe("detectActionLanguage", () => {
  it("finds action words that fight the neutral pose, case-insensitively", () => {
    const found = detectActionLanguage("a player Dunking mid-air with hands up");

    expect(found).toEqual(["dunking", "mid-air", "hands up"]);
  });

  it("is silent on a neutral prompt", () => {
    expect(detectActionLanguage("a calm robot chef")).toEqual([]);
  });

  it("matches whole words only — no false hit inside other words", () => {
    // "jumper" (clothing) must not trigger the "jump" warning.
    expect(detectActionLanguage("a knight in a wool jumper")).toEqual([]);
  });
});

describe("detectHeldProps", () => {
  it("finds held-prop nouns that would fuse into the mesh", () => {
    expect(detectHeldProps("a wizard with a staff and a Sword")).toEqual([
      "staff",
      "sword",
    ]);
  });

  it("reports basketball once, not also as ball", () => {
    expect(detectHeldProps("a basketball player")).toEqual(["basketball"]);
  });

  it("is silent when hands are empty", () => {
    expect(detectHeldProps("an astronaut in a suit")).toEqual([]);
  });
});
