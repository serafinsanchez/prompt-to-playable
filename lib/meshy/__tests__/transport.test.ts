import { describe, expect, it } from "vitest";

import {
  MeshyApiError,
  NoMoreConcurrentTasksError,
  RateLimitExceededError,
} from "../types";
import { createBrowserTransport, createDirectTransport, type FetchLike } from "../transport";

interface FetchCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

interface StubResponse {
  status?: number;
  body?: unknown;
  /** Raw text override for non-JSON bodies (e.g. an HTML gateway error). */
  text?: string;
}

function stubFetch(responses: StubResponse[]): { fetchImpl: FetchLike; calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  const queue = [...responses];
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url, method: init.method, headers: init.headers, body: init.body });
    const next = queue.shift();
    if (!next) throw new Error("stub fetch exhausted");
    const status = next.status ?? 200;
    const text = next.text ?? JSON.stringify(next.body ?? null);
    return { ok: status >= 200 && status < 300, status, text: async () => text };
  };
  return { fetchImpl, calls };
}

describe("createBrowserTransport", () => {
  it("POSTs through the proxy with the x-meshy-key header and a JSON body", async () => {
    const { fetchImpl, calls } = stubFetch([{ body: { result: "preview-0001" } }]);
    const transport = createBrowserTransport({ getKey: () => "msy_test_key", fetchImpl });

    const json = await transport("/openapi/v2/text-to-3d", {
      method: "POST",
      body: { mode: "preview", prompt: "a knight" },
    });

    expect(json).toEqual({ result: "preview-0001" });
    expect(calls[0]!.url).toBe("/api/meshy/openapi/v2/text-to-3d");
    expect(calls[0]!.method).toBe("POST");
    expect(calls[0]!.headers["x-meshy-key"]).toBe("msy_test_key");
    expect(calls[0]!.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(calls[0]!.body!)).toEqual({ mode: "preview", prompt: "a knight" });
  });

  it("reads the key at call time, not at construction time", async () => {
    const { fetchImpl, calls } = stubFetch([{ body: {} }, { body: {} }]);
    let key = "first-key";
    const transport = createBrowserTransport({ getKey: () => key, fetchImpl });

    await transport("/openapi/v1/balance");
    key = "second-key";
    await transport("/openapi/v1/balance");

    expect(calls[0]!.headers["x-meshy-key"]).toBe("first-key");
    expect(calls[1]!.headers["x-meshy-key"]).toBe("second-key");
  });

  it("defaults to GET with no body", async () => {
    const { fetchImpl, calls } = stubFetch([{ body: { balance: 500 } }]);
    const transport = createBrowserTransport({ getKey: () => "k", fetchImpl });

    const json = await transport("/openapi/v1/balance");

    expect(json).toEqual({ balance: 500 });
    expect(calls[0]!.method).toBe("GET");
    expect(calls[0]!.body).toBeUndefined();
  });
});

describe("createDirectTransport", () => {
  it("calls api.meshy.ai with a Bearer Authorization header", async () => {
    const { fetchImpl, calls } = stubFetch([{ body: { balance: 240 } }]);
    const transport = createDirectTransport({ apiKey: "msy_live_key", fetchImpl });

    const json = await transport("/openapi/v1/balance");

    expect(json).toEqual({ balance: 240 });
    expect(calls[0]!.url).toBe("https://api.meshy.ai/openapi/v1/balance");
    expect(calls[0]!.headers["Authorization"]).toBe("Bearer msy_live_key");
  });
});

describe("error mapping (shared by both transports)", () => {
  const make = (responses: StubResponse[]) => {
    const { fetchImpl } = stubFetch(responses);
    return createDirectTransport({ apiKey: "k", fetchImpl });
  };

  it("throws RateLimitExceededError on a 429 with code RateLimitExceeded", async () => {
    const transport = make([
      { status: 429, body: { code: "RateLimitExceeded", message: "slow down" } },
    ]);

    const error = await transport("/openapi/v1/balance").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(RateLimitExceededError);
    expect(error).toBeInstanceOf(MeshyApiError);
    expect((error as RateLimitExceededError).message).toMatch(/slow down/);
  });

  it("throws NoMoreConcurrentTasksError on a 429 with code NoMoreConcurrentTasks", async () => {
    const transport = make([
      { status: 429, body: { code: "NoMoreConcurrentTasks", message: "queue full" } },
    ]);

    const error = await transport("/openapi/v2/text-to-3d", { method: "POST" }).catch(
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(NoMoreConcurrentTasksError);
    expect(error).not.toBeInstanceOf(RateLimitExceededError);
  });

  it("throws MeshyApiError with status, code, and message on other failures", async () => {
    const transport = make([
      { status: 402, body: { code: "InsufficientCredits", message: "no credits" } },
    ]);

    const error = await transport("/openapi/v1/rigging", { method: "POST" }).catch(
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(MeshyApiError);
    expect((error as MeshyApiError).status).toBe(402);
    expect((error as MeshyApiError).code).toBe("InsufficientCredits");
    expect((error as MeshyApiError).message).toMatch(/no credits/);
  });

  it("survives a non-JSON error body", async () => {
    const transport = make([{ status: 502, text: "<html>502 Bad Gateway</html>" }]);

    const error = await transport("/openapi/v1/balance").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(MeshyApiError);
    expect((error as MeshyApiError).status).toBe(502);
    expect((error as MeshyApiError).code).toBeNull();
    expect((error as MeshyApiError).message).toMatch(/502 Bad Gateway/);
  });
});
