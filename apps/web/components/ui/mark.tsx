import type { SVGProps } from "react";

/**
 * The Otolith mark: an ear stone in section. Three growth rings, never
 * quite concentric, around a nucleus set off-center, as the rings of a
 * real otolith are. The heavier middle ring is the one a rebalance sends
 * out. It is the background's own drawing, reduced to a sign.
 *
 * Decorative by default (the wordmark beside it carries the name); pass a
 * `title` where it stands alone.
 */
export function Mark({ title, ...rest }: SVGProps<SVGSVGElement> & { title?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
      {...rest}
    >
      <g transform="rotate(-18 16 16)">
        <ellipse cx="16" cy="16" rx="14" ry="12.4" strokeWidth="1.25" opacity="0.55" />
        <ellipse cx="17.1" cy="16.7" rx="9.6" ry="8.3" strokeWidth="2" />
        <ellipse cx="18.1" cy="17.4" rx="5.1" ry="4.3" strokeWidth="1.25" opacity="0.8" />
        <circle cx="18.9" cy="17.9" r="1.7" fill="var(--accent)" stroke="none" />
      </g>
    </svg>
  );
}
