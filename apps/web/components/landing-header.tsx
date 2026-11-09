import Link from "next/link";
import { BackgroundToggle } from "@/components/background/background";
import { TestnetBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Mark } from "@/components/ui/mark";
import { ThemeToggle } from "@/components/ui/theme";

const NAV_LINKS = [
  { label: "How it works", href: "#how-it-works", external: false },
  { label: "Security", href: "#security", external: false },
  // The only link that leaves the site, so the only one that opens a new tab.
  { label: "Docs", href: "https://github.com/midasbal/Otolith#readme", external: true },
];

function NavLinks() {
  return NAV_LINKS.map((link) => (
    <a
      key={link.href}
      href={link.href}
      className="ot-navlink"
      {...(link.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      {link.label}
      {link.external ? <span className="sr-only"> (opens in a new tab)</span> : null}
    </a>
  ));
}

export function LandingHeader() {
  return (
    <header className="ot-container pt-4 sm:pt-6">
      {/* The bar wraps rather than overflows: at the narrowest widths (a
          320px viewport, or a wider one zoomed to 400%) "Open app" drops
          to a row of its own under the wordmark and badge. */}
      <div className="ot-raised flex flex-wrap items-center justify-between gap-3 rounded-xl px-3 py-3 sm:gap-4 sm:px-6">
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
          <Link
            href="/"
            className="flex items-center gap-2.5 rounded-md font-display text-md font-medium tracking-display text-text"
          >
            <Mark />
            Otolith
          </Link>
          <TestnetBadge />
        </div>

        <nav aria-label="Primary" className="hidden items-center gap-1 lg:flex">
          <NavLinks />
        </nav>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <BackgroundToggle className="hidden lg:inline-flex" />
          <ThemeToggle />
          <ButtonLink href="/app" variant="primary">
            Open app
          </ButtonLink>
        </div>
      </div>

      {/* Below lg: the same links on a row of their own beneath the bar,
          rather than hidden behind a menu, with the control that pauses
          the background at its end. On wide screens that control sits in
          the bar itself. */}
      <div className="mt-3 flex flex-wrap items-center justify-center gap-1 lg:hidden">
        <nav aria-label="Primary" className="flex items-center gap-1">
          <NavLinks />
        </nav>
        <BackgroundToggle />
      </div>
    </header>
  );
}
