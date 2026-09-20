import Image from "next/image";
import Link from "next/link";
import { Reveal } from "@/components/reveal";
import { RotatingWord } from "@/components/rotating-word";

const WHY_DIFFERENT_POINTS = [
  {
    title: "Your funds never leave your wallet",
    body: "Rebalances execute as ordinary transactions from your own smart-account wallet. Otolith is never a custodian and never holds a balance of your assets.",
  },
  {
    title: "Every rebalance is checked on-chain",
    body: "Your wallet's own policy contract validates each trade's size, slippage, and timing against your rules before it is allowed to execute.",
  },
  {
    title: "Anyone can trigger a due rebalance",
    body: "Once your portfolio drifts past its threshold, the rebalance is public and permissionless to trigger, with your own manual trigger as a backstop.",
  },
];

const HOW_IT_WORKS_STEPS = [
  {
    index: "01",
    title: "Set your target weights",
    body: "You choose the target allocation in your own smart-account wallet.",
  },
  {
    index: "02",
    title: "Otolith watches your drift",
    body: "The policy compares your holdings against oracle prices.",
  },
  {
    index: "03",
    title: "A rebalance becomes due",
    body: "When drift crosses your threshold.",
  },
  {
    index: "04",
    title: "Anyone can trigger it",
    body: "And the policy enforces the bounds, slippage, sizing, and cooldown, on every trade.",
  },
];

const SECURITY_POINTS = [
  {
    title: "Non-custodial by construction",
    body: "Funds stay in your account.",
  },
  {
    title: "An independent policy contract",
    body: "It bounds every fund movement.",
  },
  {
    title: "No admin key, no upgrade path",
    body: "No backdoor.",
  },
  {
    title: "Fully on-chain and verifiable",
    body: "Anyone can inspect the contracts and confirm every rebalance.",
  },
];

function PrimaryButton({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center justify-center rounded-md bg-[var(--color-surface-raised)] px-6 py-3 text-sm font-medium text-[var(--color-surface)] transition-[transform,background-color] duration-[var(--duration-fast)] ease-[var(--ease-settle)] hover:-translate-y-0.5 hover:bg-[var(--color-surface-raised-hover)] motion-reduce:hover:translate-y-0"
    >
      {children}
    </Link>
  );
}

