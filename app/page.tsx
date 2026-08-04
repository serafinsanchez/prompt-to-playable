"use client";

import { LivePipeline } from "@/components/pipeline/live-pipeline";
import { DEFAULT_CHARACTER } from "@/components/scene/default-character";
import { Playground } from "@/components/scene/playground";

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

      {/* --- US-03a: live pipeline (key entry, prompt, minimal stage list) --- */}
      <LivePipeline />
      {/* --- end US-03a --- */}
    </main>
  );
}
