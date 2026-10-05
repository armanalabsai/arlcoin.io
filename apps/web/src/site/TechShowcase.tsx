"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { pathFor } from "@/content/registry.ts";

// Interface previews of the four technologies, one per slide on a swipeable rail. Every
// number is an example and nothing touches a network: ARL is not deployed. The previews show
// how each flow is meant to work, step by step.

const NOTE = "Preview · simulated · example values · no tokens move";

const reduced = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Animates a number from 0 to `to` over `ms`, easing out; instant under reduced motion. */
function useTween() {
  const frame = useRef(0);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  return useCallback(
    (to: number, ms: number, onFrame: (v: number) => void, onDone?: () => void) => {
      cancelAnimationFrame(frame.current);
      if (reduced()) {
        onFrame(to);
        onDone?.();
        return;
      }
      const start = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / ms);
        onFrame(to * (1 - Math.pow(1 - t, 3)));
        if (t < 1) frame.current = requestAnimationFrame(tick);
        else onDone?.();
      };
      frame.current = requestAnimationFrame(tick);
    },
    [],
  );
}

const btn =
  "press inline-flex h-12 items-center justify-center glass-tint rounded-full px-6 text-[17px] font-semibold disabled:opacity-50";
const ghost =
  "glass-pill inline-flex h-11 items-center justify-center rounded-full px-5 text-[15px] text-fg";