export default function Landing() {
  return (
    <>
      {/* Hero: the only section carrying the photo background, full
          bleed edge to edge. A pale wash of the surface color sits over
          the image so the dark ink headline and supporting line stay
          readable everywhere, including where the photo's dark object
          sits toward the right, and on narrow viewports. */}
      <section className="relative isolate flex min-h-[560px] items-center overflow-hidden sm:min-h-[640px]">
        <Image
          src="/otolith-hero.jpeg"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <div aria-hidden="true" className="absolute inset-0 bg-surface/78" />

        <div className="relative mx-auto flex w-full max-w-7xl flex-col items-start gap-8 px-6 py-20 sm:px-10 sm:py-28">
          <h1 className="max-w-3xl font-display text-2xl font-medium tracking-tight text-text sm:text-display">
            <span className="sr-only">
              Automated portfolio rebalancing that never leaves your wallet.
            </span>
            <span aria-hidden="true">
              <RotatingWord /> portfolio rebalancing that never leaves your
              wallet.
            </span>
          </h1>

          <p className="max-w-xl text-md leading-relaxed text-text-muted">
            Set target weights once. When your portfolio drifts, Otolith
            brings it back through your own wallet, on-chain.
          </p>

          <div className="flex flex-wrap items-center gap-6">
            <PrimaryButton href="/app">Open app</PrimaryButton>
            <a
              href="#how-it-works"
              className="text-sm text-text-muted underline decoration-hairline-strong underline-offset-4 transition-colors duration-[var(--duration-fast)] hover:text-text"
            >
              See how it works
            </a>
          </div>
        </div>
      </section>

      <div className="mx-auto flex max-w-7xl flex-col px-6 sm:px-10">
        {/* What it is, and why it is different */}
        <Reveal>
          <section
            id="why-different"
            className="grid grid-cols-1 gap-10 border-t border-hairline py-20 lg:grid-cols-12 lg:gap-8"
          >
            <div className="min-w-0 lg:col-span-4">
              <h2 className="font-display text-xl font-medium text-text">
                What it is, and why it is different
              </h2>
              <p className="mt-4 max-w-md text-base leading-relaxed text-text-muted">
                Most rebalancing tools ask you to hand over your funds, either
                to a manager or to an off-chain system you have to trust.
                Otolith does not. Your funds stay in your own wallet at every
                step, and rebalancing runs as a transaction your wallet&apos;s own
                policy contract validates and bounds, on-chain, every time.
              </p>
            </div>

            <div className="grid min-w-0 grid-cols-1 gap-5 sm:grid-cols-2 lg:col-span-8 lg:grid-cols-3">
              {WHY_DIFFERENT_POINTS.map((point) => (
                <div key={point.title} className="panel min-w-0 rounded-lg p-6">
                  <h3 className="font-display text-base font-medium text-panel-text">
                    {point.title}
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-panel-text/70">
                    {point.body}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </Reveal>

        {/* How it works */}
        <Reveal>
          <section
            id="how-it-works"
            className="grid grid-cols-1 gap-10 border-t border-hairline py-20 lg:grid-cols-12 lg:gap-8"
          >
            <div className="min-w-0 lg:col-span-4 lg:self-center">
              <h2 className="font-display text-xl font-medium text-text">
                How it works
              </h2>
              <p className="mt-4 max-w-md text-base leading-relaxed text-text-muted">
                Four steps, from setting your targets to a trade landing back
                in your own wallet.
              </p>
            </div>

            <div className="min-w-0 lg:col-span-8">
              <div className="grid grid-cols-1 gap-px border border-hairline bg-hairline sm:grid-cols-2">
                {HOW_IT_WORKS_STEPS.map((step) => (
                  <div key={step.title} className="min-w-0 bg-surface px-6 py-6">
                    <span className="font-mono text-xs tabular-nums text-text-faint">
                      {step.index}
                    </span>
                    <h3 className="mt-2 font-display text-base font-medium text-text">
                      {step.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-text-muted">
                      {step.body}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </Reveal>

        {/* Security */}
        <Reveal>
          <section
            id="security"
            className="grid grid-cols-1 gap-10 border-t border-hairline py-20 lg:grid-cols-12 lg:gap-8"
          >
            <div className="min-w-0 lg:col-span-4 lg:self-center">
              <h2 className="font-display text-xl font-medium text-text">
                Security
              </h2>
              <p className="mt-4 max-w-md text-base leading-relaxed text-text-muted">
                Built so there is no party, including Otolith, in a position
                to move your funds anywhere you have not authorized.
              </p>
            </div>

            <div className="min-w-0 lg:col-span-8">
              <div className="grid grid-cols-1 gap-px border border-hairline bg-hairline sm:grid-cols-2">
                {SECURITY_POINTS.map((point) => (
                  <div key={point.title} className="min-w-0 bg-surface px-6 py-6">
                    <h3 className="font-display text-base font-medium text-text">
                      {point.title}
                    </h3>
                    {point.body ? (
                      <p className="mt-2 text-sm leading-relaxed text-text-muted">
                        {point.body}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>

              <p className="mt-8 max-w-2xl text-base font-medium leading-relaxed text-text">
                Otolith is live on Stellar testnet today. The contracts have
                not yet been independently audited.
              </p>
            </div>
          </section>
        </Reveal>

        {/* Closing call to action */}
        <Reveal>
          <section className="flex flex-col items-center gap-6 border-t border-hairline py-24 text-center">
            <h2 className="max-w-xl font-display text-2xl font-medium tracking-tight text-text">
              Your portfolio, held to the weights you choose.
            </h2>
            <p className="text-base text-text-muted">
              Connect a wallet and set your targets.
            </p>
            <PrimaryButton href="/app">Open app</PrimaryButton>
          </section>
        </Reveal>
      </div>
    </>
  );
}
