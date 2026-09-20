"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

const WORDS = ["Automated", "Autonomous", "Hands-off", "Continuous"];
const REST_MS = 3000;
const WIDEST_WORD = WORDS.reduce((a, b) => (b.length > a.length ? b : a));

function subscribeReducedMotion(callback: () => void) {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

function getReducedMotionSnapshot() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function getReducedMotionServerSnapshot() {
  return false;
}

function usePrefersReducedMotion() {
  return useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    getReducedMotionServerSnapshot,
  );
}

/**
 * Cycles the headline's first word through a set of synonyms, all
 * preserving the same meaning, on a gentle cross-fade and rise along the
 * signature ease-settle curve. The widest word is reserved as an
 * invisible sizer so the line never reflows as the words change width.
 */
export function RotatingWord() {
  const [index, setIndex] = useState(0);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (reducedMotion) return;

    const id = window.setInterval(() => {
      setIndex((current) => (current + 1) % WORDS.length);
    }, REST_MS);

    return () => window.clearInterval(id);
  }, [reducedMotion]);

  if (reducedMotion) {
    return <span aria-hidden="true">Automated</span>;
  }

  return (
    <span
      aria-hidden="true"
      className="relative inline-block align-baseline"
    >
      <span className="invisible">{WIDEST_WORD}</span>
      {WORDS.map((word, i) => (
        <span
          key={word}
          className="absolute inset-0 transition-[opacity,transform] duration-[var(--duration-settle)] ease-[var(--ease-settle)]"
          style={{
            opacity: i === index ? 1 : 0,
            transform: i === index ? "translateY(0)" : "translateY(0.35em)",
          }}
        >
          {word}
        </span>
      ))}
    </span>
  );
}
