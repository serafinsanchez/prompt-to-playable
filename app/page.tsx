"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { DEFAULT_CHARACTER } from "@/components/scene/default-character";
import { MOVEMENT_KEY_CODES } from "@/components/scene/controls";
import { Playground } from "@/components/scene/playground";

const HINT_STORAGE_KEY = "ptp-hint-dismissed";

const HINT_KEYS: Array<[keys: string, does: string]> = [
  ["wasd", "walk"],
  ["shift", "run"],
  ["space", "jump"],
  ["e", "wave"],
];

/**
 * The 15-second bet (PRD metric): no instructions, one mono line that
 * fades on first movement and stays gone for the session.
 */
const noopSubscribe = () => () => {};

function ControlHint() {
  // Server snapshot says "seen" so returning visitors never get a flash.
  const seenThisSession = useSyncExternalStore(
    noopSubscribe,
    () => sessionStorage.getItem(HINT_STORAGE_KEY) !== null,
    () => true,
  );
  const [phase, setPhase] = useState<"shown" | "fading" | "gone">("shown");

  useEffect(() => {
    if (seenThisSession || phase !== "shown") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!MOVEMENT_KEY_CODES.has(event.code)) return;
      sessionStorage.setItem(HINT_STORAGE_KEY, "1");
      setPhase("fading");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [seenThisSession, phase]);

  useEffect(() => {
    if (phase !== "fading") return;
    const timer = setTimeout(() => setPhase("gone"), 260);
    return () => clearTimeout(timer);
  }, [phase]);

  if (seenThisSession || phase === "gone") return null;

  return (
    <div
      data-testid="control-hint"
      className={`pointer-events-none absolute inset-x-0 bottom-4 flex justify-center transition-opacity duration-(--duration-normal) ease-(--ease-stage) starting:opacity-0 motion-reduce:transition-none sm:bottom-8 ${
        phase === "shown" ? "opacity-100" : "opacity-0"
      }`}
    >
      <p className="flex flex-wrap items-baseline justify-center gap-x-4 gap-y-2 rounded-md bg-background/60 px-4 py-3 font-mono text-xs uppercase tracking-caps">
        {HINT_KEYS.map(([keys, does]) => (
          <span key={keys} className="flex items-baseline gap-x-2">
            <kbd className="rounded-sm border border-border bg-surface/80 px-2 py-1 font-mono text-foreground">
              {keys}
            </kbd>
            <span className="text-muted">{does}</span>
          </span>
        ))}
      </p>
    </div>
  );
}

export default function Home() {
  return (
    <main className="relative h-dvh w-full overflow-hidden">
      <Playground character={DEFAULT_CHARACTER} />

      {/* Thin overlay chrome — the scene is the hero (DESIGN.md). */}
      <header className="pointer-events-none absolute inset-x-0 top-0">
        <div className="mx-auto flex max-w-7xl flex-wrap items-baseline justify-between gap-x-6 gap-y-2 px-6 pt-6">
          <h1 className="font-display text-md font-extrabold tracking-display">
            Prompt to Playable
          </h1>
          <p className="font-mono text-xs uppercase tracking-caps text-muted">
            Type a character. Play it.
          </p>
        </div>
      </header>

      <ControlHint />
    </main>
  );
}
