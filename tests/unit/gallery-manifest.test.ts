import { describe, expect, it } from "vitest";
import type { GalleryEntry } from "../../scripts/pregen/manifest";
import {
  formatReceipt,
  parseGalleryManifest,
  toCharacterSource,
} from "../../components/gallery/manifest";

const knight: GalleryEntry = {
  slug: "knight",
  prompt: "low-poly knight in full plate armor",
  glbPath: "/gallery/knight/rig.8d812819.glb",
  clipPaths: {
    idle: "/gallery/knight/idle.glb",
    walk: "/gallery/knight/walk.glb",
    run: "/gallery/knight/run.glb",
    jump: "/gallery/knight/jump.glb",
    emote: "/gallery/knight/emote.glb",
  },
  creditTotal: 55,
  generationSeconds: 431,
  stageCredits: {
    preview: 20,
    refine: 10,
    remesh: 5,
    rig: 5,
    "animate:idle": 3,
    "animate:walk": 3,
    "animate:run": 3,
    "animate:jump": 3,
    "animate:emote": 3,
  },
  polyCount: 29015,
};

describe("parseGalleryManifest", () => {
  it("accepts a valid manifest and returns every entry", () => {
    expect(parseGalleryManifest([knight, { ...knight, slug: "fox" }])).toHaveLength(2);
  });

  it("accepts an empty manifest", () => {
    expect(parseGalleryManifest([])).toEqual([]);
  });

  it("rejects a non-array payload", () => {
    expect(() => parseGalleryManifest({ knight })).toThrow(/manifest/i);
  });

  it("rejects entries missing required fields", () => {
    const broken: Partial<GalleryEntry> = { ...knight };
    delete broken.glbPath;
    expect(() => parseGalleryManifest([broken])).toThrow(/glbPath|knight/i);
  });

  it("rejects entries missing a clip path", () => {
    const broken = { ...knight, clipPaths: { ...knight.clipPaths, run: undefined } };
    expect(() => parseGalleryManifest([broken])).toThrow(/run/i);
  });
});

describe("toCharacterSource", () => {
  it("maps a manifest entry onto the scene's CharacterSource shape", () => {
    const source = toCharacterSource(knight);
    expect(source.rig).toBe(knight.glbPath);
    expect(source.clips.idle).toBe(knight.clipPaths.idle);
    expect(source.clips.emote).toBe(knight.clipPaths.emote);
  });
});

describe("formatReceipt", () => {
  it("renders credits and rounded minutes in DESIGN.md voice", () => {
    expect(formatReceipt(knight)).toBe("55 credits. About 7 minutes.");
  });

  it("uses singular minute and credit where counts demand it", () => {
    expect(formatReceipt({ ...knight, creditTotal: 1, generationSeconds: 65 })).toBe(
      "1 credit. About 1 minute.",
    );
  });

  it("falls back to seconds under a minute", () => {
    expect(formatReceipt({ ...knight, generationSeconds: 42 })).toBe(
      "55 credits. About 42 seconds.",
    );
  });
});
