import { TextLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataList, DataRow } from "@/components/ui/data-list";
import { Notice, Skeleton } from "@/components/ui/states";
import { formatUsd } from "@/lib/stellar/format";
import { Screen, ScreenHeader } from "./common";
import type { LivePricesState } from "./types";

/*
  Explore, as markup: the assets Otolith supports and their live oracle
  prices. The list and the prices arrive from app/app/explore/page.tsx.
*/

export type ExploreAsset = {
  symbol: string;
  name: string;
  contract: string;
  /** The contract address, shortened for display. */
  contractLabel: string;
  role: string;
};

function findPrice(prices: { symbol: string; price: number | null }[], symbol: string): number | null {
  return prices.find((entry) => entry.symbol === symbol)?.price ?? null;
}

function PriceReadout({ price }: { price: number | null }) {
  if (price === null) {
    return <p className="text-base text-text-muted">price not available</p>;
  }
  return <p className="nm-num text-xl text-text">${formatUsd(price)}</p>;
}

export function ExploreView({ assets, pricesState }: { assets: ExploreAsset[]; pricesState: LivePricesState }) {
  return (
    <Screen>
      <ScreenHeader title="Explore">
        The two assets Otolith actually supports today, priced from the same Reflector
        oracle its contracts read.
      </ScreenHeader>

      {pricesState.status === "error" ? (
        <Notice tone="danger" role="alert">
          {pricesState.message}
        </Notice>
      ) : null}

      <div className="grid min-w-0 gap-6 sm:grid-cols-2">
        {assets.map((asset) => {
          const price = pricesState.status === "loaded" ? findPrice(pricesState.prices, asset.symbol) : null;
          return (
            <Card key={asset.symbol} className="flex flex-col gap-5">
              <div className="min-w-0">
                <h2 className="truncate font-display text-base font-medium text-text">{asset.name}</h2>
                <p className="nm-caps mt-1">{asset.symbol}</p>
              </div>

              <div>
                <div className="flex min-h-9 items-center">
                  {pricesState.status === "loading" ? (
                    <>
                      <span className="sr-only" role="status">
                        Reading the live price
                      </span>
                      <Skeleton className="h-7 w-32" />
                    </>
                  ) : (
                    <PriceReadout price={price} />
                  )}
                </div>
                <p className="mt-1 text-sm text-text-muted">Live oracle price</p>
              </div>

              <p className="text-sm leading-relaxed text-text-muted">{asset.role}</p>

              <DataList className="mt-auto">
                <DataRow label="Contract">
                  <TextLink
                    href={`https://stellar.expert/explorer/testnet/contract/${asset.contract}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs"
                  >
                    {asset.contractLabel}
                  </TextLink>
                </DataRow>
              </DataList>
            </Card>
          );
        })}
      </div>
    </Screen>
  );
}
