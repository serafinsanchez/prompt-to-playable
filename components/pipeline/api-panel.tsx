"use client";

/**
 * US-04: the API call behind a stage, expanded inline under its rail row.
 * A build log, not a code-editor theme party: restrained mono, real paths,
 * real chained task ids from the run snapshot, one v1/v2 badge, a masked
 * key header, and a copyable curl. Data source is the descriptor map only —
 * the transport is never intercepted.
 */

import { useEffect, useRef, useState } from "react";
import type { PipelineRun, StageId } from "../../lib/meshy/types";
import {
  creditCopy,
  MASKED_KEY_HEADER,
  PROXY_CAPTION,
  stageCurl,
  stageRequest,
} from "./api-descriptor";

const COPIED_MS = 1600;

export function ApiPanel({ run, stage }: { run: PipelineRun; stage: StageId }) {
  const request = stageRequest(run, stage);
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, []);

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(stageCurl(request));
      setCopied(true);
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), COPIED_MS);
    } catch {
      // Clipboard blocked (permissions/insecure context) — leave the button
      // in its idle state; the curl is still selectable from the body text.
    }
  };

  return (
    <div
      id={`api-panel-${stage}`}
      data-testid={`api-panel-${stage}`}
      className="flex flex-col gap-2 rounded-sm border border-border bg-background p-3 font-mono text-xs transition-[opacity,translate] duration-(--duration-normal) ease-(--ease-stage) starting:-translate-y-1 starting:opacity-0 motion-reduce:transition-none"
    >
      <p className="flex flex-wrap items-baseline gap-2">
        <span className="text-foreground">
          {request.method} /api/meshy{request.path}
        </span>
        <span
          data-testid={`api-version-${stage}`}
          className={`rounded-sm border px-2 py-1 text-xs uppercase tracking-caps ${
            request.version === "v2"
              ? "border-accent text-accent"
              : "border-border text-muted"
          }`}
        >
          {request.version}
        </span>
      </p>

      <pre className="overflow-x-auto leading-relaxed text-muted">
        {JSON.stringify(request.body, null, 2)}
      </pre>

      <p className="text-muted">{MASKED_KEY_HEADER}</p>
      <p className="text-foreground">{creditCopy(run.stages[stage], stage)}</p>

      <div className="flex items-baseline gap-3">
        <button
          type="button"
          data-testid={`api-copy-${stage}`}
          onClick={() => void copy()}
          className="self-start rounded-md border border-border px-3 py-2 uppercase tracking-caps text-muted transition-transform duration-(--duration-fast) ease-(--ease-stage) hover:border-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none"
        >
          copy curl
        </button>
        {/* Inline feedback — no toast (DESIGN.md forbidden defaults). */}
        <span aria-live="polite" className="text-accent">
          {copied ? "copied." : ""}
        </span>
      </div>

      <p className="text-muted">{PROXY_CAPTION}</p>
    </div>
  );
}
