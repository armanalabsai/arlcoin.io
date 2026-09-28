"use client";

import { useEffect, useRef } from "react";

// Decorative background: a few hundred atom nuclei, each with one or two orbiting electrons.
// Nuclei drift, keep apart from each other and swirl around the pointer; a press sends a
// shock wave. Drawn on one canvas behind the content, from pre-rendered sprites.
//
// Accessibility and cost: aria-hidden, no pointer capture, capped device pixel ratio, fewer
// nuclei on small screens, paused while the tab is hidden, and a still frame (no animation)
// when the user prefers reduced motion.

interface Nucleus {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  sprite: number;
  electrons: { a: number; speed: number; orbit: number; tilt: number }[];
}

const COLORS = [
  [148, 190, 255], // cool blue
  [196, 220, 255], // pale blue-white
  [120, 160, 240], // deeper blue
  [238, 165, 63], // ARL amber, used sparingly
] as const;

const SEPARATION = 26; // px: nuclei closer than this push apart
const POINTER_RADIUS = 170;
const MAX_SPEED = 1.6;

function sprite(rgb: readonly number[], size: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  if (!g) return c;
  const h = size / 2;
  const grad = g.createRadialGradient(h, h, 0, h, h, h);
  const [r, gr, b] = rgb;
  grad.addColorStop(0, `rgba(${r},${gr},${b},0.95)`);
  grad.addColorStop(0.18, `rgba(${r},${gr},${b},0.55)`);
  grad.addColorStop(0.45, `rgba(${r},${gr},${b},0.12)`);
  grad.addColorStop(1, `rgba(${r},${gr},${b},0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return c;
}

export function NucleusField() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const sprites = COLORS.map((c) => sprite(c, 48));
    const pointer = { x: -1e4, y: -1e4, active: false };
    const waves: { x: number; y: number; t: number }[] = [];
    let nuclei: Nucleus[] = [];
    let w = 0;
    let h = 0;
    let frame = 0;

    function seed() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas!.width = Math.round(w * dpr);
      canvas!.height = Math.round(h * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.round(Math.min(320, Math.max(90, (w * h) / 5200)));
      nuclei = Array.from({ length: count }, () => {
        const amber = Math.random() < 0.08;
        return {
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.3,
          vy: (Math.random() - 0.5) * 0.3,
          r: 1 + Math.random() * 1.8,
          sprite: amber ? 3 : Math.floor(Math.random() * 3),
          electrons: Array.from({ length: Math.random() < 0.55 ? 1 : 2 }, () => ({
            a: Math.random() * Math.PI * 2,
            speed: (0.012 + Math.random() * 0.03) * (Math.random() < 0.5 ? -1 : 1),
            orbit: 5 + Math.random() * 6,
            tilt: 0.35 + Math.random() * 0.65,
          })),
        };
      });
    }

    function step() {
      // Separation between nuclei, through a coarse grid so the cost stays near linear.
      const cell = SEPARATION;
      const grid = new Map<number, number[]>();
      nuclei.forEach((n, i) => {
        const key = Math.floor(n.x / cell) * 4096 + Math.floor(n.y / cell);
        const list = grid.get(key);
        if (list) list.push(i);
        else grid.set(key, [i]);
      });
      for (let i = 0; i < nuclei.length; i++) {
        const n = nuclei[i]!;
        const cx = Math.floor(n.x / cell);
        const cy = Math.floor(n.y / cell);
        for (let gx = cx - 1; gx <= cx + 1; gx++) {
          for (let gy = cy - 1; gy <= cy + 1; gy++) {
            for (const j of grid.get(gx * 4096 + gy) ?? []) {
              if (j <= i) continue;
              const m = nuclei[j]!;
              const dx = n.x - m.x;
              const dy = n.y - m.y;
              const d2 = dx * dx + dy * dy;
              if (d2 > 0.01 && d2 < SEPARATION * SEPARATION) {
                const d = Math.sqrt(d2);
                const f = ((SEPARATION - d) / SEPARATION) * 0.04;
                n.vx += (dx / d) * f;
                n.vy += (dy / d) * f;
                m.vx -= (dx / d) * f;
                m.vy -= (dy / d) * f;
              }
            }
          }
        }
      }

      for (const n of nuclei) {
        // The pointer: a soft repulsion plus a tangential swirl, so nuclei form rings around it.
        if (pointer.active) {
          const dx = n.x - pointer.x;
          const dy = n.y - pointer.y;
          const d = Math.hypot(dx, dy);
          if (d < POINTER_RADIUS && d > 0.1) {
            const k = 1 - d / POINTER_RADIUS;
            n.vx += (dx / d) * k * 0.22 + (-dy / d) * k * 0.28;
            n.vy += (dy / d) * k * 0.22 + (dx / d) * k * 0.28;
          }
        }
        for (const wave of waves) {
          const dx = n.x - wave.x;
          const dy = n.y - wave.y;
          const d = Math.hypot(dx, dy);
          const front = wave.t * 9;
          if (Math.abs(d - front) < 28 && d > 0.1) {
            n.vx += (dx / d) * 0.9;
            n.vy += (dy / d) * 0.9;
          }
        }
        // Gentle drift and damping keep the field calm between interactions.
        n.vx = n.vx * 0.97 + (Math.random() - 0.5) * 0.02;
        n.vy = n.vy * 0.97 + (Math.random() - 0.5) * 0.02;
        const s = Math.hypot(n.vx, n.vy);
        if (s > MAX_SPEED) {
          n.vx = (n.vx / s) * MAX_SPEED;
          n.vy = (n.vy / s) * MAX_SPEED;
        }
        n.x += n.vx;
        n.y += n.vy;
        if (n.x < -20) n.x = w + 20;
        else if (n.x > w + 20) n.x = -20;
        if (n.y < -20) n.y = h + 20;
        else if (n.y > h + 20) n.y = -20;
        for (const e of n.electrons) e.a += e.speed;
      }
      for (let i = waves.length - 1; i >= 0; i--) {
        waves[i]!.t += 1;
        if (waves[i]!.t > 60) waves.splice(i, 1);
      }
    }

    function draw() {
      ctx!.clearRect(0, 0, w, h);
      ctx!.globalCompositeOperation = "lighter";
      for (const n of nuclei) {
        const size = n.r * 9;
        ctx!.drawImage(sprites[n.sprite]!, n.x - size / 2, n.y - size / 2, size, size);
      }
      ctx!.globalCompositeOperation = "source-over";
      ctx!.fillStyle = "rgba(210, 228, 255, 0.75)";
      ctx!.strokeStyle = "rgba(150, 185, 255, 0.10)";
      ctx!.lineWidth = 0.6;
      for (const n of nuclei) {
        for (const e of n.electrons) {
          ctx!.beginPath();
          ctx!.ellipse(n.x, n.y, e.orbit, e.orbit * e.tilt, e.a * 0.15, 0, Math.PI * 2);
          ctx!.stroke();
          const ex = n.x + Math.cos(e.a) * e.orbit;
          const ey = n.y + Math.sin(e.a) * e.orbit * e.tilt;
          ctx!.fillRect(ex - 0.6, ey - 0.6, 1.2, 1.2);
        }
      }
      for (const wave of waves) {
        ctx!.beginPath();
        ctx!.arc(wave.x, wave.y, wave.t * 9, 0, Math.PI * 2);
        ctx!.strokeStyle = `rgba(238, 165, 63, ${0.25 * (1 - wave.t / 60)})`;
        ctx!.lineWidth = 1;
        ctx!.stroke();
      }
    }

    function loop() {
      step();
      draw();
      frame = requestAnimationFrame(loop);
    }

    const onMove = (e: PointerEvent) => {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      pointer.active = true;
    };
    const onLeave = () => {
      pointer.active = false;
    };
    const onDown = (e: PointerEvent) => {
      if (waves.length < 4) waves.push({ x: e.clientX, y: e.clientY, t: 0 });
    };
    const onResize = () => {
      seed();
      if (reduced) draw();
    };
    const onVisibility = () => {
      cancelAnimationFrame(frame);
      if (!document.hidden && !reduced) frame = requestAnimationFrame(loop);
    };

    seed();
    window.addEventListener("resize", onResize);
    if (reduced) {
      draw();
    } else {
      window.addEventListener("pointermove", onMove, { passive: true });
      window.addEventListener("pointerdown", onDown, { passive: true });
      document.documentElement.addEventListener("pointerleave", onLeave);
      document.addEventListener("visibilitychange", onVisibility);
      frame = requestAnimationFrame(loop);
    }
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 h-full w-full"
    />
  );
}
