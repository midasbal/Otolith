import type { ComponentProps, ElementType } from "react";
import { cn } from "./cn";

export type SurfaceVariant = "raised" | "pressed" | "flat";
export type SurfaceDepth = "sm" | "md" | "lg";

const SURFACE_CLASS: Record<SurfaceVariant, Record<SurfaceDepth, string>> = {
  raised: { sm: "ot-raised-sm", md: "ot-raised", lg: "ot-raised-lg" },
  pressed: { sm: "ot-pressed-sm", md: "ot-pressed", lg: "ot-pressed-lg" },
  flat: { sm: "ot-flat", md: "ot-flat", lg: "ot-flat" },
};

/** The class for one of the three surface treatments at a given depth. */
export function surfaceClass(variant: SurfaceVariant = "raised", depth: SurfaceDepth = "md"): string {
  return SURFACE_CLASS[variant][depth];
}

type CardProps<T extends ElementType> = {
  as?: T;
  /** raised lifts off the page, pressed sinks into it, flat is level. */
  variant?: SurfaceVariant;
  depth?: SurfaceDepth;
  className?: string;
} & Omit<ComponentProps<T>, "as" | "className">;

/**
 * The basic container: the page's own surface with generous corners and
 * padding. Raised by default. Not interactive; it has no hover state.
 */
export function Card<T extends ElementType = "div">({ as, variant, depth, className, ...rest }: CardProps<T>) {
  const Tag: ElementType = as ?? "div";
  return <Tag className={cn("ot-card", surfaceClass(variant, depth), className)} {...rest} />;
}

type IconWellProps = ComponentProps<"span"> & {
  /** Raise the well instead of insetting it: for use inside a pressed card. */
  raised?: boolean;
};

/** A small well for one icon or one short number. Inset by default. */
export function IconWell({ raised = false, className, ...rest }: IconWellProps) {
  return <span className={cn("ot-icon-well", raised && "ot-icon-well-raised", className)} {...rest} />;
}
