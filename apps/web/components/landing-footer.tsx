import Link from "next/link";

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
      { label: "Docs", href: "#docs" },
      { label: "GitHub", href: "https://github.com/midasbal/Otolith" },
    ],
  },
];

export function LandingFooter() {
  return (
    <footer className="border-t border-hairline">
      <div className="mx-auto flex max-w-5xl flex-col gap-12 px-6 py-16 sm:px-10">
        <div className="flex flex-col gap-8 sm:flex-row sm:justify-between">
          <div className="flex flex-col gap-3">
            <span className="font-display text-md font-medium tracking-tight text-text">
              Otolith
            </span>
            <p className="max-w-xs text-sm leading-relaxed text-text-muted">
              An on-chain, non-custodial portfolio auto-rebalancer.
            </p>
          </div>

          <div className="flex flex-wrap gap-12">
            {LINK_GROUPS.map((group) => (
              <div key={group.heading} className="flex flex-col gap-3">
                <span className="text-xs uppercase tracking-[0.16em] text-text-faint">
                  {group.heading}
                </span>
                <ul className="flex flex-col gap-2">
                  {group.links.map((link) => (
                    <li key={link.href}>
                      <a
                        href={link.href}
                        className="text-sm text-text-muted transition-colors duration-[var(--duration-fast)] hover:text-text"
                      >
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-hairline pt-8 text-xs text-text-faint">
          <span>Non-custodial, on-chain.</span>
          <Link href="/app" className="hover:text-text-muted">
            Open app
          </Link>
        </div>
      </div>
    </footer>
  );
}
