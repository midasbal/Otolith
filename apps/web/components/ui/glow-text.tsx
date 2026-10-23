"use client";

import { useRef, type ComponentProps } from "react";
import { cn } from "./cn";
import { useLetterGlow } from "./use-letter-glow";

type GlowTextProps = Omit<ComponentProps<"span">, "ref"> & {
  /** Play the opening sweep once, when the text first comes into view. */
  intro?: boolean;
};

/**
 * Wraps a headline's text so each letter the pointer passes is lit from
 * beneath (see app/styles/glow.css for the look and use-letter-glow.ts
 * for the mechanism). The children stay ordinary text: nothing about
 * their layout, selection, or accessibility changes. Renders a block, so
 * use it as the whole content of a heading:
 *
 *   <h2><GlowText>Your portfolio, held to the weights you choose.</GlowText></h2>
 *
 * Mark part of the text with data-glow-static to give it the one still
 * halo shown under prefers-reduced-motion.
 */
export function GlowText({ intro = true, className, children, ...rest }: GlowTextProps) {
  const ref = useRef<HTMLSpanElement>(null);
  useLetterGlow(ref, { intro });

  return (
    <span ref={ref} className={cn("glow-text", className)} {...rest}>
      <GlowLayer />
      {children}
    </span>
  );
}

/**
 * The empty layer the halos are placed in. GlowText renders its own; a
 * part of a headline that moves by itself (an element carrying
 * data-glow-anchor) holds one of these as its first child, so its halos
 * move with it.
 */
export function GlowLayer() {
  return <span data-glow-layer="" aria-hidden="true" className="glow-layer" />;
}
