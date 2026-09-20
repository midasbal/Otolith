export default async function AssetDetailPage({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) {
  const { symbol } = await params;

  return (
    <div className="mx-auto flex max-w-3xl flex-col px-6 py-16 sm:px-10">
      <h1 className="font-display text-2xl font-medium tracking-tight text-text">
        {symbol.toUpperCase()}
      </h1>
      <p className="mt-4 max-w-xl text-base leading-relaxed text-text-muted">
        Asset detail is coming soon.
      </p>
    </div>
  );
}
