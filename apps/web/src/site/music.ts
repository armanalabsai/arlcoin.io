// The website's background music: played quietly from `start` and looped between `start` and
// `end` (seconds) without a gap, for the whole visit. Web Audio loops a decoded buffer sample-exact;
// an <audio> element would jump audibly at the loop point. Browsers allow sound only after the
// visitor interacts with the page, so playback starts on the first click, tap or key press,
// unless the visitor turned the music off, which is remembered in this browser.

import { withBase } from "@/core/basePath.ts";

export const MUSIC = {
  /** An original piece written for ARL (scripts/generate-ambient.py); no third-party recording. */
  src: "/audio/arl-ambient.mp3",
  /** 0:45 to 1:50: the file is rendered so that 1:50 continues exactly as 0:45. */
  start: 45,
  end: 110,
  volume: 0.08,
} as const;

const STORAGE_KEY = "arl-music";

type Listener = () => void;

let ctx: AudioContext | null = null;
let gain: GainNode | null = null;
let source: AudioBufferSourceNode | null = null;
let bytes: Promise<ArrayBuffer> | null = null;
let buffer: Promise<AudioBuffer> | null = null;
const listeners = new Set<Listener>();

function notify() {
  for (const l of listeners) l();
}

/** Starts downloading the file, so the first interaction only has to decode and play. */
export function preload(): void {
  bytes ??= fetch(withBase(MUSIC.src)).then((r) => {
    if (!r.ok) throw new Error(`music: ${String(r.status)}`);
    return r.arrayBuffer();
  });
}

function context(): AudioContext {
  if (ctx) return ctx;
  const c = new AudioContext();
  const g = c.createGain();
  g.gain.value = MUSIC.volume;
  g.connect(c.destination);
  c.addEventListener("statechange", notify);
  ctx = c;
  gain = g;
  return c;
}

function decoded(c: AudioContext): Promise<AudioBuffer> {
  preload();
  buffer ??= (bytes as Promise<ArrayBuffer>).then((b) => c.decodeAudioData(b));
  return buffer;
}

export function isPlaying(): boolean {
  return ctx !== null && source !== null && ctx.state === "running";
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

/**
 * Starts (or resumes) the music. Call it from an interaction handler: the context is resumed
 * before anything is awaited, which Safari requires. Resolves false when the browser keeps the
 * sound blocked (no interaction yet) or the file cannot be played.
 */
export async function play(): Promise<boolean> {
  const c = context();
  const resumed = c.resume();
  try {
    await resumed;
    if (c.state !== "running") return false;
    if (!source) {
      const b = await decoded(c);
      if (source) return true;
      const s = c.createBufferSource();
      s.buffer = b;
      s.loop = true;
      s.loopStart = MUSIC.start;
      s.loopEnd = Math.min(MUSIC.end, b.duration);
      s.connect(gain as GainNode);
      s.start(0, MUSIC.start);
      source = s;
      notify();
    }
    return true;
  } catch {
    return false;
  }
}

export function setMusic(on: boolean): void {
  remember(on);
  if (on) void play();
  else void ctx?.suspend();
}
