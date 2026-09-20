import Image from "next/image";
import Link from "next/link";

const NAV_LINKS = [
  { label: "How it works", href: "#how-it-works" },
  { label: "Security", href: "#security" },
  { label: "Docs", href: "#docs" },
];

export function LandingHeader() {
  return (
    <header className="border-b border-hairline">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-6 px-6 py-6 sm:px-10">
        <Link
          href="/"
          className="flex items-center gap-2.5 font-display text-lg font-medium tracking-tight text-text"
        >
          <Image
            src="/otolith-logo.png"
            alt=""
            width={48}
            height={48}
            className="h-[48px] w-[48px]"
          />
          Otolith
        </Link>

        <nav className="hidden items-center gap-8 sm:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm text-text-muted transition-colors duration-[var(--duration-fast)] hover:text-text"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <Link
          href="/app"
          className="inline-flex items-center justify-center rounded-md bg-[var(--color-surface-raised)] px-6 py-3 text-sm font-medium text-[var(--color-surface)] transition-[transform,background-color] duration-[var(--duration-fast)] ease-[var(--ease-settle)] hover:-translate-y-0.5 hover:bg-[var(--color-surface-raised-hover)] motion-reduce:hover:translate-y-0"
        >
          Open app
        </Link>
      </div>

      {/* Small screens: the same links, wrapped beneath the top row rather
          than hidden behind a menu. Simple by design at this stage. */}
      <nav className="flex items-center gap-6 overflow-x-auto px-6 pb-4 sm:hidden">
        {NAV_LINKS.map((link) => (
          <a
            key={link.href}
            href={link.href}
            className="whitespace-nowrap text-sm text-text-muted transition-colors duration-[var(--duration-fast)] hover:text-text"
          >
            {link.label}
          </a>
        ))}
      </nav>
    </header>
  );
}
