"use client";

import { usePathname } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { IconButton } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Icon } from "@/components/ui/icons";
import { useTheme } from "@/components/ui/theme";
import { usePrefersReducedMotion } from "@/components/ui/use-reduced-motion";
import type { BackgroundState, Engine, PageReading, QuietZone, Stage } from "./engine";

/*
  The background, as the page uses it.

  One fixed canvas behind the landing page, drawing the logo scene: the
  Otolith logo, which comes apart and back together as the page's five
  chapters scroll by (see logo-scene.ts). The scene is loaded on its own,
  once the browser is idle, so it never stands between the visitor and
  the page's first paint. Until it arrives, and wherever it cannot run,
  the page shows the logo itself, drawn in its hero as an SVG, exactly
  where the scene will draw it.

  The page talks to the scene by marking itself up:

    data-chapter   on a section: which of the scene's five pictures
                   belongs to it.
    data-stage     on an empty box inside that section: the room the page
                   keeps clear for the picture. The scene fits the logo to
                   that box.
    data-quiet     on a block of text that sits directly on the ground:
                   the scene dims itself behind it.

  The scene does not scroll with the page. Each chapter has one place on
  the screen: where its stage box is when the page stands at that
  chapter. The picture is drawn there while the chapter is read, and
  travels to the next chapter's place as that one arrives. (Drawing it
  wherever the box is from frame to frame would have it trail the page
  by a frame on every phone.)

  With less motion asked for, the same scene is drawn, standing still:
  one picture to a chapter, exchanged as the page reaches it, and nothing
  moving in between. Under forced colors nothing is drawn at all.

  The canvas takes no pointer events and no focus. BackgroundToggle is
  the visible control that pauses and resumes the motion; it sits in the
  page's own header and footer rather than floating over content, and
  the choice is remembered from page to page.

  Through useBackground() a component can say what the portfolio is
  doing: balanced, drifting, or just rebalanced. The app's screens do;
  nothing is drawn behind them yet.
*/

type BackgroundController = {
  /** What the portfolio is doing. The scene shows this, and nothing else changes it. */
  setState(state: BackgroundState): void;
  /** A rebalance was submitted. The state stays as it was set. */
  pulse(): void;
};

const BackgroundContext = createContext<BackgroundController>({ setState() {}, pulse() {} });
const MotionContext = createContext<{ animated: boolean; paused: boolean }>({ animated: false, paused: false });

/** Lets a component tell the background what the portfolio is doing. */
export function useBackground(): BackgroundController {
  return useContext(BackgroundContext);
}

// The viewer's choice to pause, kept for their next visit.
const PAUSE_KEY = "otolith:background-paused";
const PAUSE_EVENT = "otolith:background-paused";

// Held here as well as in storage, so the control still works where storage does not.
let pausedNow: boolean | null = null;

function subscribePaused(callback: () => void) {
  // Another tab changed it: read it again.
  const onStorage = () => {
    pausedNow = null;
    callback();
  };
  window.addEventListener(PAUSE_EVENT, callback);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(PAUSE_EVENT, callback);
    window.removeEventListener("storage", onStorage);
  };
}

function readPaused(): boolean {
  if (pausedNow === null) {
    try {
      pausedNow = window.localStorage.getItem(PAUSE_KEY) === "1";
    } catch {
      pausedNow = false;
    }
  }
  return pausedNow;
}

function writePaused(paused: boolean) {
  pausedNow = paused;
  try {
    if (paused) window.localStorage.setItem(PAUSE_KEY, "1");
    else window.localStorage.removeItem(PAUSE_KEY);
  } catch {
    // Storage can be unavailable; the choice then lasts for this page only.
  }
  window.dispatchEvent(new Event(PAUSE_EVENT));
}

/** Where an element is laid out in the document, whatever is scrolled and whatever is being animated into place. */
function placeOf(element: HTMLElement): [number, number] {
  let x = 0;
  let y = 0;
  for (let node: HTMLElement | null = element; node; node = node.offsetParent as HTMLElement | null) {
    x += node.offsetLeft + (node === element ? 0 : node.clientLeft);
    y += node.offsetTop + (node === element ? 0 : node.clientTop);
  }
  return [x, y];
}

type Chapter = {
  /** Which of the scene's pictures. */
  scene: number;
  /** The scroll position at which the page stands at this chapter. */
  at: number;
};

/**
 * What the engine asks the page each frame: which chapter it stands at,
 * where each chapter's picture goes, and where the text is. It only
 * reads. The page is measured twice a second and whenever the window
 * changes size, so a page that renders late or changes is picked up;
 * between measurements a frame costs one scroll position and the text
 * blocks' boxes.
 */
