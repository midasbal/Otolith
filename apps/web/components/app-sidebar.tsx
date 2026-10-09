"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { AccountStatusView, SidebarView } from "@/components/app/shell-view";
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

function AccountStatus() {
  const { address, connecting, error, createWallet, connectWallet, disconnect } = useWallet();

  return (
    <AccountStatusView
      address={address}
      addressLabel={address ? truncateAddress(address) : null}
      connecting={connecting}
      error={error}
      onCreate={() => void createWallet()}
      onConnect={() => void connectWallet()}
      onDisconnect={() => void disconnect()}
    />
  );
}

export function AppSidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <SidebarView
      links={NAV_LINKS.map((link) => ({ ...link, active: isActiveRoute(pathname, link.href) }))}
      account={<AccountStatus />}
      menuOpen={open}
      onToggleMenu={() => setOpen((value) => !value)}
      onCloseMenu={() => setOpen(false)}
    />
  );
}
