import Image from "next/image";
import Link from "next/link";
import { TestnetBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";

const NAV_LINKS = [
  { label: "How it works", href: "#how-it-works" },
  { label: "Security", href: "#security" },
  { label: "Docs", href: "https://github.com/midasbal/Otolith#readme" },
];

function NavLinks() {
  return NAV_LINKS.map((link) => (
    <a key={link.href} href={link.href} className="nm-navlink">
      {link.label}
    </a>
  ));
}

export function LandingHeader() {
  return (
    <header className="nm-container pt-4 sm:pt-6">
      {/* The bar wraps rather than overflows: at the narrowest widths (a
          320px viewport, or a wider one zoomed to 400%) "Open app" drops
          to a row of its own under the wordmark and badge. */}
      <div className="nm-raised flex flex-wrap items-center justify-between gap-3 rounded-xl px-3 py-3 sm:gap-4 sm:px-6">
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
          <Link
            href="/"
            className="flex items-center gap-2.5 rounded-md font-display text-md font-medium tracking-display text-text"
          >
            <Image src="/otolith-logo.png" alt="" width={40} height={40} className="h-10 w-10" />
            Otolith
          </Link>
          <TestnetBadge />
        </div>

        <nav aria-label="Primary" className="hidden items-center gap-1 lg:flex">
          <NavLinks />
        </nav>

        <ButtonLink href="/app" variant="primary" className="shrink-0">
          Open app
        </ButtonLink>
      </div>

      {/* Below lg: the same links on a row of their own beneath the bar,
          rather than hidden behind a menu. Three short links fit. */}
      <nav aria-label="Primary" className="mt-3 flex items-center justify-center gap-1 lg:hidden">
        <NavLinks />
      </nav>
    </header>
  );
}