function createReader(): () => PageReading {
  let blocks: HTMLElement[] = [];
  let chapters: Chapter[] = [];
  let stages: Array<Stage | null> = [];
  let measuredAt = -Infinity;
  let measuredFor = "";

  const measure = (height: number) => {
    const sections = [...document.querySelectorAll<HTMLElement>("[data-chapter]")];
    blocks = [...document.querySelectorAll<HTMLElement>("[data-quiet]")];
    const end = Math.max(0, document.documentElement.scrollHeight - height);
    chapters = [];
    stages = [];
    sections.forEach((section, index) => {
      const scene = Number(section.dataset.chapter) || 0;
      // The page stands at a chapter when the chapter's top is at the top of the screen; at the first with the
      // page at its top, and at the last with the page at its end.
      let at = index === 0 ? 0 : index === sections.length - 1 ? end : placeOf(section)[1];
      at = Math.max(0, Math.min(end, at));
      if (index > 0) at = Math.max(at, chapters[index - 1].at + 1);
      chapters.push({ scene, at });
      // The chapter's place on the screen: where its stage box is, with the page standing there.
      const box = section.querySelector<HTMLElement>("[data-stage]");
      if (box && box.offsetWidth > 0 && box.offsetHeight > 0) {
        const [x, y] = placeOf(box);
        stages[scene] = [x, y - at, x + box.offsetWidth, y - at + box.offsetHeight];
      } else {
        stages[scene] = null;
      }
    });
  };

  return () => {
    const now = performance.now();
    const height = window.innerHeight;
    const size = `${window.innerWidth}x${height}`;
    if (now - measuredAt > 500 || size !== measuredFor) {
      measuredAt = now;
      measuredFor = size;
      measure(height);
    }

    // A chapter's picture holds while the chapter is read, and gives way to the next over the last stretch
    // of scrolling before the page stands at that one.
    let chapter = 0;
    if (chapters.length > 0) {
      const y = window.scrollY;
      const last = chapters[chapters.length - 1];
      chapter = y >= last.at ? last.scene : chapters[0].scene;
      for (let i = 0; i < chapters.length - 1; i++) {
        const here = chapters[i];
        const next = chapters[i + 1];
        if (y < here.at || y >= next.at) continue;
        const run = Math.min(height * 0.7, next.at - here.at);
        const f = Math.max(0, Math.min(1, (y - (next.at - run)) / run));
        chapter = here.scene + (next.scene - here.scene) * f;
        break;
      }
    }

    // The scene can keep four blocks quiet; when more are in view, the largest win.
    const visible: Array<{ zone: QuietZone; area: number }> = [];
    for (const block of blocks) {
      const box = block.getBoundingClientRect();
      const shown = Math.min(box.bottom, height) - Math.max(box.top, 0);
      if (shown <= 0 || box.width === 0) continue;
      visible.push({ zone: [box.left - 12, box.top - 12, box.right + 12, box.bottom + 12], area: shown * box.width });
    }
    visible.sort((a, b) => b.area - a.area);
    return { chapter, quiet: visible.slice(0, 4).map((entry) => entry.zone), stages };
  };
}

const FORCED_COLORS = "(forced-colors: active)";

