import Link from "next/link";
import { TextLink } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Mark } from "@/components/ui/mark";

const CONTACT_EMAIL = "support@otolith.xyz";

// The section links are absolute so they work from the app as well as from
// the homepage they point into.
type FooterLink = {
  label: string;
  href: string;
  /** The link's name for a screen reader, where the visible label alone is too short to say where it goes. */
  accessibleLabel?: string;
};

const LINK_GROUPS: Array<{ heading: string; links: FooterLink[] }> = [
  {
    heading: "Product",
    links: [
      { label: "How it works", href: "/#how-it-works" },
      { label: "Security", href: "/#security" },
    ],
  },
  {
    heading: "Resources",
    links: [
      { label: "Docs", href: "https://github.com/midasbal/Otolith#readme" },
      { label: "GitHub", href: "https://github.com/midasbal/Otolith" },
      { label: "X", href: "https://x.com/Otolithxyz", accessibleLabel: "Otolith on X" },
    ],
  },
];

type SiteFooterProps = {
  /** Merged onto the footer's outer box, for a place that wants it narrower than the page. */
  className?: string;
};

/**
 * The footer shared by the homepage (app/(site)/layout.tsx) and the app
 * (app/app/layout.tsx): one raised panel, like the header's bar, holding
 * the brand, the links, and the contact address. It carries no controls of
 * its own: the theme and background toggles live in the header and the
 * sidebar, which are always in reach.
 */
export function SiteFooter({ className }: SiteFooterProps) {
  return (
    <footer className={cn("ot-container pb-6 sm:pb-10", className)}>
      <div className="ot-raised rounded-xl px-6 py-8 sm:px-10 sm:py-10">
        <div className="flex flex-col gap-10 sm:flex-row sm:justify-between">
          <div className="flex flex-col gap-4">
            <Link
              href="/"
              className="flex w-fit items-center gap-2.5 rounded-md font-display text-md font-medium tracking-display text-text"
            >
              <Mark />
              Otolith
            </Link>
            <p className="max-w-xs text-sm leading-relaxed text-text-muted">
              An on-chain, non-custodial portfolio auto-rebalancer.
            </p>
          </div>

          <div className="flex flex-wrap gap-x-16 gap-y-10">
            {LINK_GROUPS.map((group) => (
              <nav key={group.heading} aria-label={group.heading} className="flex flex-col gap-3">
                <span className="ot-caps">{group.heading}</span>
                <ul className="flex flex-col gap-2">
                  {group.links.map((link) => (
                    <li key={link.href}>
                      <a href={link.href} aria-label={link.accessibleLabel} className="ot-quiet-link text-sm">
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
        </div>

        <div className="ot-divider my-8" />

        <div className="flex justify-center text-sm">
          {/* The address is the link's visible text; "Email" is added for a
              screen reader, which would otherwise hear an address with no
              verb. The address may break anywhere if a narrow screen, or a
              reader's own text spacing, leaves it no room. */}
          <TextLink href={`mailto:${CONTACT_EMAIL}`} native muted className="[overflow-wrap:anywhere]">
            <span className="sr-only">Email </span>
            {CONTACT_EMAIL}
          </TextLink>
        </div>
      </div>
    </footer>
  );
}
