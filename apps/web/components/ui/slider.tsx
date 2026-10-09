import type { ComponentProps, CSSProperties } from "react";
import { cn } from "./cn";

type SliderProps = Omit<ComponentProps<"input">, "type">;

/**
 * A range slider: a native input, so arrow keys, Home, End, and Page
 * Up/Down all work as the browser defines them. The groove fills with
 * the accent up to the thumb. Give it a label (aria-label or a <label>).
 */
export function Slider({ className, style, min = 0, max = 100, value, ...rest }: SliderProps) {
  const low = Number(min);
  const high = Number(max);
  const current = Number(value ?? low);
  const fill = high > low ? Math.min(100, Math.max(0, ((current - low) / (high - low)) * 100)) : 0;

  return (
    <input
      type="range"
      min={min}
      max={max}
      value={value}
      className={cn("ot-slider", className)}
      style={{ ...style, "--fill": `${fill}%` } as CSSProperties}
      {...rest}
    />
  );
}
