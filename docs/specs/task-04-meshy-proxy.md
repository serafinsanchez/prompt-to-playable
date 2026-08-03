# TASK-04: Meshy passthrough proxy (`app/api/meshy/[...path]`)

**kind:** backend

## TASK

Implement the path-allowlisted passthrough proxy that lets the browser reach the Meshy API with the visitor's own key, storing and logging nothing.

## DEPENDENCIES

- P0 #1
- P0 #2

## FILES TOUCHED

- `app/api/meshy/[...path]/route.ts`
- `app/api/meshy/__tests__/` (or `lib/meshy/__tests__/proxy.test.ts`)

## CONTEXT

- Rationale and rules: `docs/ARCHITECTURE.md` §3 (proxy mirrors Meshy's real REST paths — no invented surface; ~30 lines is the right size) and §4 key handling (client sends `x-meshy-key`; proxy rewrites to `Authorization: Bearer`; never stored, never logged, never in URLs).
- Meshy blocks browser CORS by design (`../claude-code-resources/MESHY_CLAUDE.md`) — this proxy is the only server-side code in the product.
- Test-mode key for live smoke: `msy_dummy_api_key_for_test_mode_12345678` (zero credits consumed).
- The browser transport built in TASK-03 (`lib/meshy/transport.ts`) is the intended caller — its path/header contract is the interface to honor.

## REQUIREMENTS

1. Handle `GET`, `POST`, `DELETE` on `/api/meshy/[...path]`, forwarding to `https://api.meshy.ai/<path>` with query string preserved.
2. Allowlist: forward only paths starting with `openapi/v1/` or `openapi/v2/`; anything else → 404 with `{ proxyError: "path not allowed" }`. This is what keeps the route from being an open relay.
3. Missing `x-meshy-key` header → 401 `{ proxyError: "missing key" }`. Present → rewrite to `Authorization: Bearer <key>`; strip `x-meshy-key` from the forwarded request.
4. Meshy responses (success AND error, any status) pass through body-and-status untouched; `Cache-Control: no-store` on everything.
5. `{ proxyError }` envelope appears ONLY for the proxy's own failures (allowlist, missing key, network failure to Meshy). Never wrap Meshy's own error bodies.
6. No logging of the key, the Authorization header, or request bodies. A `console.error` on proxy-level network failure may log path + status only.
7. Unit tests with a mocked `fetch`: allowlist rejection, missing-key 401, header rewrite + strip, error passthrough (e.g. Meshy 402/429 body arrives intact), no-store header present.

## CONSTRAINTS

- Do NOT add rate limiting, caching, retries, or request transformation — dumb passthrough by architectural decision (`docs/ARCHITECTURE.md` Trade-off log 2026-08-03).
- Do NOT touch `lib/meshy/` beyond reading the transport contract, and do NOT build UI.
- Do NOT install new packages.

## ACCEPTANCE CRITERIA

- [ ] `npx tsc --noEmit` passes
- [ ] `npm run test` passes; proxy unit tests exist and are green
- [ ] Live smoke: with the test-mode key, a text-to-3d task POSTed through the local proxy returns a task id and its GET polls to a terminal state (script or manual curl transcript in the PR/commit message)
- [ ] Non-Meshy path (e.g. `/api/meshy/evil.com/x`) rejected; missing key returns clean 401

## DONE DEFINITION

Mark P0 #3 `[x]` in `docs/backlog/phase-0-foundation.md`.
