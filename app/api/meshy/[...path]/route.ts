/**
 * Meshy passthrough proxy. The browser cannot call api.meshy.ai directly
 * (CORS-blocked by design), so this route forwards allowlisted Meshy REST
 * paths verbatim, rewriting the visitor's `x-meshy-key` header to
 * `Authorization: Bearer`. The key is never stored, never logged, never in a
 * URL. Meshy's own responses — success and error alike — pass through
 * body-and-status untouched; `{ proxyError }` marks only this proxy's own
 * failures. Dumb passthrough by architectural decision: no rate limiting,
 * caching, retries, or request transformation (ARCHITECTURE.md §3).
 */

const MESHY_API_BASE_URL = "https://api.meshy.ai";
const NO_STORE = { "Cache-Control": "no-store" };

function proxyError(message: string, status: number): Response {
  return Response.json({ proxyError: message }, { status, headers: NO_STORE });
}

async function proxy(
  request: Request,
  ctx: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const path = (await ctx.params).path.join("/");
  if (!path.startsWith("openapi/v1/") && !path.startsWith("openapi/v2/")) {
    return proxyError("path not allowed", 404);
  }

  const key = request.headers.get("x-meshy-key");
  if (!key) return proxyError("missing key", 401);

  // Meshy needs exactly these two headers; nothing else crosses the boundary.
  const headers: Record<string, string> = { Authorization: `Bearer ${key}` };
  const contentType = request.headers.get("content-type");
  if (contentType) headers["Content-Type"] = contentType;

  let upstream: Response;
  try {
    upstream = await fetch(`${MESHY_API_BASE_URL}/${path}${new URL(request.url).search}`, {
      method: request.method,
      headers,
      ...(request.method === "GET" ? {} : { body: await request.text() }),
    });
  } catch {
    console.error(`[meshy-proxy] network failure reaching Meshy: ${path}`);
    return proxyError("upstream network failure", 502);
  }

  // upstream.body is already null for null-body statuses (204/205/304), so
  // streaming it through is correct for every status — no buffering.
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "application/json",
      ...NO_STORE,
    },
  });
}

export { proxy as GET, proxy as POST, proxy as DELETE };
