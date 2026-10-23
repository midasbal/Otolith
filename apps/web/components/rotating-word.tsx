"use client";

import { useEffect, useState } from "react";
import { GlowLayer } from "@/components/ui/glow-text";
import { usePrefersReducedMotion } from "@/components/ui/use-reduced-motion";

const WORDS = ["Automated", "Autonomous", "Hands-off", "Continuous"];
const REST_MS = 3000;
const WIDEST_WORD = WORDS.reduce((a, b) => (b.length > a.length ? b : a));

/**
 * Cycles the headline's first word through a set of synonyms, all
 * preserving the same meaning, on a gentle cross-fade and rise along the
 * signature ease-settle curve. The widest word is reserved as an
 * invisible sizer so the line never reflows as the words change width.
 * Under prefers-reduced-motion nothing cycles: one static word is shown.
 *
 * Inside a GlowText, each word carries its own glow layer and anchors its
 * halos to itself, so they rise and fade with it; the words that are not
 * showing are marked data-glow-skip and take no part in the glow, and
 * cannot be selected or copied along with the headline.
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
    return (
      <span aria-hidden="true" data-glow-static="">
        Automated
      </span>
    );
  }

  return (
    <span aria-hidden="true" className="pointer-events-none relative inline-block align-baseline">
      <span className="invisible">{WIDEST_WORD}</span>
      {WORDS.map((word, i) => (
        <span
          key={word}
          data-glow-anchor=""
          data-glow-skip={i === index ? undefined : ""}
          className={`absolute inset-0 transition-[opacity,transform] duration-[var(--duration-settle)] ease-settle ${
            i === index ? "pointer-events-auto" : "select-none"
          }`}
          style={{
            opacity: i === index ? 1 : 0,
            transform: i === index ? "translateY(0)" : "translateY(0.35em)",
          }}
        >
          <GlowLayer />
          {word}
        </span>
      ))}
    </span>
  );
}
