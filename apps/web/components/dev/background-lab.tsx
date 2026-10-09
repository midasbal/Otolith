"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ANNULI } from "@/components/background/annuli";
import { createBackground, type BackgroundState, type Engine, type PageReading, type QuietZone } from "@/components/background/engine";
import { usePrefersReducedMotion } from "@/components/ui/use-reduced-motion";

/*
  The background lab: Annuli, full screen, behind five sample chapters,
  with the controls needed to judge it. Development only (see app/dev/ui).

  The palette and type here are provisional and local to this file: the
  identity is built around the background, not before it.
*/

const GROUND = "#06070c";
const PEARL = "#e8eaf6";
const MUTED = "#a9aec6";
const ACCENT = "#8f7dff";
const QUIET_EDGE = "rgba(232, 234, 246, 0.28)";

const CHAPTERS = [
  {
    label: "Balance",
    title: "Continuous portfolio rebalancing that never leaves your wallet.",
    body: "Set target weights once. When your portfolio drifts, Otolith brings it back through your own wallet, on-chain.",
    align: "flex-start",
  },
  {
    label: "Drift",
    title: "Markets move. Weights drift.",
    body: "Switch the state below: the rings buckle and warm, and the particles are carried off them, each still held by its thread.",
    align: "flex-end",
  },
  {
    label: "Return",
    title: "One transaction brings it back.",
    body: "Press Rebalance while it is drifting. A single ring leaves the nucleus, and behind it every particle is back on its ring.",
    align: "flex-start",
  },
  {
    label: "Precision",
    title: "Bounded by the policy you set.",
    body: "Each chapter of the page moves the nucleus, tightens or opens the rings, and shifts the accent.",
    align: "flex-end",
  },
  {
    label: "Yours",
    title: "Your portfolio, held to the weights you choose.",
    body: "Behind every block of text the field goes quiet on its own.",
    align: "center",
  },
] as const;

const mono: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 12,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
};

const control: CSSProperties = {
  ...mono,
  minHeight: 36,
  padding: "0 14px",
  borderRadius: 999,
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: QUIET_EDGE,
  background: "rgba(6, 7, 12, 0.72)",
  color: PEARL,
  cursor: "pointer",
};

// The picture shown when there is no WebGL at all: the same idea, still, drawn by the stylesheet.
const STILL = [
  "radial-gradient(120% 90% at 84% 116%, rgba(128, 117, 255, 0.18), rgba(6, 7, 12, 0) 60%)",
  "repeating-radial-gradient(ellipse 125% 100% at 84% 116%, rgba(232, 234, 246, 0) 0 25px, rgba(232, 234, 246, 0.075) 25px 26px)",
  GROUND,
].join(", ");

declare global {
  interface Window {
    __bg?: Engine;
  }
}

