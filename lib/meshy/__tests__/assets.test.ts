/**
 * Unit tests for asset-URL proxying (`lib/meshy/assets.ts`). assets.meshy.ai
 * sends no CORS headers, so browser-side loaders (thumbnails, the play
 * swap-in) can only reach Meshy assets through the same-origin proxy route.
 */

import { describe, expect, it } from "vitest";

import { ASSET_PROXY_PATH, proxiedAssetUrl } from "../assets";

describe("proxiedAssetUrl", () => {
  it("rewrites an assets.meshy.ai URL to the same-origin proxy, preserving the signed query", () => {
    const signed =
      "https://assets.meshy.ai/uid/tasks/task-1/output/model.glb?Expires=123&Signature=s~g__&Key-Pair-Id=K1";

    const proxied = proxiedAssetUrl(signed);

    expect(proxied).toBe(`${ASSET_PROXY_PATH}?url=${encodeURIComponent(signed)}`);
  });

  it("leaves non-Meshy absolute URLs untouched", () => {
    const url = "https://assets.meshy.test/task-1.glb";
    expect(proxiedAssetUrl(url)).toBe(url);
  });

  it("leaves same-origin paths untouched (gallery + spike GLBs)", () => {
    expect(proxiedAssetUrl("/gallery/sky-knight/rig.glb")).toBe(
      "/gallery/sky-knight/rig.glb",
    );
  });

  it("is idempotent: an already-proxied URL passes through unchanged", () => {
    const signed = "https://assets.meshy.ai/uid/tasks/task-1/output/model.glb?Expires=1";
    const once = proxiedAssetUrl(signed);
    expect(proxiedAssetUrl(once)).toBe(once);
  });

  it("does not rewrite lookalike hosts (evil-assets.meshy.ai.attacker.com)", () => {
    const url = "https://assets.meshy.ai.attacker.com/model.glb";
    expect(proxiedAssetUrl(url)).toBe(url);
  });
});
