import { Screen, ScreenHeader } from "@/components/app/common";

export default async function AssetDetailPage({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) {
  const { symbol } = await params;

  return (
    <Screen>
      <ScreenHeader title={symbol.toUpperCase()}>Asset detail is coming soon.</ScreenHeader>
    </Screen>
  );
}
