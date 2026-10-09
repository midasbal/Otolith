import Link from "next/link";
import { BackgroundToggle } from "@/components/background/background";
import type { ReactNode } from "react";
import { TestnetBadge } from "@/components/ui/badge";
import { Button, IconButton, TextButton } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Icon, type IconName } from "@/components/ui/icons";
import { Mark } from "@/components/ui/mark";
import { Notice } from "@/components/ui/states";

/*
  The app's chrome: the sidebar on wide screens, a top bar with a sheet
  below that, and the account block both of them hold. Presentational:
  which link is current, who is connected, and whether the menu is open
  all arrive as props from components/app-sidebar.tsx.
*/

export type ShellLink = {
  label: string;
  href: string;
  active: boolean;
};

const LINK_ICONS: Record<string, IconName> = {
  "/app": "dashboard",
  "/app/activity": "activity",
  "/app/explore": "explore",
  "/app/settings": "settings",
};

function ShellLogo() {
  return (
    <div className="flex flex-col items-start gap-2">
      <Link
        href="/app"
        className="flex items-center gap-2.5 rounded-md font-display text-md font-medium tracking-display text-text"
      >
        <Mark className="h-9 w-9" />
        Otolith
      </Link>
      <TestnetBadge />
    </div>
  );
}

function ShellNav({ links, onNavigate }: { links: ShellLink[]; onNavigate?: () => void }) {
  return (
    <nav aria-label="App" className="flex flex-col gap-1.5">
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          aria-current={link.active ? "page" : undefined}
          onClick={onNavigate}
          className="ot-navlink ot-navlink-icon w-full"
        >
          <Icon name={LINK_ICONS[link.href] ?? "dashboard"} size={18} />
          {link.label}
        </Link>
      ))}
    </nav>
  );
}

type AccountStatusViewProps = {
  address: string | null;
  /** The address, shortened for display. */
  addressLabel: string | null;
  connecting: boolean;
  error: string | null;
  onCreate: () => void;
  onConnect: () => void;
  onDisconnect: () => void;
};

/** Who is connected, with the way in or the way out. */
export function AccountStatusView({
  address,
  addressLabel,
  connecting,
  error,
  onCreate,
  onConnect,
  onDisconnect,
}: AccountStatusViewProps) {
  return (
    <div className="flex flex-col gap-3">
      <p className="ot-caps">Account</p>

      {address ? (
        <div className="flex flex-col items-start gap-3">
          <span className="ot-pressed-sm ot-num w-full truncate rounded-md px-4 py-2.5 text-sm text-text" title={address}>
            {addressLabel}
          </span>
          <Button size="sm" onClick={onDisconnect}>
            Disconnect
          </Button>
        </div>
      ) : (
        <div className="flex flex-col items-start gap-3">
          <span className="text-sm text-text-muted">Not connected</span>
          <Button size="sm" onClick={onCreate} disabled={connecting} loading={connecting}>
            {connecting ? "Working..." : "Create account"}
          </Button>
          <TextButton onClick={onConnect} disabled={connecting} className="text-sm">
            Have an account already? Connect with your passkey
          </TextButton>
        </div>
      )}

      {error ? (
        <Notice tone="danger" role="alert" className="px-3 py-3 text-xs">
          {error}
        </Notice>
      ) : null}
    </div>
  );
}

type SidebarViewProps = {
  links: ShellLink[];
  /** The account block. Rendered in the sidebar, and again in the sheet. */
  account: ReactNode;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
};

export function SidebarView({ links, account, menuOpen, onToggleMenu, onCloseMenu }: SidebarViewProps) {
  return (
    <>
      {/* lg and up: the persistent sidebar, a raised panel that stays in
          view while the main content scrolls. */}
      <aside className="hidden w-72 shrink-0 p-4 lg:sticky lg:top-0 lg:flex lg:h-screen">
        <div className="ot-raised flex min-h-0 flex-1 flex-col gap-8 overflow-y-auto rounded-xl p-5">
          <div className="flex flex-1 flex-col gap-8">
            <div className="flex items-start justify-between gap-2">
              <ShellLogo />
              <BackgroundToggle />
            </div>
            <ShellNav links={links} />
          </div>
          <div className="flex flex-col gap-5">
            <div className="ot-divider" />
            {account}
          </div>
        </div>
      </aside>

      {/* Below lg: a top bar, and the same navigation in a sheet. */}
      <div className="px-[var(--space-gutter)] pt-4 lg:hidden">
        <div className="ot-raised flex items-center justify-between gap-3 rounded-xl px-3 py-3 sm:px-5">
          <ShellLogo />
          <div className="flex items-center gap-2">
            <BackgroundToggle />
            <IconButton label="Menu" aria-haspopup="dialog" aria-expanded={menuOpen} onClick={onToggleMenu}>
              <Icon name="menu" />
            </IconButton>
          </div>
        </div>
      </div>

      <Dialog open={menuOpen} onClose={onCloseMenu} title="Menu" variant="sheet">
        {menuOpen ? (
          <div className="flex flex-col gap-6">
            <ShellNav links={links} onNavigate={onCloseMenu} />
            <div className="ot-divider" />
            {account}
          </div>
        ) : null}
      </Dialog>
    </>
  );
}
