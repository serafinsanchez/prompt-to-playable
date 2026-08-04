"use client";

/**
 * Error boundary for the on-stage character (US-05 hardening). A character
 * GLB that fails to load — expired signed URL, network drop — throws through
 * Suspense during render; without a boundary that unmounts the whole app
 * ("This page couldn't load"). Instead: render an empty stage, tell the page
 * so it can hand the stage back to the gallery. Parents key this by the
 * character's rig URL, so a source swap remounts it clean.
 */

import { Component, type ReactNode } from "react";

interface CharacterBoundaryProps {
  children: ReactNode;
  /** Notified once per failure — the page releases the failed character. */
  onError?: (error: Error) => void;
}

export class CharacterBoundary extends Component<
  CharacterBoundaryProps,
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: Error): void {
    console.error("[character-boundary] character failed to load:", error.message);
    this.props.onError?.(error);
  }

  render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}
