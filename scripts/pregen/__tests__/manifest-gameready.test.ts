import { describe, expect, it } from "vitest";
import { galleryEntryErrors, type GalleryEntry } from "../manifest";

const BASE: GalleryEntry = {
  slug: "knight",
  prompt: "a knight",
  glbPath: "/gallery/knight/rig.abc12345.glb",
  clipPaths: {
    idle: "/gallery/knight/idle.a.glb",
    walk: "/gallery/knight/walk.a.glb",
    run: "/gallery/knight/run.a.glb",
    jump: "/gallery/knight/jump.a.glb",
    emote: "/gallery/knight/emote.a.glb",
  },
  creditTotal: 55,
  generationSeconds: 431,
  stageCredits: {
    preview: 20, refine: 10, remesh: 5, rig: 5,
    "animate:idle": 3, "animate:walk": 3, "animate:run": 3,
    "animate:jump": 3, "animate:emote": 3,
  },
  polyCount: 29015,
};

describe("galleryEntryErrors — game-ready fields", () => {
  it("accepts an entry without the optional fields (pre-derivation manifest)", () => {
    expect(galleryEntryErrors(BASE)).toEqual([]);
  });

  it("accepts an entry with both fields valid", () => {
    expect(
      galleryEntryErrors({
        ...BASE,
        gameReadyPath: "/gallery/knight/character.ab12cd34.glb",
        gameReadySizeBytes: 4_200_000,
      }),
    ).toEqual([]);
  });

  it("rejects a present-but-invalid gameReadyPath", () => {
    expect(galleryEntryErrors({ ...BASE, gameReadyPath: "" })).toContainEqual(
      expect.stringContaining("gameReadyPath"),
    );
  });

  it("rejects a present-but-invalid gameReadySizeBytes", () => {
    expect(galleryEntryErrors({ ...BASE, gameReadySizeBytes: -1 })).toContainEqual(
      expect.stringContaining("gameReadySizeBytes"),
    );
  });
});
