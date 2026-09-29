"use client";

import { useEffect, useRef } from "react";

// Decorative background, drawn on one canvas behind the content.
//
// Two layers. Thousands of subatomic particles drift in ice blue at three depths. Over them,
// atoms: nuclei glowing like small suns, each with one to three ice-blue electrons on tilted
// orbits. Nuclei keep apart from each other, swirl around the pointer, and a press sends a
// shock wave through both layers. Now and then a nucleus flares.
//
// Cost and accessibility: aria-hidden, no pointer capture, capped device pixel ratio, counts
// scaled to the screen (far fewer on phones), sprites pre-rendered once, orbits stroked in one
// path, paused while the tab is hidden, and a still frame when the user prefers reduced motion.

interface Electron {
  a: number;
  speed: number;
  orbit: number;
  tilt: number;
  spin: number;
}

interface Atom {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  phase: number;
  flare: number;
  electrons: Electron[];
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  depth: number; // 0 far … 2 near
  phase: number;
}

const SEPARATION = 30;
// Ice blue far away to white up close; four twinkle levels each.
const DUST_STYLES = [
  ["170, 205, 245", 0.18],
  ["190, 228, 255", 0.32],
  ["235, 247, 255", 0.46],
].map(([rgb, a]) =>
  [0.35, 0.6, 0.8, 1].map((k) => `rgba(${rgb}, ${((a as number) * k).toFixed(3)})`),
);
const POINTER_RADIUS = 180;
const MAX_SPEED = 1.6;

