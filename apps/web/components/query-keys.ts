/*
  The keys of the app's cached chain reads, in one place so that what a
  hook reads under and what an action invalidates can never drift apart.
  Everything per-account carries the address as its second part, so one
  account's readings are never served to another.
*/
export const queryKeys = {
  policy: (address: string | null) => ["policy", address] as const,
  balances: (address: string | null) => ["balances", address] as const,
  rebalanceCheck: (address: string | null) => ["rebalanceCheck", address] as const,
  /** The oracle prices for a pair. Market data, not per-account. */
  prices: (oracle: string | null, sellSymbol: string | null, buySymbol: string | null) =>
    ["prices", oracle, sellSymbol, buySymbol] as const,
  /** Every prices reading, whichever pair. */
  allPrices: ["prices"] as const,
};
