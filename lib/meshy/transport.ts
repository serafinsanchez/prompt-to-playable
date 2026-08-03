/**
 * Transport layer: resolve a Meshy REST path to parsed JSON, or throw a typed
 * error. Two implementations of one minimal interface:
 *
 * - browser: calls the same-origin passthrough proxy (`/api/meshy/*`) with the
 *   visitor's key in `x-meshy-key` (the proxy rewrites it to a Bearer header).
 * - direct: calls `https://api.meshy.ai/*` with `Authorization: Bearer` — for
 *   Node contexts like scripts/pregen/ where CORS doesn't apply.
 *
 * Isomorphic: fetch is injectable; the default is globalThis.fetch (present in
 * both browsers and Node 18+). No window/process access.
 */

import {
  MeshyApiError,
  NoMoreConcurrentTasksError,
  RateLimitExceededError,
} from "./types";

export interface TransportInit {
  method?: "GET" | "POST" | "DELETE";
  body?: unknown;
}

/** Minimal request surface the client and tests program against. */
export type MeshyTransport = (path: string, init?: TransportInit) => Promise<unknown>;

/** Structural subset of fetch so tests can stub it without Response objects. */
export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string },
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

export interface BrowserTransportOptions {
  /** Read the visitor's key at call time (React state / sessionStorage owner). */
  getKey: () => string;
  /** Proxy mount point; defaults to the app's passthrough route. */
  basePath?: string;
  fetchImpl?: FetchLike;
}

export interface DirectTransportOptions {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: FetchLike;
}

export const MESHY_API_BASE_URL = "https://api.meshy.ai";
export const PROXY_BASE_PATH = "/api/meshy";

export function createBrowserTransport(options: BrowserTransportOptions): MeshyTransport {
  const { getKey, basePath = PROXY_BASE_PATH, fetchImpl = defaultFetch() } = options;
  return (path, init) =>
    send(fetchImpl, `${basePath}${path}`, { "x-meshy-key": getKey() }, init);
}

export function createDirectTransport(options: DirectTransportOptions): MeshyTransport {
  const { apiKey, baseUrl = MESHY_API_BASE_URL, fetchImpl = defaultFetch() } = options;
  return (path, init) =>
    send(fetchImpl, `${baseUrl}${path}`, { Authorization: `Bearer ${apiKey}` }, init);
}

function defaultFetch(): FetchLike {
  return globalThis.fetch.bind(globalThis) as FetchLike;
}

async function send(
  fetchImpl: FetchLike,
  url: string,
  authHeaders: Record<string, string>,
  init?: TransportInit,
): Promise<unknown> {
  const response = await fetchImpl(url, {
    method: init?.method ?? "GET",
    headers: { "Content-Type": "application/json", ...authHeaders },
    ...(init?.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });

  const text = await response.text();
  const json = parseJson(text);
  if (response.ok) return json;

  const code = readString(json, "code");
  const message = readString(json, "message") ?? text;
  if (response.status === 429 && code === "NoMoreConcurrentTasks") {
    throw new NoMoreConcurrentTasksError(message);
  }
  if (response.status === 429) {
    throw new RateLimitExceededError(message);
  }
  throw new MeshyApiError(response.status, code, message);
}

function parseJson(text: string): unknown {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

function readString(json: unknown, key: "code" | "message"): string | null {
  if (typeof json !== "object" || json === null) return null;
  const value = (json as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}