function Meter({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div>
      <div
        className="h-3 overflow-hidden rounded-full bg-[rgb(255_255_255/0.08)]"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={Math.round(value * 100) / 100}
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-[#6fb9e8] to-accent"
          style={{ width: `${String(pct)}%` }}
        />
      </div>
    </div>
  );
}

function Range({
  label,
  value,
  min,
  max,
  step = 1,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="flex items-baseline justify-between text-[15px] text-fg-muted">
        {label}
        <span className="font-mono text-[15px] text-fg tabular-nums">
          {value} {unit}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-11 w-full accent-[var(--color-accent)]"
      />
    </label>
  );
}

function Shell({
  index,
  title,
  lead,
  card,
  active,
  children,
}: {
  index: number;
  title: string;
  lead: string;
  card: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <article
      className="rail-slide glass flex flex-col gap-6 rounded-[28px] p-6 text-left sm:p-8"
      data-active={active ? "true" : undefined}
      data-slide={index}
      role="group"
      aria-roledescription="slide"
      aria-label={`${String(index + 1)} of 4: ${title}`}
    >
      <div>
        <p className="font-mono text-[11px] tracking-[0.06em] text-accent uppercase">{NOTE}</p>
        <h3 className="mt-3 text-[28px] leading-[1.15] font-bold">{title}</h3>
        <p className="mt-2 text-[16px] leading-[1.5] text-fg-muted">{lead}</p>
      </div>
      <div className="flex flex-1 flex-col gap-5">{children}</div>
      <Link
        href={pathFor("technology", card)}
        prefetch={false}
        className="inline-flex min-h-11 items-center text-[17px] text-accent hover:underline"
      >
        How it works ›
      </Link>
    </article>
  );
}

function PaymentsDemo({ active }: { active: boolean }) {
  const [ceiling, setCeiling] = useState(20);
  const [used, setUsed] = useState(0);
  const [phase, setPhase] = useState<"idle" | "running" | "settled">("idle");
  const tween = useTween();
  const run = () => {
    setPhase("running");
    const target = Math.round(ceiling * (0.35 + Math.random() * 0.5) * 100) / 100;
    tween(target, 1400, setUsed, () => setPhase("settled"));
  };
  return (
    <Shell
      index={0}
      card="ai-payments"
      active={active}
      title="AI Payments"
      lead="Sign a ceiling once. The AI service meters what you use and settles exactly that, never more."
    >
      <Range
        label="Spending ceiling"
        value={ceiling}
        min={1}
        max={100}
        unit="ARL"
        onChange={(v) => {
          setCeiling(v);
          setUsed(0);
          setPhase("idle");
        }}
      />
      <Meter value={used} max={ceiling} label="Usage against the ceiling" />
      <p className="min-h-[48px] text-[15px] leading-[1.5] text-fg-muted" aria-live="polite">
        {phase === "idle" && "Signed: up to " + String(ceiling) + " ARL. Nothing is paid yet."}
        {phase === "running" && `Metering… ${used.toFixed(2)} ARL used`}
        {phase === "settled" &&
          `Settled ${used.toFixed(2)} ARL. ${(ceiling - used).toFixed(2)} ARL never left your wallet.`}
      </p>
      <button type="button" className={btn} onClick={run} disabled={phase === "running"}>
        {phase === "settled" ? "Run again" : "Run a request"}
      </button>
    </Shell>
  );
}

const JOBS = ["Inference", "Render", "Training"] as const;

function ComputeDemo({ active }: { active: boolean }) {
  const RATE = 0.01; // example price per second
  const [job, setJob] = useState<(typeof JOBS)[number]>("Inference");
  const [limit, setLimit] = useState(120);
  const [elapsed, setElapsed] = useState(0);
  const [phase, setPhase] = useState<"idle" | "running" | "done">("idle");
  const tween = useTween();
  const start = () => {
    setPhase("running");
    const ran = Math.max(1, Math.round(limit * (0.3 + Math.random() * 0.6)));
    tween(ran, 1600, setElapsed, () => setPhase("done"));
  };
  const billed = Math.ceil(elapsed);
  return (
    <Shell
      index={1}
      card="compute"
      active={active}
      title="GPU / CPU Compute"
      lead="Choose a job and its longest run. The provider is paid per second actually used."
    >
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Job">
        {JOBS.map((j) => (
          <button
            key={j}
            type="button"
            role="radio"
            aria-checked={job === j}
            onClick={() => setJob(j)}
            className={`press inline-flex h-11 items-center rounded-full px-5 text-[15px] transition-colors ${
              job === j ? "glass-tint" : "glass-pill text-fg"
            }`}
          >
            {j}
          </button>
        ))}
      </div>
      <Range
        label="Longest run"
        value={limit}
        min={10}
        max={540}
        step={10}
        unit="s"
        onChange={(v) => {
          setLimit(v);
          setElapsed(0);
          setPhase("idle");
        }}
      />
      <Meter value={elapsed} max={limit} label="Seconds used against the longest run" />
      <p className="min-h-[48px] text-[15px] leading-[1.5] text-fg-muted" aria-live="polite">
        {phase === "idle" &&
          `${job}: ceiling ${(limit * RATE).toFixed(2)} ARL at ${String(RATE)} ARL per second.`}
        {phase === "running" && `Running… ${String(billed)} s`}
        {phase === "done" &&
          `Finished in ${String(billed)} s. Billed ${(billed * RATE).toFixed(2)} ARL of ${(limit * RATE).toFixed(2)} ARL.`}
      </p>
      <button type="button" className={btn} onClick={start} disabled={phase === "running"}>
        {phase === "done" ? "Run again" : "Start job"}
      </button>
    </Shell>
  );
}

const OPTIONS = ["AI payments first", "Compute first"] as const;

function PrivacyDemo({ active }: { active: boolean }) {
  const [choice, setChoice] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<"idle" | "proving" | "counted">("idle");
  const tween = useTween();
  const vote = (o: string) => {
    setChoice(o);
    setPhase("proving");
    tween(100, 1800, setProgress, () => setPhase("counted"));
  };
  return (
    <Shell
      index={2}
      card="zk-privacy"
      active={active}
      title="ZK Privacy"
      lead="Vote as a member without revealing who you are. A zero-knowledge proof shows you may vote, once."
    >
      <p className="text-[17px] font-semibold text-heading">
        Example poll: which should ship first?
      </p>
      <div className="flex flex-col gap-2">
        {OPTIONS.map((o) => (
          <button
            key={o}
            type="button"
            disabled={phase !== "idle"}
            onClick={() => vote(o)}
            className={`press inline-flex h-12 items-center justify-between rounded-2xl px-5 text-[16px] transition-colors ${
              choice === o ? "glass-tint" : "glass-pill text-fg"
            }`}
          >
            {o}
            {choice === o ? <span aria-hidden="true">✓</span> : null}
          </button>
        ))}
      </div>
      <Meter value={progress} max={100} label="Proof generation" />
      <p className="min-h-[48px] text-[15px] leading-[1.5] text-fg-muted" aria-live="polite">
        {phase === "idle" && "Your vote is proven in your browser. Nothing identifies you."}
        {phase === "proving" &&
          `Building the proof in your browser… ${String(Math.round(progress))}%`}
        {phase === "counted" &&
          "Proof verified. Vote counted once. Your address is not linked to it."}
      </p>
      {phase === "counted" ? (
        <button
          type="button"
          className={ghost}
          onClick={() => {
            setChoice(null);
            setProgress(0);
            setPhase("idle");
          }}
        >
          Reset the example
        </button>
      ) : null}
    </Shell>
  );
}

const SERVICES = [
  { name: "Example text model", kind: "AI service", price: "per use", rating: 4.8 },
  { name: "Example image model", kind: "AI service", price: "per use", rating: 4.6 },
  { name: "Example GPU provider", kind: "Compute", price: "per second", rating: 4.9 },
] as const;

function NetworkDemo({ active }: { active: boolean }) {
  const [picked, setPicked] = useState<string | null>(null);
  return (
    <Shell
      index={3}
      card="arl-network"
      active={active}
      title="ARL Network"
      lead="Services and providers listed on an open registry, rated by real outcomes, paid in ARL."
    >
      <ul className="flex flex-col gap-2">
        {SERVICES.map((s) => (
          <li key={s.name}>
            <button
              type="button"
              onClick={() => setPicked(s.name)}
              aria-pressed={picked === s.name}
              className={`press flex min-h-16 w-full items-center justify-between gap-4 rounded-2xl px-5 py-3 text-left transition-colors ${
                picked === s.name ? "glass-tint" : "glass-pill text-fg"
              }`}
            >
              <span>
                <span className="block text-[16px] font-semibold">{s.name}</span>
                <span
                  className={`block text-[13px] ${picked === s.name ? "text-[rgb(255_255_255/0.85)]" : "text-fg-muted"}`}
                >
                  {s.kind} · paid {s.price}
                </span>
              </span>
              <span className="font-mono text-[14px] tabular-nums">★ {s.rating.toFixed(1)}</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="min-h-[48px] text-[15px] leading-[1.5] text-fg-muted" aria-live="polite">
        {picked
          ? `${picked}: you would sign an ARL ceiling for it, as in AI Payments. Its rating comes from completed jobs.`
          : "Pick a service to see how paying it works."}
      </p>
    </Shell>
  );
}

const DEMOS = [PaymentsDemo, ComputeDemo, PrivacyDemo, NetworkDemo];
const LABELS = ["AI Payments", "Compute", "ZK Privacy", "ARL Network"];

/** The rail: swipe or flick on touch, arrows and dots everywhere, arrow keys when focused. */
export function TechShowcase() {
  const rail = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  // The active slide is the one whose centre is closest to the rail's centre.
  useEffect(() => {
    const el = rail.current;
    if (!el) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const mid = el.scrollLeft + el.clientWidth / 2;
        let best = 0;
        let bestDist = Infinity;
        el.querySelectorAll<HTMLElement>("[data-slide]").forEach((s) => {
          const d = Math.abs(s.offsetLeft + s.offsetWidth / 2 - mid);
          if (d < bestDist) {
            bestDist = d;
            best = Number(s.dataset.slide);
          }
        });
        setActive(best);
      });
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  const go = (i: number) => {
    const el = rail.current;
    const slide = el?.querySelector<HTMLElement>(`[data-slide="${String(i)}"]`);
    if (!el || !slide) return;
    el.scrollTo({
      left: slide.offsetLeft - (el.clientWidth - slide.clientWidth) / 2,
      behavior: reduced() ? "auto" : "smooth",
    });
  };

  return (
    <div aria-roledescription="carousel" aria-label="Technology previews">
      <div
        ref={rail}
        className="rail"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === "ArrowRight") {
            e.preventDefault();
            go(Math.min(DEMOS.length - 1, active + 1));
          } else if (e.key === "ArrowLeft") {
            e.preventDefault();
            go(Math.max(0, active - 1));
          }
        }}
      >
        {DEMOS.map((Demo, i) => (
          <Demo key={LABELS[i]} active={active === i} />
        ))}
      </div>
      <div className="mt-2 flex items-center justify-center gap-4">
        <button
          type="button"
          className="glass-pill inline-flex size-11 items-center justify-center rounded-full text-[20px] text-fg disabled:opacity-40"
          onClick={() => go(active - 1)}
          disabled={active === 0}
          aria-label="Previous preview"
        >
          ‹
        </button>
        <div className="flex items-center">
          {LABELS.map((l, i) => (
            <button
              key={l}
              type="button"
              onClick={() => go(i)}
              aria-label={`Show ${l}`}
              aria-current={active === i ? "true" : undefined}
              className="inline-flex size-11 items-center justify-center"
            >
              <span
                className={`block h-2 rounded-full transition-all duration-500 ${
                  active === i ? "w-6 bg-accent" : "w-2 bg-[rgb(255_255_255/0.3)]"
                }`}
              />
            </button>
          ))}
        </div>
        <button
          type="button"
          className="glass-pill inline-flex size-11 items-center justify-center rounded-full text-[20px] text-fg disabled:opacity-40"
          onClick={() => go(active + 1)}
          disabled={active === DEMOS.length - 1}
          aria-label="Next preview"
        >
          ›
        </button>
      </div>
    </div>
  );
}
