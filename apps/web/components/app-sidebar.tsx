"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { truncateAddress, useWallet } from "@/components/wallet-provider";

const NAV_LINKS = [
  { label: "Dashboard", href: "/app" },
  { label: "Activity", href: "/app/activity" },
  { label: "Explore", href: "/app/explore" },
  { label: "Settings", href: "/app/settings" },
];

function isActiveRoute(pathname: string, href: string) {
  if (href === "/app") {
    return pathname === "/app";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function TestnetBadge() {
  return (
    <span className="inline-flex w-fit items-center rounded-full border border-hairline-strong px-2 py-0.5 text-xs font-medium uppercase tracking-[0.12em] text-text-faint">
      Stellar Testnet
    </span>
  );
}

function Logo() {
  return (
    <div className="flex flex-col gap-2">
      <Link
        href="/app"
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
      <TestnetBadge />
    </div>
  );
}

function AccountStatus() {
  const { address, connecting, error, createWallet, connectWallet, disconnect } = useWallet();

  return (
    <div className="border-t border-hairline pt-4">
      <p className="text-xs uppercase tracking-[0.14em] text-text-faint">
        Account
      </p>

      {address ? (
        <div className="mt-2 flex items-center justify-between gap-3 rounded-md border border-hairline-strong px-3 py-2.5">
          <span
            className="truncate font-mono text-sm text-text-muted"
            title={address}
          >
            {truncateAddress(address)}
          </span>
          <button
            type="button"
            onClick={() => void disconnect()}
            className="shrink-0 rounded-md border border-hairline-strong px-2.5 py-1 text-xs font-medium text-text-muted transition-colors duration-[var(--duration-fast)] ease-[var(--ease-settle)] hover:border-transparent hover:bg-surface-raised hover:text-surface"
          >
            Disconnect
          </button>
        </div>
      ) : (
        <div className="mt-2 flex flex-col gap-2">
          <span className="text-sm text-text-muted">Not connected</span>
          <button
            type="button"
            onClick={() => void createWallet()}
            disabled={connecting}
            className="rounded-md border border-hairline-strong px-2.5 py-1.5 text-xs font-medium text-text-muted transition-colors duration-[var(--duration-fast)] ease-[var(--ease-settle)] hover:border-transparent hover:bg-surface-raised hover:text-surface disabled:opacity-60"
          >
            {connecting ? "Working..." : "Create account"}
          </button>
          <button
            type="button"
            onClick={() => void connectWallet()}
            disabled={connecting}
            className="text-left text-xs font-medium text-text-faint underline decoration-hairline-strong underline-offset-4 transition-colors duration-[var(--duration-fast)] hover:text-text-muted disabled:opacity-60"
          >
            Have an account already? Connect with your passkey
          </button>
        </div>
      )}

      {error ? (
        <p className="mt-2 text-xs leading-relaxed text-text-faint">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function NavLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-1">
      {NAV_LINKS.map((link) => {
        const active = isActiveRoute(pathname, link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            onClick={onNavigate}
            className={`rounded-md px-3 py-2 text-sm font-medium transition-colors duration-[var(--duration-fast)] ${
              active
                ? "bg-surface-raised text-surface"
                : "text-text-muted hover:bg-surface-shade hover:text-text"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AppSidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Desktop and up: the persistent sidebar. Sticky and viewport-tall
          so it stays in view while the main content scrolls, instead of
          scrolling away with the rest of the page. */}
      <aside className="hidden w-64 shrink-0 flex-col overflow-y-auto border-r border-hairline px-4 py-6 lg:sticky lg:top-0 lg:flex lg:h-screen">
        <div className="flex flex-1 flex-col gap-8">
          <Logo />
          <NavLinks pathname={pathname} />
        </div>
        <AccountStatus />
      </aside>

      {/* Below lg: a top bar with a menu toggle in place of the
          persistent sidebar, opening a simple dropdown drawer. */}
      <div className="border-b border-hairline lg:hidden">
        <div className="flex items-center justify-between gap-4 px-4 py-4">
          <Logo />
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls="app-mobile-nav"
            className="rounded-md border border-hairline-strong px-3 py-2 text-sm font-medium text-text-muted"
          >
            {open ? "Close" : "Menu"}
          </button>
        </div>

        {open ? (
          <div
            id="app-mobile-nav"
            className="flex flex-col gap-6 border-t border-hairline px-4 py-4"
          >
            <NavLinks pathname={pathname} onNavigate={() => setOpen(false)} />
            <AccountStatus />
          </div>
        ) : null}
      </div>
    </>
  );
}
