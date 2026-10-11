"use client";

import { useSyncExternalStore } from "react";

import { isPlaying, setMusic, subscribe } from "./music.ts";

// Header button that turns the background music on or off (WCAG 1.4.2: sound that plays on its
// own can be stopped). The choice is remembered in this browser.
export function MusicToggle() {
  const playing = useSyncExternalStore(subscribe, isPlaying, () => false);

  const label = playing ? "Turn the music off" : "Turn the music on";
  return (
    <button
      type="button"
      onClick={() => setMusic(!playing)}
      aria-pressed={playing}
      aria-label={label}
      title={label}
      className="inline-flex min-h-11 min-w-11 items-center justify-center text-fg-muted transition-colors hover:text-fg"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        width="18"
        height="18"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
        {playing ? (
          <>
            <path d="M15.5 9a4.5 4.5 0 0 1 0 6" />
            <path d="M18 6.5a8 8 0 0 1 0 11" />
          </>
        ) : (
          <path d="M16 9.5l5 5M21 9.5l-5 5" />
        )}
      </svg>
    </button>
  );
}
