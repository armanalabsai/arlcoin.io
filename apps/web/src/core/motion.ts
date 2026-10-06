import type { Transition } from "motion/react";

// Motion presets. Springs are critically damped or close to it: the interface
// settles without visible bounce. Durations stay short so interaction never
// waits on animation.

export const SPRING_ORBIT: Transition = { type: "spring", stiffness: 260, damping: 32, mass: 0.9 };
export const SPRING_SURFACE: Transition = { type: "spring", stiffness: 340, damping: 36, mass: 1 };
export const SPRING_SHEET: Transition = { type: "spring", stiffness: 380, damping: 40, mass: 1 };
export const FADE_FAST: Transition = { duration: 0.16, ease: [0.22, 1, 0.36, 1] };
export const INSTANT: Transition = { duration: 0 };

/** Delay between cards when a layer expands, in seconds. */
export const STAGGER = 0.025;
