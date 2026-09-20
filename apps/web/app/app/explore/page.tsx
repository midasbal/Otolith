"use client";

import { truncateAddress } from "@/components/wallet-provider";
import { useLivePrices } from "@/components/use-live-prices";
import { formatUsd } from "@/lib/stellar";
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

function findPrice(prices: { symbol: string; price: number | null }[], symbol: string): number | null {
  return prices.find((entry) => entry.symbol === symbol)?.price ?? null;
}

function PriceReadout({ price }: { price: number | null }) {
  if (price === null) {
    return <span className="text-panel-text/40">price not available</span>;
  }
  return <>${formatUsd(price)}</>;
}

export default function ExplorePage() {
  const pricesState = useLivePrices(ORACLE, SUPPORTED_SYMBOLS);

  return (
    <div className="mx-auto flex max-w-3xl flex-col px-6 py-16 sm:px-10">
      <h1 className="font-display text-2xl font-medium tracking-tight text-text">
        Explore
      </h1>
      <p className="mt-4 max-w-xl text-base leading-relaxed text-text-muted">
        The two assets Otolith actually supports today, priced from the same Reflector
        oracle its contracts read.
      </p>

      <div className="mt-8 grid min-w-0 gap-6 sm:grid-cols-2">
        {SUPPORTED_ASSETS.map((asset) => {
          const price = pricesState.status === "loaded" ? findPrice(pricesState.prices, asset.symbol) : null;
          return (
            <div key={asset.symbol} className="panel min-w-0 rounded-lg p-6">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-panel-text">{asset.name}</p>
                <p className="text-xs text-panel-text/60">{asset.symbol}</p>
              </div>

              <p className="mt-4 font-mono text-xl tabular-nums text-panel-text">
                <PriceReadout price={price} />
              </p>
              <p className="mt-1 text-xs text-panel-text/50">Live oracle price</p>

              <p className="mt-4 text-sm leading-relaxed text-panel-text/70">{asset.role}</p>

              <div className="mt-4 flex items-center justify-between gap-4 border-t border-panel-border pt-3">
                <span className="text-xs text-panel-text/60">Contract</span>
                <a
                  href={`https://stellar.expert/explorer/testnet/contract/${asset.contract}`}
                  target="_blank"
                  rel="noreferrer"
                  className="min-w-0 truncate font-mono text-xs text-panel-text underline decoration-hairline-strong underline-offset-4 hover:text-panel-text/80"
                >
                  {truncateAddress(asset.contract)}
                </a>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
