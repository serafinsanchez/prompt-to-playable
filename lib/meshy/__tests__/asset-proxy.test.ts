/**
 * Unit tests for the Meshy asset passthrough route
 * (`app/api/meshy-asset/route.ts`) with a mocked global fetch. Signed asset
 * URLs are their own auth — no key crosses this boundary; the route's only
 * job is to be same-origin (assets.meshy.ai sends no CORS headers).
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "../../../app/api/meshy-asset/route";

const SIGNED_URL =
  "https://assets.meshy.ai/uid/tasks/task-1/output/model.glb?Expires=123&Signature=s~g__&Key-Pair-Id=K1";

function makeRequest(assetUrl: string | null) {
  const base = "http://localhost/api/meshy-asset";
  const url = assetUrl === null ? base : `${base}?url=${encodeURIComponent(assetUrl)}`;
  return GET(new Request(url));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("meshy asset proxy route", () => {
  it("streams an allowlisted asset through with its content type and length", async () => {
    const body = new Uint8Array([0x67, 0x6c, 0x54, 0x46]); // "glTF"
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(body, {
        status: 200,
        headers: { "Content-Type": "application/octet-stream", "Content-Length": "4" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await makeRequest(SIGNED_URL);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(SIGNED_URL);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/octet-stream");
    // Forwarded so the browser download UI gets a real size/progress bar.
    expect(response.headers.get("content-length")).toBe("4");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(body);
  });

  it("refuses to follow upstream redirects — the allowlist must hold for every hop", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, { status: 302, headers: { Location: "https://evil.com/x" } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await makeRequest(SIGNED_URL);

    expect(fetchMock.mock.calls[0][1]).toMatchObject({ redirect: "manual" });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ proxyError: "url not allowed" });
  });

  it("marks successful responses immutable — the signed URL never changes content", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(new Uint8Array([1]), { status: 200 })),
    );

    const response = await makeRequest(SIGNED_URL);

    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=31536000, immutable",
    );
  });

  it("rejects a missing url param with 400 and never forwards", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await makeRequest(null);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ proxyError: "url not allowed" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects non-Meshy hosts and non-https schemes and never forwards", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    for (const bad of [
      "https://evil.com/model.glb",
      "https://assets.meshy.ai.attacker.com/model.glb",
      "http://assets.meshy.ai/model.glb",
      "file:///etc/passwd",
      "not a url",
    ]) {
      const response = await makeRequest(bad);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ proxyError: "url not allowed" });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("passes upstream failure statuses through uncached (expired signature → 403)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("AccessDenied", { status: 403 })),
    );

    const response = await makeRequest(SIGNED_URL);

    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("returns 502 { proxyError } on network failure, logging neither signature nor Meshy user id", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await makeRequest(SIGNED_URL);

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ proxyError: "upstream network failure" });
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const logged = errorSpy.mock.calls[0].map(String).join(" ");
    expect(logged).toContain("output/model.glb"); // enough to identify the asset kind
    expect(logged).not.toContain("/uid/"); // account id stays out of logs
    expect(logged).not.toContain("Signature");
  });
});
