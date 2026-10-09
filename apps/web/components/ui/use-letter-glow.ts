"use client";

import { useEffect, type RefObject } from "react";
import { usePrefersReducedMotion } from "./use-reduced-motion";

/*
  The engine behind the headline glow (the look is in app/styles/glow.css).

  It never changes the headline's own text. It reads where each letter
  sits, places one empty halo element over it in a layer behind the text,
  and from then on only switches a data-lit attribute on those halos; the
  stylesheet turns that into an opacity transition.

  Because the halos are placed by measurement, the measurement has to be
  kept true. It is taken again whenever the headline is resized or
  rewrapped (a window resize, a rotation, browser zoom), whenever a web
  font finishes loading, and, as a backstop for anything that moves the
  letters without resizing the headline (a user stylesheet that widens
  letter spacing, say), at the start of any pointer activity and before
  the opening sweep. Taking it again moves the existing halos in place,
  so a trail that is already lit is not disturbed.

  There is no animation loop. A pointer move asks for a single animation
  frame, so however fast events arrive the letters are worked out at most
  once per frame; when the pointer stops, so do the frames. Letting go of
  a letter after its hold, and stepping the opening sweep, both run off
  one timer aimed at the next moment something is due, and when nothing
  is lit and nothing is queued there is no timer either.
*/

type Letter = {
  halo: HTMLElement;
  /** The positioned element the halo is placed against. */
  anchor: HTMLElement;
  char: string;
  left: number;
  top: number;
  width: number;
  height: number;
  /** When to let go: 0 is unlit, Infinity is held under the pointer. */
  releaseAt: number;
};

/** One letter as just read from the page, before it has a halo. */
type Reading = Pick<Letter, "anchor" | "char" | "left" | "top" | "width" | "height"> & {
  layer: HTMLElement;
};

type Point = { x: number; y: number };

// How finely the pointer's path between two frames is retraced, so a fast
// sweep cannot jump over the letters in between.
const PATH_STEP_PX = 6;
const PATH_MAX_STEPS = 48;

// The opening sweep: a wave across the headline, left to right, once.
const SWEEP_DELAY_MS = 700;
const SWEEP_STEP_MS = 26;
const SWEEP_HOLD_MS = 420;

// How old a measurement may be before pointer activity takes it again.
const STALE_AFTER_MS = 250;

// A halo is moved only if its letter has, by more than this many pixels.
const MOVED_PX = 0.01;

const FINE_POINTER = "(hover: hover) and (pointer: fine)";
const FORCED_COLORS = "(forced-colors: active)";

/** Reads a CSS time token (as "1500ms" or "1.5s") in milliseconds. */
function readTime(element: HTMLElement, name: string, fallback: number): number {
  const raw = getComputedStyle(element).getPropertyValue(name).trim();
  const value = parseFloat(raw);
  if (!Number.isFinite(value)) return fallback;
  return raw.endsWith("ms") ? value : value * 1000;
}

/** Reads a CSS length token given in pixels. */
function readPixels(element: HTMLElement, name: string, fallback: number): number {
  const value = parseFloat(getComputedStyle(element).getPropertyValue(name));
  return Number.isFinite(value) ? value : fallback;
}

function isSkipped(letter: Letter): boolean {
  return letter.anchor.hasAttribute("data-glow-skip");
}

