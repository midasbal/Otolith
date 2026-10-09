import { TextLink } from "@/components/ui/button";

const CONTACT_EMAIL = "support@otolith.xyz";

const LINK_GROUPS = [
  {
    heading: "Product",
    links: [
      { label: "How it works", href: "#how-it-works" },
      { label: "Security", href: "#security" },
    ],
  },
  {
    heading: "Resources",
    links: [
      { label: "Docs", href: "https://github.com/midasbal/Otolith#readme" },
      { label: "GitHub", href: "https://github.com/midasbal/Otolith" },
    ],
  },
];

export function LandingFooter() {
  return (
    <footer className="nm-container pb-10">
      <div className="nm-divider" />

      <div className="flex flex-col gap-10 py-12 sm:flex-row sm:justify-between">
        <div className="flex flex-col gap-3">
          <span className="font-display text-md font-medium tracking-display text-text">Otolith</span>
          <p className="max-w-xs text-sm leading-relaxed text-text-muted">
            An on-chain, non-custodial portfolio auto-rebalancer.
          </p>
        </div>

        <div className="flex flex-wrap gap-x-16 gap-y-10">
          {LINK_GROUPS.map((group) => (
            <nav key={group.heading} aria-label={group.heading} className="flex flex-col gap-3">
              <span className="nm-caps">{group.heading}</span>
              <ul className="flex flex-col gap-2">
                {group.links.map((link) => (
                  <li key={link.href}>
                    <a href={link.href} className="nm-quiet-link text-sm">
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
      </div>

      <div className="nm-divider" />

      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 pt-6 text-sm">
        {/* The address is the link's visible text; "Email" is added for a
            screen reader, which would otherwise hear an address with no
            verb. The address may break anywhere if a narrow screen, or a
            reader's own text spacing, leaves it no room. */}
        <TextLink href={`mailto:${CONTACT_EMAIL}`} native muted className="[overflow-wrap:anywhere]">
          <span className="sr-only">Email </span>
          {CONTACT_EMAIL}
        </TextLink>
        <TextLink href="/app">Open app</TextLink>
      </div>
    </footer>
  );
}
