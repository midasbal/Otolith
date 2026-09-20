"use client";

import { usePathname } from "next/navigation";
import { AppSidebar } from "@/components/app-sidebar";
import { WalletProvider } from "@/components/wallet-provider";

// /app/setup is a dedicated, full-attention flow, not the standard
// dashboard chrome: no sidebar, just the flow and a way back.
function isFocusedRoute(pathname: string | null): boolean {
  return pathname?.startsWith("/app/setup") ?? false;
}

export default function AppShellLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();

  return (
    <WalletProvider>
      {isFocusedRoute(pathname) ? (
        <div className="min-h-screen">{children}</div>
      ) : (
        <div className="flex min-h-screen flex-col lg:flex-row">
          <AppSidebar />
          <main className="min-w-0 flex-1">{children}</main>
        </div>
      )}
    </WalletProvider>
  );
}
