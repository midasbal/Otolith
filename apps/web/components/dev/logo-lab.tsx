"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { createBackground, type Engine, type PageReading, type QuietZone } from "@/components/background/engine";
import { loadLogoField } from "@/components/background/logo-field";
import { logoScene } from "@/components/background/logo-scene";
import { ThemeToggle, useTheme } from "@/components/ui/theme";
import { usePrefersReducedMotion } from "@/components/ui/use-reduced-motion";
import { buildIntegralField } from "./logo-field-build";

/*
  The logo scene's lab: the scene alone, full screen, behind five plain
  chapters, placing itself on the screen (the landing page gives it stage
  boxes instead). For judging the motion, measuring it, and recording it.
  Development only (see app/dev/ui).

  It is also where the scene's two kinds of asset are made (see the
  README):

  - The integral's distance field: with the lab open,
    window.__buildLogoField() returns it as a PNG data URL, to save over
    public/logo/integral-field.png.
  - The stills that stand in where the scene cannot run: opened with
    ?still=<picture>, the lab stands still at that picture, fitted to
    the window with room for what spills, and window.__exportStill()
    returns it as a WebP data URL: ink as opacity on nothing, so one
    file serves both themes as a mask. Save it over
    public/logo/still-<name>.webp.
*/

type Chapter = { name: string; title: string; body: string; place: "left" | "right" | "top" | "bottom"; action?: string };

const CHAPTERS: Chapter[] = [
  {
    name: "Otolith",
    title: "Automated portfolio rebalancing that never leaves your wallet.",
    body: "Set target weights once. When your portfolio drifts, Otolith brings it back through your own wallet, on-chain.",
    place: "left",
    action: "Open app",
  },
  {
    name: "Why different",
    title: "What it is, and why it is different",
    body: "Most rebalancing tools ask you to hand over your funds, either to a manager or to an off-chain system you have to trust. Otolith does not.",
    place: "right",
  },
  {
    name: "How it works",
    title: "How it works",
    body: "Four steps, from setting your targets to a trade landing back in your own wallet.",
    place: "left",
  },
  {
    name: "Security",
    title: "Security",
    body: "Built so there is no party, including Otolith, in a position to move your funds anywhere you have not authorized.",
    place: "top",
  },
  {
    name: "Get started",
    title: "Your portfolio, held to the weights you choose.",
    body: "Connect a wallet and set your targets.",
    place: "bottom",
    action: "Open app",
  },
];

