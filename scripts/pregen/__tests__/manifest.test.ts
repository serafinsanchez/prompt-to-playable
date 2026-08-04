import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createEmptyRun } from "../../../lib/meshy/pipeline";
import { ANIMATION_CLIPS, PIPELINE_STAGES, STAGE_CREDITS } from "../../../lib/meshy/types";
import {
  galleryEntryErrors,
  hashedGlbName,
  manifestErrors,
  readManifest,
  receiptsFromRun,
  upsertEntry,
  writeCharacterFiles,
  writeManifest,
  type GalleryEntry,
} from "../manifest";

const tempDirs: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "pregen-manifest-"));
  tempDirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function validEntry(overrides: Partial<GalleryEntry> = {}): GalleryEntry {
  return {
    slug: "knight",
    prompt: "a knight",
    glbPath: "/gallery/knight/rig.12345678.glb",
    clipPaths: Object.fromEntries(
      ANIMATION_CLIPS.map((clip) => [clip, `/gallery/knight/${clip}.12345678.glb`]),
    ) as GalleryEntry["clipPaths"],
    creditTotal: 55,
    generationSeconds: 431,
    stageCredits: { ...STAGE_CREDITS },
    polyCount: 29015,
    ...overrides,
  };
}

describe("galleryEntryErrors", () => {
  it("accepts a fully-populated entry", () => {
    expect(galleryEntryErrors(validEntry())).toEqual([]);
  });

  it("rejects missing or empty core fields", () => {
    expect(galleryEntryErrors({ ...validEntry(), slug: "" })).not.toEqual([]);
    expect(galleryEntryErrors({ ...validEntry(), polyCount: -1 })).not.toEqual([]);
    expect(galleryEntryErrors(null)).toEqual(["entry is not an object"]);
  });

  it("requires every clip and every stage, and no extras", () => {
    const missingClip = validEntry();
    delete (missingClip.clipPaths as Record<string, string>).emote;
    expect(galleryEntryErrors(missingClip).join()).toContain('clipPaths is missing "emote"');

    const extraStage = validEntry();
    (extraStage.stageCredits as Record<string, number>).bonus = 1;
    expect(galleryEntryErrors(extraStage).join()).toContain('unknown key "bonus"');
  });

  it("enforces the receipt invariant: creditTotal equals the stage sum", () => {
    expect(galleryEntryErrors(validEntry({ creditTotal: 54 })).join()).toContain(
      "creditTotal 54 != sum of stageCredits 55",
    );
  });
});

describe("manifestErrors", () => {
  it("accepts an array of valid entries and rejects duplicate slugs", () => {
    expect(manifestErrors([validEntry()])).toEqual([]);
    expect(manifestErrors([validEntry(), validEntry()])).toContain("duplicate slugs in manifest");
    expect(manifestErrors({})).toEqual(["manifest is not an array"]);
  });
});

describe("receiptsFromRun", () => {
  it("sums real stage credits and counts the parallel animate group once", () => {
    const run = createEmptyRun("a knight");
    run.status = "succeeded";
    let t = 0;
    for (const stage of PIPELINE_STAGES) {
      const state = run.stages[stage];
      state.status = "succeeded";
      state.creditCost = STAGE_CREDITS[stage];
      state.startedAt = stage.startsWith("animate:") ? 100_000 : t;
      // linear stages take 10s each; clips take 3–7s, longest 7s
      state.completedAt =
        state.startedAt + (stage.startsWith("animate:") ? 3000 + 1000 * (t % 5) : 10_000);
      t += 10_000;
    }
    run.stages["animate:emote"].completedAt = 100_000 + 7000;

    const receipts = receiptsFromRun(run);
    expect(receipts.creditTotal).toBe(55);
    expect(receipts.stageCredits.preview).toBe(20);
    // 4 linear stages × 10s + longest clip 7s
    expect(receipts.generationSeconds).toBe(47);
  });

  it("refuses an incomplete run rather than fabricating receipts", () => {
    const run = createEmptyRun("a knight");
    expect(() => receiptsFromRun(run)).toThrow(/no consumed_credits/);
  });
});

describe("manifest files on disk", () => {
  it("round-trips write → read and upserts by slug", () => {
    const dir = tempDir();
    expect(readManifest(dir)).toEqual([]); // missing file = empty gallery

    writeManifest(dir, [validEntry()]);
    const loaded = readManifest(dir);
    expect(loaded).toHaveLength(1);

    const updated = upsertEntry(loaded, validEntry({ polyCount: 30_000 }));
    expect(updated).toHaveLength(1);
    expect(updated[0].polyCount).toBe(30_000);

    const grown = upsertEntry(updated, validEntry({ slug: "goblin-scout" }));
    expect(grown).toHaveLength(2);
  });

  it("writes content-hashed character files and returns their URL paths", () => {
    const dir = tempDir();
    const rig = new Uint8Array([1, 2, 3]);
    const clips = Object.fromEntries(
      ANIMATION_CLIPS.map((clip, i) => [clip, new Uint8Array([i])]),
    ) as Record<(typeof ANIMATION_CLIPS)[number], Uint8Array>;

    const paths = writeCharacterFiles(dir, "knight", { rig, clips });
    expect(paths.glbPath).toBe(`/gallery/knight/${hashedGlbName("rig", rig)}`);
    expect(existsSync(join(dir, "knight", hashedGlbName("rig", rig)))).toBe(true);
    expect(existsSync(join(dir, "knight", hashedGlbName("idle", clips.idle)))).toBe(true);
    // Same bytes → same hash → idempotent re-run.
    expect(writeCharacterFiles(dir, "knight", { rig, clips })).toEqual(paths);
  });
});

describe("committed gallery", () => {
  const galleryDir = join(process.cwd(), "public", "gallery");

  it("public/gallery/manifest.json validates and carries the knight", () => {
    const manifest = readManifest(galleryDir); // throws if invalid
    const knight = manifest.find((entry) => entry.slug === "knight");
    expect(knight).toBeDefined();
    expect(knight?.creditTotal).toBe(55);

    // Every path in the manifest must exist on disk, and the rig must be
    // materially smaller than the ~8.5 MB raw download.
    for (const entry of manifest) {
      const files = [entry.glbPath, ...Object.values(entry.clipPaths)];
      for (const urlPath of files) {
        const filePath = join(process.cwd(), "public", urlPath.replace(/^\//, ""));
        expect(existsSync(filePath), `${urlPath} missing on disk`).toBe(true);
      }
      const rigBytes = readFileSync(
        join(process.cwd(), "public", entry.glbPath.replace(/^\//, "")),
      ).byteLength;
      expect(rigBytes).toBeLessThan(4 * 1024 * 1024);
    }
  });
});
