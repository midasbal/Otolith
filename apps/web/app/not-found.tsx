import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { GlowText } from "@/components/ui/glow-text";
import { Level } from "@/components/ui/level";
import { Mark } from "@/components/ui/mark";
import { ThemeToggle } from "@/components/ui/theme";

export const metadata: Metadata = {
  title: "Page not found | Otolith",
};

/**
 * Shown for any address the app has no page for. An unmatched address is
 * rendered inside the root layout alone, without the site's header and
 * footer or the app's sidebar, so this page carries its own small header
 * and the two ways back: the homepage and the app.
 *
 * The "404" is the page's picture, set in the display face at a size of
 * its own and lit like the landing headline (under prefers-reduced-motion
 * it keeps the one still halo). Under it is the product's own instrument,
 * the level, with its bubble far outside the band: the portfolio picture
 * of "lost". The level is decoration; its settling is switched off under
 * prefers-reduced-motion by its own styles (see landing.css). The heading
 * a screen reader gets is the plain sentence, not the digits.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="ot-container pt-4 sm:pt-6">
        <div className="flex items-center justify-between gap-4">
          <Link
            href="/"
            className="flex items-center gap-2.5 rounded-md font-display text-md font-medium tracking-display text-text"
          >
            <Mark />
            Otolith
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <main id="main" className="ot-container flex flex-1 items-center py-12 sm:py-16">
        <Card depth="lg" className="mx-auto flex w-full max-w-3xl flex-col items-center gap-8 text-center">
          <h1>
            <span className="sr-only">404, page not found</span>
            <GlowText aria-hidden="true" className="font-display text-[clamp(6rem,30vw,15rem)] leading-none font-medium tracking-display text-text">
              <span data-glow-static="">404</span>
            </GlowText>
          </h1>

          <div className="flex w-full flex-col gap-2" aria-hidden="true">
            <Level drift={4} band={1} from={0} className="w-full" />
            <div className="flex justify-between">
              <span className="ot-caps">Target</span>
              <span className="ot-caps">This page</span>
            </div>
          </div>

          <div className="flex max-w-xl flex-col gap-3">
            <p className="font-display text-xl font-medium tracking-display text-text">Off the ledger.</p>
            <p className="text-base leading-relaxed text-text-muted">
              This page isn&rsquo;t on any ledger, and not even the keeper could
              rebalance it back. Your funds, naturally, never left your account.
            </p>
          </div>

          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
            <ButtonLink href="/" variant="primary">
              Back to home
            </ButtonLink>
            <ButtonLink href="/app">Open app</ButtonLink>
          </div>
        </Card>
      </main>
    </div>
  );
}