const mono: CSSProperties = { fontFamily: "var(--font-mono)", fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase" };

declare global {
  interface Window {
    __bg?: Engine;
    __buildLogoField?: () => string;
    __exportStill?: () => string;
  }
}

/** How much of the window each picture's logo box takes when it is exported as a still: less where the picture spills. */
const STILL_FIT = [1, 0.62, 0.86, 0.86, 1];
/** The ground and the ink the light theme is drawn in (see logo-scene.ts): what a still's opacity is read from. */
const GROUND = 241;
const INK = 35;

// The same width at which the scene itself moves the logo to the top of the screen.
const NARROW = "(max-width: 819px)";
function subscribeNarrow(callback: () => void) {
  const query = window.matchMedia(NARROW);
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}
const readNarrow = () => window.matchMedia(NARROW).matches;

export function LogoLab({ bare = false, still }: { bare?: boolean; still?: number }) {
  const reduced = usePrefersReducedMotion();
  const theme = useTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const [paused, setPaused] = useState(false);
  const [readout, setReadout] = useState("");
  const narrow = useSyncExternalStore(subscribeNarrow, readNarrow, () => false);

  useEffect(() => {
    window.__buildLogoField = () => {
      const field = buildIntegralField();
      const canvas = document.createElement("canvas");
      canvas.width = field.width;
      canvas.height = field.height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("No 2D canvas.");
      const image = context.createImageData(field.width, field.height);
      for (let i = 0; i < field.bytes.length; i++) image.data.set([field.bytes[i], field.bytes[i], field.bytes[i], 255], i * 4);
      context.putImageData(image, 0, 0);
      return canvas.toDataURL("image/png");
    };
    // The canvas as it stands, read as how much ink is on each pixel, and faded out toward its edges.
    window.__exportStill = () => {
      const canvas = canvasRef.current;
      const engine = engineRef.current;
      if (!canvas || !engine) throw new Error("No scene.");
      // Drawn and read in one go: the drawing is gone once the browser has shown it.
      engine.step(0);
      const copy = document.createElement("canvas");
      copy.width = canvas.width;
      copy.height = canvas.height;
      const context = copy.getContext("2d");
      if (!context) throw new Error("No 2D canvas.");
      context.drawImage(canvas, 0, 0);
      const image = context.getImageData(0, 0, copy.width, copy.height);
      const edge = (at: number, size: number, reach: number) => {
        const t = Math.max(0, Math.min(1, Math.min(at, size - 1 - at) / (size * reach)));
        return t * t * (3 - 2 * t);
      };
      for (let y = 0; y < copy.height; y++) {
        for (let x = 0; x < copy.width; x++) {
          const i = (y * copy.width + x) * 4;
          const ink = Math.max(0, Math.min(1, (GROUND - image.data[i]) / (GROUND - INK)));
          image.data.set([0, 0, 0, Math.round(255 * ink * edge(x, copy.width, 0.07) * edge(y, copy.height, 0.05))], i);
        }
      }
      context.putImageData(image, 0, 0);
      return copy.toDataURL("image/webp", 0.74);
    };
    return () => {
      delete window.__buildLogoField;
      delete window.__exportStill;
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const page = pageRef.current;
    if (!canvas || !page) return;
    const sections = [...page.querySelectorAll<HTMLElement>("[data-chapter]")];
    const blocks = [...page.querySelectorAll<HTMLElement>("[data-quiet]")];

    // Which chapter is in view, as a number that runs smoothly from one to the next, and where the text is.
    const read = (): PageReading => {
      if (still !== undefined) {
        // One picture, in a box in the logo's proportions, centred in the window.
        const fit = STILL_FIT[still] ?? 1;
        const width = Math.min(window.innerWidth, (window.innerHeight * 1700) / 720) * fit;
        const height = (width * 720) / 1700;
        const x = (window.innerWidth - width) / 2;
        const y = (window.innerHeight - height) / 2;
        return { chapter: still, quiet: [], stages: Array.from({ length: 5 }, () => [x, y, x + width, y + height]) };
      }
      if (sections.length === 0) return { chapter: 0, quiet: [] };
      const middle = window.innerHeight / 2;
      const centres = sections.map((section) => {
        const box = section.getBoundingClientRect();
        return box.top + box.height / 2;
      });
      let chapter = centres.length - 1;
      if (middle <= centres[0]) chapter = 0;
      else {
        for (let i = 0; i < centres.length - 1; i++) {
          if (middle >= centres[i] && middle < centres[i + 1]) {
            chapter = i + (middle - centres[i]) / (centres[i + 1] - centres[i]);
            break;
          }
        }
      }
      const quiet: QuietZone[] = [];
      for (const block of blocks) {
        const box = block.getBoundingClientRect();
        if (box.bottom < -80 || box.top > window.innerHeight + 80) continue;
        quiet.push([box.left - 12, box.top - 12, box.right + 12, box.bottom + 12]);
        if (quiet.length === 4) break;
      }
      return { chapter, quiet };
    };

    let engine: Engine | null = null;
    let cancelled = false;
    let drawn = 0;
    let timer = 0;
    void loadLogoField()
      .then((field) => {
        if (cancelled) return;
        engine = createBackground(canvas, logoScene(field), { reducedMotion: reduced || still !== undefined, read, dark: document.documentElement.dataset.theme === "dark" || (!document.documentElement.dataset.theme && window.matchMedia("(prefers-color-scheme: dark)").matches) });
        engineRef.current = engine;
        window.__bg = engine ?? undefined;
        timer = window.setInterval(() => {
          if (!engine) return setReadout("No WebGL");
          const s = engine.stats();
          // Not running but still drawing: the clock is being stepped by hand, for a recording.
          const pace = s.running ? `${s.fps.toFixed(0)} fps · p95 ${s.p95.toFixed(1)} ms` : s.frames > drawn + 2 ? "frame by frame" : "still";
          drawn = s.frames;
          setReadout(`${pace} · ${s.buffer} · quality ${s.quality.toFixed(2)} · ${s.detail}`);
        }, 500);
      })
      .catch((error) => {
        console.error(error);
        setReadout("The logo's distance field is missing");
      });
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      engine?.destroy();
      engineRef.current = null;
    };
  }, [reduced, still]);

  useEffect(() => {
    engineRef.current?.setLook({ dark: theme === "dark" });
  }, [theme]);

  useEffect(() => {
    engineRef.current?.setPaused(paused);
  }, [paused, reduced]);

  return (
    <div ref={pageRef} className="min-h-screen bg-bg text-text">
      <canvas ref={canvasRef} aria-hidden="true" style={{ position: "fixed", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }} />

      <main style={{ position: "relative", display: bare || still !== undefined ? "none" : undefined }}>
        {CHAPTERS.map((chapter, index) => {
          const centred = !narrow && chapter.place === "bottom";
          return (
            <section
              key={chapter.name}
              data-chapter=""
              style={{
                minHeight: "100vh",
                display: "flex",
                // On a narrow screen the logo has the top of the screen and the text the bottom.
                alignItems: narrow ? "flex-end" : chapter.place === "top" ? "flex-start" : chapter.place === "bottom" ? "flex-end" : "center",
                justifyContent: narrow ? "flex-start" : chapter.place === "right" ? "flex-end" : chapter.place === "bottom" ? "center" : "flex-start",
                padding: narrow ? "56vh 20px 84px" : "112px clamp(24px, 6vw, 96px) 120px",
              }}
            >
              <div data-quiet="" style={{ maxWidth: index === 0 ? 500 : centred ? 720 : 440, textAlign: centred ? "center" : undefined }}>
                <p className="text-text-muted" style={{ ...mono, margin: 0 }}>
                  <span className="text-accent">{String(index).padStart(2, "0")}</span> · {chapter.name}
                </p>
                {index === 0 ? (
                  <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 500, fontSize: "clamp(30px, 4.2vw, 56px)", lineHeight: 1.04, letterSpacing: "-0.02em", margin: "18px 0 0" }}>
                    {chapter.title}
                  </h1>
                ) : (
                  <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 500, fontSize: "clamp(26px, 3.4vw, 44px)", lineHeight: 1.08, letterSpacing: "-0.02em", margin: "16px 0 0" }}>
                    {chapter.title}
                  </h2>
                )}
                <p className="text-text-muted" style={{ fontSize: index === 0 ? 18 : 16, lineHeight: 1.6, margin: "18px 0 0" }}>
                  {chapter.body}
                </p>
                {chapter.action ? (
                  <button type="button" className="ot-btn ot-btn-primary" style={{ marginTop: 26 }}>
                    {chapter.action}
                  </button>
                ) : null}
              </div>
            </section>
          );
        })}
      </main>

      <div data-hud="" style={{ display: bare || still !== undefined ? "none" : "flex", position: "fixed", left: 0, right: 0, bottom: 0, alignItems: "center", gap: 8, padding: "12px clamp(12px, 3vw, 24px)" }}>
        <ThemeToggle />
        <button type="button" className="ot-btn ot-btn-sm" aria-pressed={paused} onClick={() => setPaused((value) => !value)}>
          {paused ? "Play" : "Pause"}
        </button>
        <span className="text-text-muted" style={{ ...mono, marginLeft: "auto", display: narrow ? "none" : undefined }} data-readout="">
          {readout}
        </span>
      </div>
    </div>
  );
}
