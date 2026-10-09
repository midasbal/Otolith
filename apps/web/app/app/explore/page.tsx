"use client";

import { truncateAddress } from "@/components/wallet-provider";
import { useLivePrices } from "@/components/use-live-prices";
import { ExploreView } from "@/components/app/explore-view";
import { ORACLE, XLM_ASSET, USDC_ASSET } from "@/lib/stellar/policy-config";

type SupportedSymbol = "XLM" | "USDC";

const SUPPORTED_SYMBOLS: SupportedSymbol[] = ["XLM", "USDC"];

const SUPPORTED_ASSETS: Array<{
  symbol: SupportedSymbol;
  name: string;
  contract: string;
  role: string;
}> = [
  {
    symbol: "XLM",
    name: "Stellar Lumens",
    contract: XLM_ASSET.contract,
    role: "The volatile asset in Otolith's pair. It is what an account holds by default, and always the asset the rebalancer sells from.",
  },
  {
    symbol: "USDC",
    name: "USD Coin",
    contract: USDC_ASSET.contract,
    role: "The stable asset in Otolith's pair. It is always the asset the rebalancer buys into, to bring a portfolio back to its target split.",
  },
];

export default function ExplorePage() {
  const pricesState = useLivePrices(ORACLE, SUPPORTED_SYMBOLS);

  return (
    <ExploreView
      assets={SUPPORTED_ASSETS.map((asset) => ({ ...asset, contractLabel: truncateAddress(asset.contract) }))}
      pricesState={pricesState}
    />
  );
}
