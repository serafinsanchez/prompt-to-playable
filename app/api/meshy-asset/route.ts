/**
 * Meshy asset passthrough. assets.meshy.ai serves signed GLB URLs with no
 * CORS headers, so browser-side loaders (thumbnails, the play swap-in) can
 * never fetch them cross-origin — this route makes them same-origin. The
 * signed query is the auth: no key, no headers cross the boundary. Only
 * https://assets.meshy.ai is reachable, on every hop — redirects are refused
 * so the allowlist can't be escaped via a 3xx (SSRF guard). Success
 * responses are immutable — a signed URL's content never changes — so
 * browser + CDN caches absorb the repeat loads (thumbnail, then stage swap,
 * then download); that deliberately outlives the ~3-day signature, which is
 * fine because only a caller already holding the capability can seed or hit
 * the cache key. Disallowed targets get 400 (bad query param), unlike the
 * REST proxy's 404 (unrouted path) — different failure, different code.
 */

import { MESHY_ASSET_HOST } from "../../../lib/meshy/assets";

/** A single request may stream a ~22MB refine GLB — give it room. */
export const maxDuration = 60;

const NO_STORE = { "Cache-Control": "no-store" };
const IMMUTABLE = { "Cache-Control": "public, max-age=31536000, immutable" };

function proxyError(message: string, status: number): Response {
  return Response.json({ proxyError: message }, { status, headers: NO_STORE });
}

export async function GET(request: Request): Promise<Response> {
  const raw = new URL(request.url).searchParams.get("url");
  let target: URL;
  try {
    target = new URL(raw ?? "");
  } catch {
    return proxyError("url not allowed", 400);
  }
  if (target.protocol !== "https:" || target.hostname !== MESHY_ASSET_HOST) {
    return proxyError("url not allowed", 400);
  }

  let upstream: Response;
  try {
    upstream = await fetch(target.href, { redirect: "manual" });
  } catch {
    // Last two path segments only: the signed query is a bearer capability
    // and the first segment is the Meshy account id — both stay out of logs.
    const suffix = target.pathname.split("/").slice(-2).join("/");
    console.error(`[meshy-asset-proxy] network failure reaching …/${suffix}`);
    return proxyError("upstream network failure", 502);
  }

  // Real asset URLs never redirect; a 3xx would carry the body off-allowlist.
  if (upstream.status >= 300 && upstream.status < 400) {
    return proxyError("url not allowed", 400);
  }

  const headers: Record<string, string> = {
    "Content-Type": upstream.headers.get("content-type") ?? "application/octet-stream",
    ...(upstream.ok ? IMMUTABLE : NO_STORE),
  };
  // Size for the browser's download UI. Content-Encoding is deliberately NOT
  // forwarded: fetch already decoded the body, so echoing it would corrupt.
  const contentLength = upstream.headers.get("content-length");
  if (contentLength !== null) headers["Content-Length"] = contentLength;

  return new Response(upstream.body, { status: upstream.status, headers });
}
