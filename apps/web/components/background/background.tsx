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
import { usePrefersReducedMotion } from "@/components/ui/use-reduced-motion";
import type { BackgroundState, Engine, PageReading, QuietZone } from "./engine";

/*
  The background, as the page uses it.

  One fixed canvas behind everything, running Annuli. Under it lies a
  still of the same scene, an image: what a visitor sees before the scene
  has loaded, and all they see without WebGL, on a software renderer, or
  when they have asked for less motion. The scene is loaded on its own,
  once the browser is idle, so it never stands between the visitor and
  the page's first paint.

  Behind the app the field is the same one, but calm: dimmer, with fewer
  particles, and not changing as the page scrolls, so the data in front
  of it stays easy to read.

  The page talks to the scene in two ways. It marks itself up: a section
  carrying data-chapter says which scene belongs to it, and a block
  carrying data-quiet is text the field should dim itself behind. And
  through useBackground() a component can say what the portfolio is
  doing: balanced, drifting, or just rebalanced.

  The canvas takes no pointer events and no focus. BackgroundToggle is
  the visible control that pauses and resumes the motion; it sits in the
  page's own header and footer rather than floating over content, and
  the choice is remembered from page to page.
*/

type BackgroundController = {
  /** What the portfolio is doing. The field shows this, and nothing else changes it. */
  setState(state: BackgroundState): void;
  /** A rebalance was submitted: one bright ring crosses the field. The state stays as it was set. */
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

/**
 * What the engine asks the page each frame: which chapter is in view, and
 * where the text is. It only reads. The lists of elements are refreshed
 * twice a second, so a page that renders late or changes is picked up.
 */
function createReader(): () => PageReading {
  let sections: HTMLElement[] = [];
  let blocks: HTMLElement[] = [];
  let listedAt = -Infinity;

  return () => {
    const now = performance.now();
    if (now - listedAt > 500) {
      listedAt = now;
      sections = [...document.querySelectorAll<HTMLElement>("[data-chapter]")];
      blocks = [...document.querySelectorAll<HTMLElement>("[data-quiet]")];
    }
    const height = window.innerHeight;
    const middle = height / 2;

    // Each section names its scene; between two sections the scene eases from one to the other.
    let chapter = 0;
    if (sections.length > 0) {
      const marks = sections.map((section) => {
        const box = section.getBoundingClientRect();
        return { at: box.top + box.height / 2, scene: Number(section.dataset.chapter) || 0 };
      });
      chapter = marks[marks.length - 1].scene;
      if (middle <= marks[0].at) chapter = marks[0].scene;
      else {
        for (let i = 0; i < marks.length - 1; i++) {
          if (middle >= marks[i].at && middle < marks[i + 1].at) {
            const f = (middle - marks[i].at) / (marks[i + 1].at - marks[i].at);
            chapter = marks[i].scene + (marks[i + 1].scene - marks[i].scene) * f;
            break;
          }
        }
      }
    }

    // The scene can keep four blocks quiet; when more are in view, the largest win.
    const visible: Array<{ zone: QuietZone; area: number }> = [];
    for (const block of blocks) {
      const box = block.getBoundingClientRect();
      const shown = Math.min(box.bottom, height) - Math.max(box.top, 0);
      if (shown <= 0 || box.width === 0) continue;
      visible.push({ zone: [box.left - 16, box.top - 16, box.right + 16, box.bottom + 16], area: shown * box.width });
    }
    visible.sort((a, b) => b.area - a.area);
    return { chapter, quiet: visible.slice(0, 4).map((entry) => entry.zone) };
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

type BackgroundProps = {
  children: ReactNode;
  /** Draw the field here whatever the route. For the development gallery's previews. */
  force?: "landing" | "app";
};

export function Background({ children, force }: BackgroundProps) {
  const pathname = usePathname();
  // The development gallery draws its own, where it wants one.
  const enabled = force !== undefined || !pathname.startsWith("/dev");
  const calm = force ? force === "app" : pathname.startsWith("/app");
  const reduced = usePrefersReducedMotion();
  const forcedColors = useSyncExternalStore(subscribeForcedColors, readForcedColors, () => false);
  const paused = useSyncExternalStore(subscribePaused, readPaused, () => false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const wanted = useRef<{ state: BackgroundState; paused: boolean; calm: number }>({ state: "balanced", paused: false, calm: 0 });
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    // With less motion asked for, the still is the whole of it: no scene is loaded at all.
    // Under forced colors nothing of the field is shown, so nothing is run.
    const canvas = canvasRef.current;
    if (!enabled || reduced || forcedColors || !canvas) return;
    let cancelled = false;
    let engine: Engine | null = null;

    const start = async () => {
      const [{ createBackground }, { ANNULI }] = await Promise.all([import("./engine"), import("./annuli")]);
      if (cancelled) return;
      try {
        engine = createBackground(canvas, ANNULI, {
          reducedMotion: false,
          read: createReader(),
          // A device that cannot keep the scene up at all: back to the still picture.
          onGiveUp: () => {
            delete canvas.dataset.ready;
            setAnimated(false);
          },
        });
      } catch (error) {
        // A shader that will not compile on this GPU: the still picture stays.
        console.error(error);
      }
      engineRef.current = engine;
      if (!engine) return;
      engine.setLook({ calm: wanted.current.calm });
      engine.setState(wanted.current.state);
      engine.setPaused(wanted.current.paused);
      canvas.dataset.ready = "true";
      setAnimated(true);
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
      // The canvas steps back, and the still picture under it is what shows.
      delete canvas.dataset.ready;
      setAnimated(false);
    };
  }, [enabled, reduced, forcedColors]);

  useEffect(() => {
    wanted.current.paused = paused;
    engineRef.current?.setPaused(paused);
  }, [paused]);

  useEffect(() => {
    wanted.current.calm = calm ? 1 : 0;
    engineRef.current?.setLook({ calm: calm ? 1 : 0 });
  }, [calm]);

  const motion = useMemo(() => ({ animated, paused }), [animated, paused]);

  const controller = useMemo<BackgroundController>(
    () => ({
      setState(state) {
        wanted.current.state = state;
        engineRef.current?.setState(state);
        // Also written on the canvas, where a test (or a curious reader) can see what the field was told.
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
        {enabled ? (
          <>
            <div aria-hidden="true" className="bg-still" data-look={calm ? "calm" : undefined} />
            <canvas ref={canvasRef} aria-hidden="true" className="bg-canvas" />
          </>
        ) : null}
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
