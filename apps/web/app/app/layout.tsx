"use client";

import { usePathname } from "next/navigation";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteFooter } from "@/components/site-footer";
import { QueryProvider } from "@/components/query-provider";
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
    <QueryProvider>
      <WalletProvider>
        <a href="#main" className="ot-skip-link">
          Skip to content
        </a>
        {isFocusedRoute(pathname) ? (
          <main id="main" className="min-h-screen">
            {children}
          </main>
        ) : (
          <div className="flex min-h-screen flex-col lg:flex-row">
            <AppSidebar />
            {/* The footer sits under the content column, beside the sidebar
                and not under it. The focused setup flow above has none. */}
            <div className="flex min-w-0 flex-1 flex-col">
              <main id="main" className="flex-1">
                {children}
              </main>
              <SiteFooter className="max-w-3xl" />
            </div>
          </div>
        )}
      </WalletProvider>
    </QueryProvider>
  );
}