export function BackgroundLab({ initialState, bare = false }: { initialState?: string; bare?: boolean }) {
  const reduced = usePrefersReducedMotion();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const [state, setState] = useState<BackgroundState>(initialState === "drifting" ? "drifting" : "balanced");
  const [paused, setPaused] = useState(false);
  const [readout, setReadout] = useState("");
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    const page = pageRef.current;
    if (!canvas || !page) return;
    const sections = [...page.querySelectorAll<HTMLElement>("[data-chapter]")];
    const blocks = [...page.querySelectorAll<HTMLElement>("[data-quiet]")];

    // What the engine asks the page each frame: which chapter is in view,
    // and where the text is. Reads only.
    const read = (): PageReading => {
      if (sections.length === 0) return { chapter: 0, quiet: [] };
      const middle = window.innerHeight / 2;
      const centers = sections.map((section) => {
        const box = section.getBoundingClientRect();
        return box.top + box.height / 2;
      });
      let chapter = centers.length - 1;
      if (middle <= centers[0]) chapter = 0;
      else {
        for (let i = 0; i < centers.length - 1; i++) {
          if (middle >= centers[i] && middle < centers[i + 1]) {
            chapter = i + (middle - centers[i]) / (centers[i + 1] - centers[i]);
            break;
          }
        }
      }
      const quiet: QuietZone[] = [];
      for (const block of blocks) {
        const box = block.getBoundingClientRect();
        if (box.bottom < -80 || box.top > window.innerHeight + 80) continue;
        quiet.push([box.left - 20, box.top - 20, box.right + 20, box.bottom + 20]);
        if (quiet.length === 4) break;
      }
      return { chapter, quiet };
    };

    let engine: Engine | null = null;
    try {
      engine = createBackground(canvas, ANNULI, { reducedMotion: reduced, read });
    } catch (error) {
      console.error(error);
    }
    engineRef.current = engine;
    window.__bg = engine ?? undefined;
    const timer = window.setInterval(() => {
      if (!engine) return;
      const s = engine.stats();
      setReadout(
        `${s.running ? `${s.fps.toFixed(0)} fps · p95 ${s.p95.toFixed(1)} ms` : "still"} · ${s.buffer} · quality ${s.quality.toFixed(2)} · ${s.detail}`,
      );
    }, 500);
    // No WebGL: the still picture under the canvas is all there is.
    const check = window.setTimeout(() => setSupported(engine !== null), 0);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(check);
      engine?.destroy();
      engineRef.current = null;
    };
  }, [reduced]);

  useEffect(() => {
    engineRef.current?.setState(state);
  }, [state, reduced]);

  useEffect(() => {
    engineRef.current?.setPaused(paused);
  }, [paused, reduced]);

  return (
    <div ref={pageRef} style={{ background: GROUND, color: PEARL, minHeight: "100vh" }}>
      <div aria-hidden="true" data-still="" style={{ position: "fixed", inset: 0, background: STILL }} />
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className={supported ? "block forced-colors:hidden" : "hidden"}
        style={{ position: "fixed", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
      />

      {/* Bare: the field alone, for exporting the still frames. */}
      <main style={{ position: "relative", display: bare ? "none" : undefined }}>
        {(bare ? [] : CHAPTERS).map((chapter, index) => (
          <section
            key={chapter.label}
            data-chapter=""
            style={{
              minHeight: "100vh",
              display: "flex",
              alignItems: "center",
              justifyContent: chapter.align,
              padding: "96px clamp(20px, 6vw, 96px)",
            }}
          >
            <div data-quiet="" style={{ maxWidth: index === 0 ? 680 : 520, textAlign: chapter.align === "center" ? "center" : undefined }}>
              <p style={{ ...mono, color: MUTED }}>
                <span style={{ color: ACCENT }}>{String(index).padStart(2, "0")}</span> · {chapter.label}
              </p>
              {index === 0 ? (
                <h1
                  style={{
                    fontFamily: "var(--font-display)",
                    fontWeight: 500,
                    fontSize: "clamp(34px, 5.4vw, 68px)",
                    lineHeight: 1.03,
                    letterSpacing: "-0.02em",
                    margin: "20px 0 0",
                  }}
                >
                  {chapter.title}
                </h1>
              ) : (
                <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 500, fontSize: "clamp(26px, 3.6vw, 44px)", lineHeight: 1.08, margin: "16px 0 0" }}>
                  {chapter.title}
                </h2>
              )}
              <p style={{ fontSize: index === 0 ? 18 : 16, lineHeight: 1.6, color: MUTED, margin: "20px 0 0" }}>{chapter.body}</p>
            </div>
          </section>
        ))}
      </main>

      <div
        data-hud=""
        style={{
          display: bare ? "none" : "flex",
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          flexWrap: "wrap",
          alignItems: "center",
          gap: 8,
          padding: "12px clamp(12px, 3vw, 24px)",
        }}
      >
        <button type="button" style={{ ...control, borderColor: state === "balanced" ? ACCENT : QUIET_EDGE }} aria-pressed={state === "balanced"} onClick={() => setState("balanced")}>
          Balanced
        </button>
        <button type="button" style={{ ...control, borderColor: state === "drifting" ? ACCENT : QUIET_EDGE }} aria-pressed={state === "drifting"} onClick={() => setState("drifting")}>
          Drifting
        </button>
        <button
          type="button"
          style={control}
          onClick={() => {
            engineRef.current?.pulse();
            setState("balanced");
          }}
        >
          Rebalance
        </button>
        <button type="button" style={control} aria-pressed={paused} onClick={() => setPaused((value) => !value)}>
          {paused ? "Play" : "Pause"}
        </button>
        <span style={{ ...mono, color: MUTED, marginLeft: "auto" }} data-readout="">
          {supported ? readout : "No WebGL: still picture"}
        </span>
      </div>
    </div>
  );
}
