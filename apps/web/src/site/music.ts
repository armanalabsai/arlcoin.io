// The website's background music: one audio element for the whole visit, played quietly in a
// loop between `start` and `end` (seconds). Browsers allow sound only after the visitor interacts
// with the page, so playback starts on the first click, tap or key press, unless the visitor
// turned the music off, which is remembered in this browser.

import { withBase } from "@/core/basePath.ts";

export const MUSIC = {
  /** An original piece written for ARL (scripts/generate-ambient.py); no third-party recording. */
  src: "/audio/arl-ambient.mp3",
  start: 0,
  end: 65,
  volume: 0.15,
} as const;

const STORAGE_KEY = "arl-music";

type Listener = () => void;

let audio: HTMLAudioElement | null = null;
const listeners = new Set<Listener>();

function element(): HTMLAudioElement {
  if (audio) return audio;
  const a = new Audio(withBase(MUSIC.src));
  a.preload = "auto";
  a.volume = MUSIC.volume;
  // The whole file is the loop: let the browser loop it without a gap.
  a.loop = MUSIC.start === 0;
  a.addEventListener("loadedmetadata", () => {
    if (a.currentTime < MUSIC.start) a.currentTime = MUSIC.start;
  });
  a.addEventListener("timeupdate", () => {
    if (!a.loop && a.currentTime >= MUSIC.end) a.currentTime = MUSIC.start;
  });
  a.addEventListener("ended", () => {
    a.currentTime = MUSIC.start;
    void a.play().catch(() => undefined);
  });
  a.addEventListener("play", () => notify());
  a.addEventListener("pause", () => notify());
  audio = a;
  return a;
}

function notify() {
  for (const l of listeners) l();
}

export function isPlaying(): boolean {
  return audio !== null && !audio.paused;
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function musicOff(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "off";
  } catch {
    return false;
  }
}

function remember(on: boolean) {
  try {
    if (on) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, "off");
  } catch {
    // Storage blocked: the choice lasts for this page only.
  }
}

/** Starts the music; resolves false when the browser refuses (no interaction yet). */
export async function play(): Promise<boolean> {
  const a = element();
  if (a.currentTime < MUSIC.start || a.currentTime >= MUSIC.end) a.currentTime = MUSIC.start;
  try {
    await a.play();
    return true;
  } catch {
    return false;
  }
}

export function setMusic(on: boolean): void {
  remember(on);
  if (on) void play();
  else audio?.pause();
}