function subscribeForcedColors(callback: () => void) {
  const query = window.matchMedia(FORCED_COLORS);
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

function readForcedColors(): boolean {
  return window.matchMedia(FORCED_COLORS).matches;
}

/**
 * Says on the root element whether the scene is up, so the page's own
 * pictures can step aside for it ("live") or stand in for it ("none").
 * Nothing is said until one or the other is known.
 */
function announce(scene: "live" | "none" | null) {
  if (scene) document.documentElement.dataset.scene = scene;
  else delete document.documentElement.dataset.scene;
}

declare global {
  interface Window {
    /** The running scene, in development only: for measuring and recording it. */
    __bg?: Engine;
  }
}

type BackgroundProps = {
  children: ReactNode;
  /** Treat this as the landing page (the scene is drawn) or as the app (nothing is, yet) whatever the route. For the development gallery's previews. */
  force?: "landing" | "app";
};

export function Background({ children, force }: BackgroundProps) {
  const pathname = usePathname();
  // The scene belongs to the landing page. Behind the app there is only the ground, for now.
  const enabled = force ? force === "landing" : pathname === "/";
  const reduced = usePrefersReducedMotion();
  const forcedColors = useSyncExternalStore(subscribeForcedColors, readForcedColors, () => false);
  const paused = useSyncExternalStore(subscribePaused, readPaused, () => false);
  const theme = useTheme();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const wanted = useRef<{ state: BackgroundState; paused: boolean; dark: boolean }>({ state: "balanced", paused: false, dark: false });
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    // Under forced colors nothing of the scene is shown, so nothing is run.
    const canvas = canvasRef.current;
    if (!enabled || forcedColors || !canvas) return;
    let cancelled = false;
    let engine: Engine | null = null;

    const start = async () => {
      try {
        const [{ createBackground }, { logoScene }, { loadLogoField }] = await Promise.all([
          import("./engine"),
          import("./logo-scene"),
          import("./logo-field"),
        ]);
        const field = await loadLogoField();
        if (cancelled) return;
        engine = createBackground(canvas, logoScene(field), {
          // With less motion asked for the scene stands still: a picture to each chapter.
          reducedMotion: reduced,
          read: createReader(),
          dark: wanted.current.dark,
          // A device that cannot keep the scene up at all: back to the page's own pictures.
          onGiveUp: () => {
            delete canvas.dataset.ready;
            announce("none");
            setAnimated(false);
          },
        });
      } catch (error) {
        // A shader that will not compile on this GPU, or the logo's field not arriving.
        console.error(error);
      }
      if (cancelled) {
        engine?.destroy();
        return;
      }
      engineRef.current = engine;
      if (!engine) {
        announce("none");
        return;
      }
      engine.setLook({ dark: wanted.current.dark });
      engine.setState(wanted.current.state);
      engine.setPaused(wanted.current.paused);
      canvas.dataset.ready = "true";
      announce("live");
      setAnimated(!reduced);
      if (process.env.NODE_ENV !== "production") window.__bg = engine;
    };

    // After the page has painted and the browser has a moment. (Safari has no idle callback.)
    const hasIdle = "requestIdleCallback" in window;
    const idle = hasIdle
      ? window.requestIdleCallback(() => void start(), { timeout: 2000 })
      : window.setTimeout(() => void start(), 300);

    return () => {
      cancelled = true;
      if (hasIdle) window.cancelIdleCallback(idle);
      else window.clearTimeout(idle);
      engine?.destroy();
      engineRef.current = null;
      if (process.env.NODE_ENV !== "production") delete window.__bg;
      // The canvas steps back, and the page's own pictures are what show.
      delete canvas.dataset.ready;
      announce(null);
      setAnimated(false);
    };
  }, [enabled, reduced, forcedColors]);

  useEffect(() => {
    wanted.current.paused = paused;
    engineRef.current?.setPaused(paused);
  }, [paused]);

  useEffect(() => {
    wanted.current.dark = theme === "dark";
    engineRef.current?.setLook({ dark: theme === "dark" });
  }, [theme]);

  const motion = useMemo(() => ({ animated, paused }), [animated, paused]);

  const controller = useMemo<BackgroundController>(
    () => ({
      setState(state) {
        wanted.current.state = state;
        engineRef.current?.setState(state);
        // Also written on the canvas, where a test (or a curious reader) can see what the scene was told.
        if (canvasRef.current) canvasRef.current.dataset.state = state;
      },
      pulse() {
        engineRef.current?.pulse();
        const canvas = canvasRef.current;
        if (canvas) canvas.dataset.pulses = String(Number(canvas.dataset.pulses ?? 0) + 1);
      },
    }),
    [],
  );

  return (
    <BackgroundContext.Provider value={controller}>
      <MotionContext.Provider value={motion}>
        {enabled ? <canvas ref={canvasRef} aria-hidden="true" className="bg-canvas" /> : null}
        {children}
      </MotionContext.Provider>
    </BackgroundContext.Provider>
  );
}

/**
 * The control that pauses and resumes the background's motion. It always
 * takes up its own space in the layout, and shows nothing in it when
 * there is no motion to stop (no WebGL, or less motion asked for), so the
 * page around it never shifts when the scene arrives.
 */
export function BackgroundToggle({ className }: { className?: string }) {
  const { animated, paused } = useContext(MotionContext);
  return (
    <span className={cn("bg-toggle", className)}>
      {animated ? (
        <IconButton
          label={paused ? "Play background animation" : "Pause background animation"}
          size="sm"
          onClick={() => writePaused(!paused)}
        >
          <Icon name={paused ? "play" : "pause"} size={16} />
        </IconButton>
      ) : null}
    </span>
  );
}
