/**
 * Meshy asset URLs (assets.meshy.ai) carry their auth in the signed query but
 * send no CORS headers, so browser-side loaders (thumbnails, the play
 * swap-in, fetch-based downloads) cannot touch them directly. Every asset URL
 * is rewritten to the same-origin `/api/meshy-asset` passthrough the moment
 * it enters app state; anything else — gallery paths, fixtures — passes
 * through untouched. Isomorphic and idempotent.
 */

export const ASSET_PROXY_PATH = "/api/meshy-asset";

export const MESHY_ASSET_HOST = "assets.meshy.ai";

export function proxiedAssetUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url; // relative path — already same-origin
  }
  if (parsed.protocol !== "https:" || parsed.hostname !== MESHY_ASSET_HOST) return url;
  return `${ASSET_PROXY_PATH}?url=${encodeURIComponent(url)}`;
}
