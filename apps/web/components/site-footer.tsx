import Link from "next/link";
import { TextLink } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Mark } from "@/components/ui/mark";

const CONTACT_EMAIL = "support@otolith.xyz";

type FooterLink = {
  label: string;
  href: string;
  /** Opens in a new tab, and says so to a screen reader. */
  external?: boolean;
  /** Opens in a new tab only in the app's footer: a page of this site, read from inside the app, should not take the app's tab. */
  appNewTab?: boolean;
  /** The link's name for a screen reader, where the visible label alone is too short to say where it goes. */
  accessibleLabel?: string;
};

type FooterGroup = {
  heading: string;
  links: FooterLink[];
  /** Only on the homepage, which the links point into. */
  siteOnly?: boolean;
};

// The section links are absolute so they work from the homepage they point
// into; the app leaves them out, since they would take a reader out of it.
const LINK_GROUPS: FooterGroup[] = [
  {
    heading: "Product",
    siteOnly: true,
    links: [
      { label: "How it works", href: "/#how-it-works" },
      { label: "Security", href: "/#security" },
    ],
  },
  {
    heading: "Resources",
    links: [
      { label: "Docs", href: "/docs", appNewTab: true },
      { label: "GitHub", href: "https://github.com/midasbal/Otolith", external: true },
      { label: "X", href: "https://x.com/Otolithxyz", external: true, accessibleLabel: "Otolith on X (opens in a new tab)" },
    ],
  },
];

type SiteFooterProps = {
  /**
   * Where the footer stands. "site" is the homepage's: a raised panel that
   * bookends the header's bar. "app" is quieter, so it reads as the end of
   * the page and not as one more card among the dashboard's: no panel, set
   * on the ground under a divider, with only the links that stay inside
   * the app's world.
   */
  variant?: "site" | "app";
  /** Merged onto the footer's outer box, for a place that wants it narrower than the page. */
  className?: string;
};

function FooterLinkItem({ link, variant }: { link: FooterLink; variant: "site" | "app" }) {
  const className = "ot-quiet-link block py-1 text-sm [@media(pointer:coarse)]:py-2.5";
  const newTab = link.external || (link.appNewTab && variant === "app");
  const tabProps = newTab ? { target: "_blank", rel: "noopener noreferrer" } : {};
  const hint = newTab && !link.accessibleLabel ? <span className="sr-only"> (opens in a new tab)</span> : null;
  // A page of this site is a client-side link; a section of the homepage and
  // anything external are ordinary anchors.
  if (link.href.startsWith("/") && !link.href.includes("#")) {
    return (
      <Link href={link.href} aria-label={link.accessibleLabel} className={className} {...tabProps}>
        {link.label}
        {hint}
      </Link>
    );
  }
  return (
    <a href={link.href} aria-label={link.accessibleLabel} className={className} {...tabProps}>
      {link.label}
      {hint}
    </a>
  );
}

function FooterBrand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/"
        className={cn(
          "flex w-fit items-center gap-2.5 rounded-md font-display font-medium tracking-display text-text",
          compact ? "text-base" : "text-md",
        )}
      >
        <Mark />
        Otolith
      </Link>
      <p className="max-w-xs text-sm leading-relaxed text-text-muted">
        An on-chain, non-custodial portfolio auto-rebalancer.
      </p>
    </div>
  );
}

function FooterLinks({ variant }: { variant: "site" | "app" }) {
  return (
    <div className="flex flex-wrap gap-x-16 gap-y-10">
      {LINK_GROUPS.filter((group) => variant === "site" || !group.siteOnly).map((group) => (
        <nav key={group.heading} aria-label={group.heading} className="flex flex-col gap-3">
          <span className="ot-caps">{group.heading}</span>
          {/* The links carry their own spacing (as padding, which grows on a touch screen), so the list needs no gap. */}
          <ul className="flex flex-col">
            {group.links.map((link) => (
              <li key={link.href}>
                <FooterLinkItem link={link} variant={variant} />
              </li>
            ))}
          </ul>
        </nav>
      ))}
    </div>
  );
}

// The address is the link's visible text; "Email" is added for a screen
// reader, which would otherwise hear an address with no verb. The address
// may break anywhere if a narrow screen, or a reader's own text spacing,
// leaves it no room.
function FooterContact() {
  return (
    <div className="flex justify-center text-sm">
      <TextLink href={`mailto:${CONTACT_EMAIL}`} native muted className="ot-hit [overflow-wrap:anywhere]">
        <span className="sr-only">Email </span>
        {CONTACT_EMAIL}
      </TextLink>
    </div>
  );
}

/**
 * The footer shared by the homepage (app/(site)/layout.tsx) and the app
 * (app/app/layout.tsx). It carries no controls of its own: the theme and
 * background toggles live in the header and the sidebar, which are always
 * in reach. The links that leave the site open in a new tab; the section
 * links stay in the tab they are in.
 */
export function SiteFooter({ variant = "site", className }: SiteFooterProps) {
  if (variant === "app") {
    return (
      <footer data-quiet="" className={cn("ot-container mt-6 pb-8 sm:mt-10", className)}>
        <div className="ot-divider" />
        <div className="flex flex-col gap-8 pt-8 sm:flex-row sm:justify-between">
          <FooterBrand compact />
          <FooterLinks variant="app" />
        </div>
        <div className="pt-8">
          <FooterContact />
        </div>
      </footer>
    );
  }

  return (
    <footer className={cn("ot-container pb-6 sm:pb-10", className)}>
      <div className="ot-raised rounded-xl px-6 py-8 sm:px-10 sm:py-10">
        <div className="flex flex-col gap-10 sm:flex-row sm:justify-between">
          <FooterBrand />
          <FooterLinks variant="site" />
        </div>

        <div className="ot-divider my-8" />

        <FooterContact />
      </div>
    </footer>
  );
}