function startGlow(root: HTMLElement, intro: boolean): () => void {
  let letters: Letter[] = [];
  let measuredAt = 0;
  let sweep: Array<{ letter: Letter; at: number }> = [];
  // When the opening sweep begins: 0 until it is queued, -1 once it has
  // run or been cancelled, so it can only ever play once.
  let sweepStart = 0;
  let pointer: Point | null = null;
  let previous: Point | null = null;
  let frame = 0;
  let timer = 0;
  let stopped = false;

  // ── Measuring ────────────────────────────────────────────────────────

  /** Where every letter of the headline is right now. */
  function read(): Reading[] {
    const readings: Reading[] = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent || parent.closest("[data-glow-layer], .sr-only, .invisible")) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    const range = document.createRange();
    const anchorRects = new Map<HTMLElement, DOMRect>();

    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.nodeValue ?? "";
      const moving = node.parentElement?.closest<HTMLElement>("[data-glow-anchor]");
      const anchor = moving && root.contains(moving) ? moving : root;
      const layer = anchor.querySelector<HTMLElement>(":scope > [data-glow-layer]");
      if (!layer) continue;

      let anchorRect = anchorRects.get(anchor);
      if (!anchorRect) {
        anchorRect = anchor.getBoundingClientRect();
        anchorRects.set(anchor, anchorRect);
      }

      let index = 0;
      for (const char of text) {
        const start = index;
        index += char.length;
        if (!char.trim()) continue;

        range.setStart(node, start);
        range.setEnd(node, index);
        const rect = range.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;

        // A letter and its anchor are read in the same frame, so the
        // offsets between them hold however the anchor is later moved.
        readings.push({
          anchor,
          layer,
          char,
          left: rect.left - anchorRect.left,
          top: rect.top - anchorRect.top,
          width: rect.width,
          height: rect.height,
        });
      }
    }

    return readings;
  }

  function place(letter: Letter, reading: Reading) {
    const moved =
      Math.abs(letter.left - reading.left) > MOVED_PX ||
      Math.abs(letter.top - reading.top) > MOVED_PX ||
      Math.abs(letter.width - reading.width) > MOVED_PX ||
      Math.abs(letter.height - reading.height) > MOVED_PX;
    if (!moved && letter.halo.style.width) return;

    letter.left = reading.left;
    letter.top = reading.top;
    letter.width = reading.width;
    letter.height = reading.height;
    letter.halo.style.left = `${reading.left}px`;
    letter.halo.style.top = `${reading.top}px`;
    letter.halo.style.width = `${reading.width}px`;
    letter.halo.style.height = `${reading.height}px`;
    // A line exactly as tall as the letter's own extent leaves no leading
    // to round, so the copy sits on the letter to the hundredth of a
    // pixel. If a user stylesheet overrides line-height, the stylesheet's
    // centering takes over and keeps it within a pixel (see glow.css).
    letter.halo.style.lineHeight = `${reading.height}px`;
  }

  function measure() {
    if (stopped) return;
    measuredAt = performance.now();
    const readings = read();

    // The same letters in the same places in the tree: move each halo to
    // where its letter is now, and leave what is lit as it is.
    const unchanged =
      readings.length === letters.length &&
      readings.every((reading, i) => reading.char === letters[i].char && reading.anchor === letters[i].anchor);

    if (unchanged) {
      readings.forEach((reading, i) => place(letters[i], reading));
      return;
    }

    // Different text: start the halos over.
    for (const letter of letters) letter.halo.remove();
    letters = readings.map((reading) => {
      const halo = document.createElement("span");
      halo.className = "glow-halo";
      halo.dataset.char = reading.char;
      reading.layer.appendChild(halo);
      const letter: Letter = { halo, anchor: reading.anchor, char: reading.char, left: 0, top: 0, width: 0, height: 0, releaseAt: 0 };
      place(letter, reading);
      return letter;
    });

    // A sweep still under way carries on across the new set of halos.
    buildSweep();
    schedule();
  }

  function measureIfStale() {
    if (performance.now() - measuredAt > STALE_AFTER_MS) measure();
  }

  // ── Lighting and letting go ──────────────────────────────────────────

  function light(letter: Letter, releaseAt: number) {
    if (letter.releaseAt === 0) letter.halo.setAttribute("data-lit", "");
    letter.releaseAt = releaseAt;
  }

  function release(letter: Letter) {
    letter.halo.removeAttribute("data-lit");
    letter.releaseAt = 0;
  }

  function schedule() {
    window.clearTimeout(timer);
    timer = 0;

    let next = Infinity;
    for (const letter of letters) {
      if (letter.releaseAt > 0 && letter.releaseAt < next) next = letter.releaseAt;
    }
    for (const step of sweep) {
      if (step.at < next) next = step.at;
    }
    if (next === Infinity) return;

    timer = window.setTimeout(runDue, Math.max(0, next - performance.now()));
  }

  function runDue() {
    timer = 0;

    if (sweep.length > 0) {
      measureIfStale();
      const now = performance.now();
      const waiting: typeof sweep = [];
      for (const step of sweep) {
        if (step.at > now) {
          waiting.push(step);
        } else if (!isSkipped(step.letter)) {
          light(step.letter, Math.max(step.letter.releaseAt, now + SWEEP_HOLD_MS));
        }
      }
      sweep = waiting;
      if (sweep.length === 0) sweepStart = -1;
    }

    const now = performance.now();
    for (const letter of letters) {
      if (letter.releaseAt > 0 && letter.releaseAt <= now) release(letter);
    }

    schedule();
  }

  // ── Following the pointer ────────────────────────────────────────────

  function trackPointer() {
    frame = 0;
    if (!pointer) return;

    measureIfStale();

    const now = performance.now();
    const hold = readTime(root, "--glow-hold", 1500);
    const reach = readPixels(root, "--glow-reach", 8);
    const to = pointer;
    const from = previous ?? to;
    previous = to;

    // Anchors can be mid-move (a word settling into place, a section
    // still rising into view), so their boxes are read fresh each frame.
    const anchorRects = new Map<HTMLElement, DOMRect>();
    const rectOf = (anchor: HTMLElement) => {
      let rect = anchorRects.get(anchor);
      if (!rect) {
        rect = anchor.getBoundingClientRect();
        anchorRects.set(anchor, rect);
      }
      return rect;
    };

    const nearest = (x: number, y: number): Letter | null => {
      let best: Letter | null = null;
      let bestDistance = reach * reach;
      for (const letter of letters) {
        if (isSkipped(letter)) continue;
        const anchor = rectOf(letter.anchor);
        const left = anchor.left + letter.left;
        const top = anchor.top + letter.top;
        const dx = Math.max(left - x, 0, x - (left + letter.width));
        const dy = Math.max(top - y, 0, y - (top + letter.height));
        const distance = dx * dx + dy * dy;
        if (distance <= bestDistance) {
          best = letter;
          bestDistance = distance;
        }
      }
      return best;
    };

    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    const steps = Math.min(PATH_MAX_STEPS, Math.max(1, Math.ceil(distance / PATH_STEP_PX)));
    const passed = new Set<Letter>();
    let under: Letter | null = null;
    for (let i = 1; i <= steps; i += 1) {
      const t = i / steps;
      under = nearest(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t);
      if (under) passed.add(under);
    }

    // The letter under the pointer is held for as long as it stays there;
    // every other letter on the path, and whichever one was held until
    // now, starts its hold from this moment.
    for (const letter of letters) {
      if (letter === under) light(letter, Infinity);
      else if (passed.has(letter) || letter.releaseAt === Infinity) light(letter, now + hold);
    }

    schedule();
  }

  function handlePointerMove(event: PointerEvent) {
    if (event.pointerType === "touch") return;
    // A hand on the headline ends the opening sweep: the trail is theirs now.
    sweep = [];
    sweepStart = -1;
    pointer = { x: event.clientX, y: event.clientY };
    if (!frame) frame = window.requestAnimationFrame(trackPointer);
  }

  function handlePointerLeave() {
    pointer = null;
    previous = null;
    const releaseAt = performance.now() + readTime(root, "--glow-hold", 1500);
    for (const letter of letters) {
      if (letter.releaseAt === Infinity) letter.releaseAt = releaseAt;
    }
    schedule();
  }

  // ── The opening sweep ────────────────────────────────────────────────

  function buildSweep() {
    if (sweepStart <= 0) {
      sweep = [];
      return;
    }
    const now = performance.now();
    sweep = letters
      .filter((letter) => !isSkipped(letter))
      .map((letter, index) => ({ letter, at: sweepStart + index * SWEEP_STEP_MS }))
      .filter((step) => step.at >= now);
    if (sweep.length === 0) sweepStart = -1;
  }

  function queueSweep() {
    if (sweepStart !== 0) return;
    sweepStart = performance.now() + SWEEP_DELAY_MS;
    measure();
    buildSweep();
    schedule();
  }

  // ── Wiring ───────────────────────────────────────────────────────────

  // The first size report arrives as soon as observation starts, and does
  // the first measurement; later ones follow a resize, a rotation, a zoom,
  // or anything else that rewraps the headline.
  const resizeObserver = new ResizeObserver(measure);
  resizeObserver.observe(root);

  // A late web font moves every letter without necessarily resizing the
  // headline: measure again when the fonts in use have loaded, and each
  // time a later batch finishes.
  const fonts = document.fonts;
  fonts.addEventListener("loadingdone", measure);
  void fonts.ready.then(measure);

  // When a moving word steps aside, whatever it had lit is let go at once
  // (its halos fade with it), and the word taking its place is checked
  // against a pointer that may be resting there without moving.
  const skipObserver = new MutationObserver(() => {
    for (const letter of letters) {
      if (isSkipped(letter) && letter.releaseAt !== 0) release(letter);
    }
    if (pointer && !frame) frame = window.requestAnimationFrame(trackPointer);
    schedule();
  });
  skipObserver.observe(root, { subtree: true, attributes: true, attributeFilter: ["data-glow-skip"] });

  let viewObserver: IntersectionObserver | null = null;
  if (intro) {
    viewObserver = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        viewObserver?.disconnect();
        viewObserver = null;
        queueSweep();
      },
      { threshold: 0.6 },
    );
    viewObserver.observe(root);
  }

  // Following the pointer is for a pointer that can hover. On a touch
  // screen the opening sweep is the whole effect.
  const tracking = window.matchMedia(FINE_POINTER).matches;
  if (tracking) {
    root.addEventListener("pointermove", handlePointerMove);
    root.addEventListener("pointerleave", handlePointerLeave);
  }

  return () => {
    stopped = true;
    resizeObserver.disconnect();
    skipObserver.disconnect();
    viewObserver?.disconnect();
    fonts.removeEventListener("loadingdone", measure);
    if (tracking) {
      root.removeEventListener("pointermove", handlePointerMove);
      root.removeEventListener("pointerleave", handlePointerLeave);
    }
    window.cancelAnimationFrame(frame);
    window.clearTimeout(timer);
    for (const letter of letters) letter.halo.remove();
  };
}

type LetterGlowOptions = {
  /** Play the opening sweep once, when the headline first comes into view. */
  intro?: boolean;
};

/**
 * Lights a headline letter by letter under the pointer. Attach the ref to
 * an element with the glow-text class that holds a [data-glow-layer]
 * element as a direct child (GlowText sets both up). Does nothing under
 * prefers-reduced-motion, where glow.css shows one still halo instead,
 * or in forced-colors mode, where the system removes every shadow and
 * the glow is simply off.
 */
export function useLetterGlow(ref: RefObject<HTMLElement | null>, { intro = true }: LetterGlowOptions = {}) {
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    const root = ref.current;
    if (!root || reducedMotion) return;
    if (window.matchMedia(FORCED_COLORS).matches) return;
    return startGlow(root, intro);
  }, [ref, reducedMotion, intro]);
}
