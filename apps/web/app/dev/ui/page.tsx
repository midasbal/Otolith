import type { Metadata } from "next";
import { notFound } from "next/navigation";

export const metadata: Metadata = {
  title: "UI gallery",
  robots: { index: false, follow: false },
};

type Query = { [key: string]: string | string[] | undefined };

type DevUiPageProps = {
  searchParams: Promise<Query>;
};

function single(value: Query[string]): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/**
 * A development-only gallery of the design system: every token, every
 * primitive, and every app screen in every state, rendered from mock
 * props. It never reads a wallet, a contract, or the network, so each
 * state can be reviewed without a passkey or testnet funds.
 *
 * It does not exist in production. NODE_ENV is replaced with a literal
 * when the app is built, so in a production build the branch below, and
 * the gallery import inside it, is compiled away, and this server
 * component prerenders as a 404. The check runs on the server at build
 * time; nothing is hidden client-side.
 *
 * `?screen=dashboard&state=ready` shows one app screen in one state on
 * its own, in the chrome its real route has; `&menu` opens the sheet the
 * small-screen top bar leads to. `?bg=annuli` shows the background lab
 * full screen. The query is read inside the
 * development branch only, so the production page stays a static 404.
 */
export default async function DevUiPage({ searchParams }: DevUiPageProps) {
  if (process.env.NODE_ENV !== "production") {
    const { Gallery } = await import("@/components/dev/gallery");
    const query = await searchParams;
    return (
      <Gallery
        screen={single(query.screen)}
        state={single(query.state)}
        tab={single(query.tab)}
        menu={query.menu !== undefined}
        background={single(query.bg)}
        bare={query.bare !== undefined}
      />
    );
  }

  notFound();
}
