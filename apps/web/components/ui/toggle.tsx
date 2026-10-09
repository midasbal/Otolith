import type { ComponentProps } from "react";
import { cn } from "./cn";

type ToggleProps = Omit<ComponentProps<"button">, "role" | "aria-checked" | "children"> & {
  checked: boolean;
};

/**
 * A switch. It is a button with role="switch", so Space and Enter both
 * flip it, and its state is announced as on or off. On is shown by the
 * accent filling the groove and by the knob's position, never by shadow
 * alone. Name it with aria-label or aria-labelledby.
 */
export function Toggle({ checked, className, type = "button", ...rest }: ToggleProps) {
  return <button type={type} role="switch" aria-checked={checked} className={cn("nm-toggle", className)} {...rest} />;
}
