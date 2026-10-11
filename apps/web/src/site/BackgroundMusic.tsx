"use client";

import { useEffect } from "react";

import { musicOff, play, preload, savePosition } from "./music.ts";

// Mounted once in the root layout. Downloads the music right away and starts it on the visitor's
// first interaction: browsers (Safari above all) unlock sound only inside a click, tap or key
// handler. iOS counts touchend and click, not touchstart, so all of them are listened to; the
// listeners stay until the music actually runs.
const EVENTS = ["pointerdown", "touchend", "click", "keydown"] as const;

export function BackgroundMusic() {
  useEffect(() => {
    window.addEventListener("pagehide", savePosition);
    return () => window.removeEventListener("pagehide", savePosition);
  }, []);

  useEffect(() => {
    if (musicOff()) return;
    preload();
    let armed = true;
    const disarm = () => {
      if (!armed) return;
      armed = false;
      for (const e of EVENTS) window.removeEventListener(e, start, true);
    };
    function start() {
      if (musicOff()) return disarm();
      void play().then((ok) => {
        if (ok) disarm();
      });
    }
    for (const e of EVENTS) window.addEventListener(e, start, { capture: true, passive: true });
    return disarm;
  }, []);
  return null;
}
