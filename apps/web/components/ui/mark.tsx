import type { ComponentProps } from "react";
import { BALL, HALF, OUTLINED_X, UNIT, VIEW_BOX, halfPath, integralPath } from "@/components/logo/geometry";
import { cn } from "./cn";

type LogoProps = Omit<ComponentProps<"span">, "children" | "title"> & {
  /** Names the logo where it stands alone. Without it the logo is decorative: the wordmark beside it carries the name. */
  title?: string;
};

/**
 * The Otolith logo: a filled half-disc standing on an axis, an outlined
 * half-disc hanging from it, and an integral sign joining them. Two
 * assets out of balance, the target between them, and the flow that
 * brings them level.
 *
 * It scales with its box (give it a width; its height follows), and it
 * is drawn for the size it is shown at: the outline never thins below a
 * visible line, and when the whole logo is small the integral is
 * thickened a little so its hairlines survive (see .ot-logo in
 * components.css).
 */
export function Logo({ title, className, ...rest }: LogoProps) {
  return (
    <span className={cn("ot-logo", className)} {...rest}>
      <svg
        viewBox={`${VIEW_BOX.x} ${VIEW_BOX.y} ${VIEW_BOX.width} ${VIEW_BOX.height}`}
        fill="currentColor"
        role={title ? "img" : undefined}
        aria-label={title}
        aria-hidden={title ? undefined : true}
        focusable="false"
      >
        <path d={halfPath("filled")} />
        <path className="ot-logo-glyph" d={integralPath()} />
        <circle className="ot-logo-glyph" cx={BALL.x} cy={BALL.y} r={BALL.r} />
        <circle className="ot-logo-glyph" cx={-BALL.x} cy={-BALL.y} r={BALL.r} />
        <path className="ot-logo-line" fill="none" stroke="currentColor" d={`${halfPath("outlined")}M${HALF.gap} 0H${OUTLINED_X + UNIT}`} />
      </svg>
    </span>
  );
}

/** The logo as the site's mark, beside the wordmark in a header. */
export function Mark({ className, ...rest }: LogoProps) {
  return <Logo className={cn("ot-mark", className)} {...rest} />;
}
