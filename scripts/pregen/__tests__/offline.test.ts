import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { galleryEntryErrors, readManifest } from "../manifest";
import { KNIGHT_RECEIPTS, knightStageCreditSum, seedKnightFromSpike } from "../offline";

describe("KNIGHT_RECEIPTS", () => {
  it("matches the spike's audited totals (balance delta 55, 431s active)", () => {
    expect(KNIGHT_RECEIPTS.creditTotal).toBe(55);
    expect(knightStageCreditSum()).toBe(55);
    expect(KNIGHT_RECEIPTS.generationSeconds).toBe(431);
  });
});

// End-to-end offline seeding needs the real spike downloads. spike-output/ is
// gitignored (~54 MB), so this suite only runs where TASK-05's artifacts
// exist; the committed public/gallery/ output is itself verified by
// manifest.test.ts, which always runs.
const spikeDir = join(process.cwd(), "spike-output");
describe.skipIf(!existsSync(join(spikeDir, "run.json")))("seedKnightFromSpike (integration)", () => {
  const tempDirs: string[] = [];
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it("rebuilds a valid knight entry from spike-output/ without network", async () => {
    const galleryDir = mkdtempSync(join(tmpdir(), "pregen-gallery-"));
    tempDirs.push(galleryDir);

    const entry = await seedKnightFromSpike({ spikeDir, galleryDir });

    expect(galleryEntryErrors(entry)).toEqual([]);
    expect(entry.slug).toBe("knight");
    expect(entry.polyCount).toBe(29_015);

    const manifest = readManifest(galleryDir);
    expect(manifest.map((each) => each.slug)).toEqual(["knight"]);

    // The rig must be materially smaller than the ~8.5 MB raw download, and
    // clips must be animation-only slivers.
    const fileFor = (urlPath: string): string =>
      join(galleryDir, urlPath.replace(/^\/gallery\//, ""));
    expect(readFileSync(fileFor(entry.glbPath)).byteLength).toBeLessThan(4 * 1024 * 1024);
    for (const clipPath of Object.values(entry.clipPaths)) {
      expect(readFileSync(fileFor(clipPath)).byteLength).toBeLessThan(300 * 1024);
    }
  }, 60_000);

  it("is idempotent: same inputs produce the same hashed paths", async () => {
    const galleryDir = mkdtempSync(join(tmpdir(), "pregen-gallery-"));
    tempDirs.push(galleryDir);

    const first = await seedKnightFromSpike({ spikeDir, galleryDir });
    const second = await seedKnightFromSpike({ spikeDir, galleryDir });
    expect(second.glbPath).toBe(first.glbPath);
    expect(readManifest(galleryDir)).toHaveLength(1);
  }, 120_000);
});
