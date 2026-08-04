import { describe, expect, it } from "vitest";
import { galleryDownloadPlan } from "../../components/gallery/manifest";
import type { GalleryEntry } from "../../scripts/pregen/manifest";

const ENTRY: GalleryEntry = {
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

describe("galleryDownloadPlan — game-ready row", () => {
  it("leads with character.glb when the manifest has it", () => {
    const plan = galleryDownloadPlan({
      ...ENTRY,
      gameReadyPath: "/gallery/knight/character.ab12cd34.glb",
      gameReadySizeBytes: 4_404_019,
    });
    expect(plan[0]).toEqual({
      label: "game-ready · 4.2 MB",
      shortName: "character.glb",
      filename: "knight.glb",
      url: "/gallery/knight/character.ab12cd34.glb",
    });
    expect(plan).toHaveLength(7); // game-ready + rig + 5 clips
  });

  it("omits the row for a pre-derivation entry", () => {
    const plan = galleryDownloadPlan(ENTRY);
    expect(plan).toHaveLength(6);
    expect(plan[0].shortName).toBe("rig.glb");
  });
});
