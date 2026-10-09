import type { ReactNode } from "react";

/**
 * The interface's icon set: a handful of line icons drawn on one 24px
 * grid with one stroke weight, so they read as a family. Inline SVG, no
 * icon library. Every icon is decorative by default (aria-hidden): the
 * text beside it carries the meaning, and an icon-only button takes its
 * name from the button, not from the icon.
 */
const ICONS = {
  "arrow-right": <path d="M5 12h14M13 6l6 6-6 6" />,
  "arrow-up-right": <path d="M7 17 17 7M9 7h8v8" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  "chevron-down": <path d="m6 9 6 6 6-6" />,
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5M12 7.5v.01" />
    </>
  ),
  alert: (
    <>
      <path d="M12 3.75 21.5 20h-19L12 3.75Z" />
      <path d="M12 10v4.5M12 17.25v.01" />
    </>
  ),
  copy: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="2.5" />
      <path d="M5.5 15H5a1.5 1.5 0 0 1-1.5-1.5v-8A1.5 1.5 0 0 1 5 4h8a1.5 1.5 0 0 1 1.5 1.5V6" />
    </>
  ),
  refresh: <path d="M20 12a8 8 0 1 1-2.5-5.8M20 4v4.5h-4.5" />,
  wallet: (
    <>
      <rect x="3.5" y="6.5" width="17" height="12.5" rx="3" />
      <path d="M7 6.5V5.75A1.75 1.75 0 0 1 8.75 4H16M16.25 12.75v.01" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3.5 19 6v5.5c0 4.2-2.9 7.4-7 9-4.1-1.6-7-4.8-7-9V6l7-2.5Z" />
      <path d="m9 12 2.2 2.2 3.8-4.2" />
    </>
  ),
  broadcast: (
    <>
      <circle cx="12" cy="12" r="1.5" />
      <path d="M8.2 15.8a5.4 5.4 0 0 1 0-7.6M15.8 8.2a5.4 5.4 0 0 1 0 7.6M5.3 18.7a9.5 9.5 0 0 1 0-13.4M18.7 5.3a9.5 9.5 0 0 1 0 13.4" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="9.5" rx="2.5" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    </>
  ),
  contract: (
    <>
      <path d="M7.5 3.5H14l4 4V19a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 19V5a1.5 1.5 0 0 1 1.5-1.5Z" />
      <path d="M14 3.5V8h4M9 12.5h6M9 16h4" />
    </>
  ),
  "no-key": (
    <>
      <circle cx="8" cy="15.5" r="3.5" />
      <path d="m10.6 13 7.9-7.9M16 7.5l2.5 2.5M4 4l16 16" />
    </>
  ),
  verify: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5M8.5 11.2l1.8 1.8 3.2-3.6" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="15.5" r="3.5" />
      <path d="m10.6 13 7.9-7.9M16 7.5l2.5 2.5M13.5 10l2 2" />
    </>
  ),
  dashboard: (
    <>
      <rect x="4" y="4" width="6.5" height="6.5" rx="1.75" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.75" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.75" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.75" />
    </>
  ),
  activity: <path d="M3 12h4l2.5-6.5 5 13L17 12h4" />,
  explore: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" />
    </>
  ),
  settings: (
    <>
      <path d="M4 8h9M18 8h2M4 16h2M11 16h9" />
      <circle cx="15.5" cy="8" r="2.5" />
      <circle cx="8.5" cy="16" r="2.5" />
    </>
  ),
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof ICONS;

type IconProps = {
  name: IconName;
  /** Edge length in pixels. The stroke stays the same weight at any size. */
  size?: number;
  className?: string;
};

export function Icon({ name, size = 20, className }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {ICONS[name]}
    </svg>
  );
}

/**
 * The loading indicator: a faint ring with one accent arc turning on it.
 * Decorative on its own; pair it with text, or put it inside something
 * that carries role="status".
 */
export function Spinner({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      className={className ? `nm-spinner ${className}` : "nm-spinner"}
    >
      <circle cx="12" cy="12" r="9" opacity={0.25} />
      <path d="M21 12a9 9 0 0 0-9-9" />
    </svg>
  );
}
