"use client";

import { useEffect } from "react";

import { musicOff, play } from "./music.ts";

// Mounted once in the root layout. Tries to start the music, and if the browser asks for an
// interaction first, starts it on the visitor's first click, tap or key press.
const EVENTS = ["pointerdown", "keydown", "touchstart"] as const;

export function BackgroundMusic() {
  useEffect(() => {
    if (musicOff()) return;
    let armed = false;
    const start = () => {
      disarm();
      if (!musicOff()) void play();
    };
    const disarm = () => {
      if (!armed) return;
      armed = false;
      for (const e of EVENTS) window.removeEventListener(e, start, true);
    };
    void play().then((ok) => {
      if (ok) return;
      armed = true;
      for (const e of EVENTS) window.addEventListener(e, start, { capture: true, passive: true });
    });
    return disarm;
  }, []);
  return null;
}
