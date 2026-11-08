"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { queryKeys } from "@/components/query-keys";

/**
 * The app's one QueryClient, for the screens under /app. It is created
 * once in state, so it survives every render and every move between
 * app pages, and the data it holds is what lets a page open with the
 * last reading already in hand.
 *
 * Only two defaults are set here. A window regaining focus does not
 * refetch: the screens already read fresh on arrival, and a refetch on
 * every focus would only add RPC traffic. A failed read is tried twice
 * more before it counts as failed. How long a reading stays fresh is
 * deliberately not set globally: each query says so for itself.
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(() => {
    const created = new QueryClient({
      defaultOptions: {
        queries: {
          refetchOnWindowFocus: false,
          retry: 2,
        },
      },
    });
    // The policy floors are written by the app, not read from anywhere, and
    // are held to their own window (see policy-ledger-floor.ts), so the
    // cache must not drop them for want of a subscriber.
    created.setQueryDefaults(queryKeys.allPolicyFloors, { gcTime: Infinity, staleTime: Infinity });
    return created;
  });

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