/** A soft radial glow sprite. Stops: [offset, alpha] pairs over one colour. */
function glow(rgb: readonly [number, number, number], size: number, stops: [number, number][]) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  if (!g) return c;
  const h = size / 2;
  const grad = g.createRadialGradient(h, h, 0, h, h, h);
  for (const [o, a] of stops) grad.addColorStop(o, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`);
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
    // Sun-lit nucleus: white-gold core fading to warm amber.
    const sunCore = glow([255, 244, 214], 64, [
      [0, 1],
      [0.12, 0.9],
      [0.3, 0.35],
      [1, 0],
    ]);
    const sunHalo = glow([244, 181, 86], 96, [
      [0, 0.35],
      [0.35, 0.12],
      [1, 0],
    ]);
    // Ice-blue electron.
    const ice = glow([170, 228, 255], 24, [
      [0, 1],
      [0.25, 0.7],
      [0.6, 0.12],
      [1, 0],
    ]);

    const pointer = { x: -1e4, y: -1e4, active: false };
    const waves: { x: number; y: number; t: number }[] = [];
    let atoms: Atom[] = [];
    let dust: Particle[] = [];
    let w = 0;
    let h = 0;
    let frame = 0;
    let tick = 0;

    function seed() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas!.width = Math.round(w * dpr);
      canvas!.height = Math.round(h * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      const area = w * h;
      const small = w < 640;
      const atomCount = Math.round(Math.min(small ? 90 : 240, Math.max(50, area / 7000)));
      const dustCount = Math.round(Math.min(small ? 900 : 3200, Math.max(400, area / 450)));
      atoms = Array.from({ length: atomCount }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        r: 0.8 + Math.random() * 1.6,
        phase: Math.random() * Math.PI * 2,
        flare: 0,
        electrons: Array.from({ length: 1 + Math.floor(Math.random() * 3) }, (_, k) => ({
          a: Math.random() * Math.PI * 2,
          speed: (0.015 + Math.random() * 0.035) * (Math.random() < 0.5 ? -1 : 1),
          orbit: 6 + k * 3.5 + Math.random() * 4,
          tilt: 0.3 + Math.random() * 0.6,
          spin: Math.random() * Math.PI,
        })),
      }));
      dust = Array.from({ length: dustCount }, () => {
        const depth = Math.random() < 0.6 ? 0 : Math.random() < 0.7 ? 1 : 2;
        const v = 0.05 + depth * 0.08;
        return {
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * v,
          vy: (Math.random() - 0.5) * v,
          depth,
          phase: Math.random() * Math.PI * 2,
        };
      });
    }

    function wrap(p: { x: number; y: number }) {
      if (p.x < -20) p.x = w + 20;
      else if (p.x > w + 20) p.x = -20;
      if (p.y < -20) p.y = h + 20;
      else if (p.y > h + 20) p.y = -20;
    }

    function push(p: { x: number; y: number; vx: number; vy: number }, strength: number) {
      if (pointer.active) {
        const dx = p.x - pointer.x;
        const dy = p.y - pointer.y;
        const d = Math.hypot(dx, dy);
        if (d < POINTER_RADIUS && d > 0.1) {
          const k = (1 - d / POINTER_RADIUS) * strength;
          p.vx += (dx / d) * k * 0.22 + (-dy / d) * k * 0.28;
          p.vy += (dy / d) * k * 0.22 + (dx / d) * k * 0.28;
        }
      }
      for (const wave of waves) {
        const dx = p.x - wave.x;
        const dy = p.y - wave.y;
        const d = Math.hypot(dx, dy);
        if (Math.abs(d - wave.t * 9) < 28 && d > 0.1) {
          p.vx += (dx / d) * 0.9 * strength;
          p.vy += (dy / d) * 0.9 * strength;
        }
      }
    }

    function step() {
      tick++;
      // Separation between atoms, through a coarse grid so the cost stays near linear.
      const grid = new Map<number, number[]>();
      atoms.forEach((n, i) => {
        const key = Math.floor(n.x / SEPARATION) * 4096 + Math.floor(n.y / SEPARATION);
        const list = grid.get(key);
        if (list) list.push(i);
        else grid.set(key, [i]);
      });
      for (let i = 0; i < atoms.length; i++) {
        const n = atoms[i]!;
        const cx = Math.floor(n.x / SEPARATION);
        const cy = Math.floor(n.y / SEPARATION);
        for (let gx = cx - 1; gx <= cx + 1; gx++) {
          for (let gy = cy - 1; gy <= cy + 1; gy++) {
            for (const j of grid.get(gx * 4096 + gy) ?? []) {
              if (j <= i) continue;
              const m = atoms[j]!;
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

      for (const n of atoms) {
        push(n, 1);
        n.vx = n.vx * 0.97 + (Math.random() - 0.5) * 0.02;
        n.vy = n.vy * 0.97 + (Math.random() - 0.5) * 0.02;
        const s = Math.hypot(n.vx, n.vy);
        if (s > MAX_SPEED) {
          n.vx = (n.vx / s) * MAX_SPEED;
          n.vy = (n.vy / s) * MAX_SPEED;
        }
        n.x += n.vx;
        n.y += n.vy;
        wrap(n);
        for (const e of n.electrons) e.a += e.speed;
        // A rare flare: the nucleus brightens and fades over about a second.
        if (n.flare > 0) n.flare = Math.max(0, n.flare - 0.02);
        else if (Math.random() < 0.0006) n.flare = 1;
      }

      for (const p of dust) {
        push(p, 0.35 + p.depth * 0.3);
        const drift = 0.05 + p.depth * 0.08;
        p.vx = p.vx * 0.98 + (Math.random() - 0.5) * drift * 0.1;
        p.vy = p.vy * 0.98 + (Math.random() - 0.5) * drift * 0.1;
        p.x += p.vx;
        p.y += p.vy;
        wrap(p);
      }

      for (let i = waves.length - 1; i >= 0; i--) {
        waves[i]!.t += 1;
        if (waves[i]!.t > 60) waves.splice(i, 1);
      }
    }

    function draw() {
      const c = ctx!;
      c.clearRect(0, 0, w, h);

      // Subatomic dust: three depths, ice blue to white, softly twinkling. Alphas are bucketed
      // so each frame sets a handful of fill styles, not one per particle.
      const groups: Particle[][] = Array.from({ length: 12 }, () => []);
      for (const p of dust) {
        const tw = 0.5 + 0.5 * Math.sin(tick * 0.03 + p.phase);
        groups[p.depth * 4 + Math.min(3, Math.floor(tw * 4))]!.push(p);
      }
      groups.forEach((group, g) => {
        const depth = Math.floor(g / 4);
        const size = 0.7 + depth * 0.5;
        c.fillStyle = DUST_STYLES[depth]![g % 4]!;
        for (const p of group) c.fillRect(p.x, p.y, size, size);
      });

      // Orbits: one faint path for all of them.
      c.beginPath();
      for (const n of atoms) {
        for (const e of n.electrons) {
          c.moveTo(n.x + e.orbit * Math.cos(e.spin), n.y + e.orbit * Math.sin(e.spin));
          c.ellipse(n.x, n.y, e.orbit, e.orbit * e.tilt, e.spin, 0, Math.PI * 2);
        }
      }
      c.strokeStyle = "rgba(160, 215, 255, 0.07)";
      c.lineWidth = 0.6;
      c.stroke();

      // Sun-lit nuclei and ice-blue electrons, added as light.
      c.globalCompositeOperation = "lighter";
      for (const n of atoms) {
        const pulse = 0.85 + 0.15 * Math.sin(tick * 0.02 + n.phase) + n.flare * 1.2;
        const halo = n.r * 16 * pulse;
        c.globalAlpha = Math.min(1, 0.55 * pulse);
        c.drawImage(sunHalo, n.x - halo / 2, n.y - halo / 2, halo, halo);
        const core = n.r * 7 * pulse;
        c.globalAlpha = Math.min(1, 0.9 * pulse);
        c.drawImage(sunCore, n.x - core / 2, n.y - core / 2, core, core);
        c.globalAlpha = 0.95;
        for (const e of n.electrons) {
          // Position on the tilted ellipse.
          const ox = Math.cos(e.a) * e.orbit;
          const oy = Math.sin(e.a) * e.orbit * e.tilt;
          const ex = n.x + ox * Math.cos(e.spin) - oy * Math.sin(e.spin);
          const ey = n.y + ox * Math.sin(e.spin) + oy * Math.cos(e.spin);
          c.drawImage(ice, ex - 3.5, ey - 3.5, 7, 7);
        }
      }
      c.globalAlpha = 1;
      c.globalCompositeOperation = "source-over";

      for (const wave of waves) {
        c.beginPath();
        c.arc(wave.x, wave.y, wave.t * 9, 0, Math.PI * 2);
        c.strokeStyle = `rgba(170, 228, 255, ${0.3 * (1 - wave.t / 60)})`;
        c.lineWidth = 1;
        c.stroke();
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
