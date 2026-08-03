/**
 * Unit tests for the Meshy passthrough proxy route
 * (`app/api/meshy/[...path]/route.ts`) with a mocked global fetch.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { DELETE, GET, POST } from "../../../app/api/meshy/[...path]/route";

type RouteHandler = (
  request: Request,
  ctx: { params: Promise<{ path: string[] }> },
) => Promise<Response>;

const handlers: Record<string, RouteHandler> = { GET, POST, DELETE };

function makeRequest(
  url: string,
  init?: RequestInit & { method?: "GET" | "POST" | "DELETE" },
) {
  const request = new Request(url, init);
  const segments = new URL(url).pathname.replace(/^\/api\/meshy\//, "").split("/");
  const handler = handlers[init?.method ?? "GET"];
  return handler(request, { params: Promise.resolve({ path: segments }) });
}

function upstreamResponse(body: unknown, status = 200) {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("meshy proxy route", () => {
  it("rejects non-allowlisted paths with 404 and never forwards", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await makeRequest("http://localhost/api/meshy/evil.com/x", {
      headers: { "x-meshy-key": "msy_test" },
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ proxyError: "path not allowed" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a missing x-meshy-key with a clean 401 and never forwards", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await makeRequest(
      "http://localhost/api/meshy/openapi/v2/text-to-3d",
      { method: "POST", body: JSON.stringify({ prompt: "knight" }) },
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ proxyError: "missing key" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rewrites x-meshy-key to Authorization, strips it, and preserves path + query + body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(upstreamResponse({ result: "task-1" }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await makeRequest(
      "http://localhost/api/meshy/openapi/v2/text-to-3d?page_size=10",
      {
        method: "POST",
        headers: {
          "x-meshy-key": "msy_test",
          "Content-Type": "application/json",
          Cookie: "tracking=abc",
        },
        body: JSON.stringify({ prompt: "knight" }),
      },
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.meshy.ai/openapi/v2/text-to-3d?page_size=10");
    const headers = new Headers(init.headers);
    expect(headers.get("authorization")).toBe("Bearer msy_test");
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.get("x-meshy-key")).toBeNull();
    expect(headers.get("cookie")).toBeNull();
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ prompt: "knight" }));
    expect(await response.json()).toEqual({ result: "task-1" });
  });

  it("passes Meshy error bodies and statuses through untouched — no proxyError wrap", async () => {
    const meshyError = { code: "PaymentRequired", message: "Not enough credits" };
    const fetchMock = vi.fn().mockResolvedValue(upstreamResponse(meshyError, 402));
    vi.stubGlobal("fetch", fetchMock);

    const response = await makeRequest(
      "http://localhost/api/meshy/openapi/v2/text-to-3d",
      {
        method: "POST",
        headers: { "x-meshy-key": "msy_test" },
        body: JSON.stringify({ prompt: "knight" }),
      },
    );

    expect(response.status).toBe(402);
    expect(await response.json()).toEqual(meshyError);
  });

  it("sets Cache-Control: no-store on every response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(upstreamResponse({ result: "ok" }));
    vi.stubGlobal("fetch", fetchMock);

    const proxied = await makeRequest(
      "http://localhost/api/meshy/openapi/v1/retexture/task-1",
      { headers: { "x-meshy-key": "msy_test" } },
    );
    const rejected = await makeRequest("http://localhost/api/meshy/nope", {
      headers: { "x-meshy-key": "msy_test" },
    });
    const unauthorized = await makeRequest(
      "http://localhost/api/meshy/openapi/v1/retexture/task-1",
    );

    expect(proxied.headers.get("cache-control")).toBe("no-store");
    expect(rejected.headers.get("cache-control")).toBe("no-store");
    expect(unauthorized.headers.get("cache-control")).toBe("no-store");
  });

  it("supports DELETE passthrough", async () => {
    const fetchMock = vi.fn().mockResolvedValue(upstreamResponse(null, 204));
    vi.stubGlobal("fetch", fetchMock);

    const response = await makeRequest(
      "http://localhost/api/meshy/openapi/v2/text-to-3d/task-1",
      { method: "DELETE", headers: { "x-meshy-key": "msy_test" } },
    );

    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://api.meshy.ai/openapi/v2/text-to-3d/task-1",
    );
    expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe("DELETE");
    expect(response.status).toBe(204);
  });

  it("passes null-body statuses (205, 304) through without throwing", async () => {
    for (const status of [205, 304]) {
      const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status }));
      vi.stubGlobal("fetch", fetchMock);

      const response = await makeRequest(
        "http://localhost/api/meshy/openapi/v2/text-to-3d/task-1",
        { headers: { "x-meshy-key": "msy_test" } },
      );

      expect(response.status).toBe(status);
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
  });

  it("returns 502 { proxyError } on network failure and logs path + no secrets", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    vi.stubGlobal("fetch", fetchMock);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await makeRequest(
      "http://localhost/api/meshy/openapi/v2/text-to-3d",
      {
        method: "POST",
        headers: { "x-meshy-key": "msy_secret_key" },
        body: JSON.stringify({ prompt: "knight" }),
      },
    );

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ proxyError: "upstream network failure" });
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const logged = errorSpy.mock.calls[0].map(String).join(" ");
    expect(logged).toContain("openapi/v2/text-to-3d");
    expect(logged).not.toContain("msy_secret_key");
  });
});
