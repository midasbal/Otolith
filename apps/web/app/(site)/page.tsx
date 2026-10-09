import { HeroDial } from "@/components/landing/hero-dial";
import { Reveal } from "@/components/reveal";
import { RotatingWord } from "@/components/rotating-word";
import { ButtonLink } from "@/components/ui/button";
import { Card, IconWell } from "@/components/ui/card";
import { GlowText } from "@/components/ui/glow-text";
import { Icon, type IconName } from "@/components/ui/icons";
import { Notice } from "@/components/ui/states";

const WHY_DIFFERENT_POINTS: Array<{ icon: IconName; title: string; body: string }> = [
  {
    icon: "wallet",
    title: "Your funds never leave your wallet",
    body: "Rebalances execute as ordinary transactions from your own smart-account wallet. Otolith is never a custodian and never holds a balance of your assets.",
  },
  {
    icon: "shield",
    title: "Every rebalance is checked on-chain",
    body: "Your wallet's own policy contract validates each trade's size, slippage, and timing against your rules before it is allowed to execute.",
  },
  {
    icon: "broadcast",
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

const SECURITY_POINTS: Array<{ icon: IconName; title: string; body: string }> = [
  {
    icon: "lock",
    title: "Non-custodial by construction",
    body: "Funds stay in your account.",
  },
  {
    icon: "contract",
    title: "An independent policy contract",
    body: "It bounds every fund movement.",
  },
  {
    icon: "no-key",
    title: "No admin key, no upgrade path",
    body: "No backdoor.",
  },
  {
    icon: "verify",
    title: "Fully on-chain and verifiable",
    body: "Anyone can inspect the contracts and confirm every rebalance.",
  },
];

export default function Landing() {
  return (
    <>
      {/* Hero: the headline and its two actions beside the allocation
          dial, which stands where the photograph used to. On narrow
          viewports the dial drops beneath the copy. */}
      <section className="nm-container grid items-center gap-14 pb-6 pt-14 sm:pt-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:gap-12 lg:pt-24">
        <div className="flex min-w-0 flex-col items-start gap-8">
          <h1 className="font-display text-display font-medium tracking-display text-text">
            <span className="sr-only">
              Automated portfolio rebalancing that never leaves your wallet.
            </span>
            <GlowText aria-hidden="true">
              <RotatingWord /> portfolio rebalancing that never leaves your
              wallet.
            </GlowText>
          </h1>

          <p className="max-w-xl text-md leading-relaxed text-text-muted">
            Set target weights once. When your portfolio drifts, Otolith
            brings it back through your own wallet, on-chain.
          </p>

          <div className="flex w-full flex-col gap-4 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
            <ButtonLink href="/app" variant="primary" size="lg">
              Open app
            </ButtonLink>
            <ButtonLink href="#how-it-works" native size="lg">
              See how it works
            </ButtonLink>
          </div>
        </div>

        <HeroDial />
      </section>

      <div className="nm-container flex flex-col">
        {/* What it is, and why it is different */}
        <Reveal>
          <section id="why-different" aria-labelledby="why-different-heading" className="nm-section flex flex-col gap-10">
            <div className="min-w-0">
              <h2 id="why-different-heading" className="font-display text-xl font-medium text-text">
                What it is, and why it is different
              </h2>
              <p className="mt-4 max-w-2xl text-base leading-relaxed text-text-muted">
                Most rebalancing tools ask you to hand over your funds, either
                to a manager or to an off-chain system you have to trust.
                Otolith does not. Your funds stay in your own wallet at every
                step, and rebalancing runs as a transaction your wallet&apos;s own
                policy contract validates and bounds, on-chain, every time.
              </p>
            </div>

            <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-3 lg:gap-8">
              {WHY_DIFFERENT_POINTS.map((point) => (
                <Card key={point.title} className="flex flex-col gap-5 sm:flex-row lg:flex-col">
                  <IconWell>
                    <Icon name={point.icon} />
                  </IconWell>
                  <div>
                    <h3 className="font-display text-base font-medium text-text">
                      {point.title}
                    </h3>
                    <p className="mt-3 text-sm leading-relaxed text-text-muted">
                      {point.body}
                    </p>
                  </div>
                </Card>
              ))}
            </div>
          </section>
        </Reveal>

        {/* How it works */}
        <Reveal>
          <section id="how-it-works" aria-labelledby="how-it-works-heading" className="nm-section flex scroll-mt-6 flex-col gap-10 pt-0">
            <div className="min-w-0">
              <h2 id="how-it-works-heading" className="font-display text-xl font-medium text-text">
                How it works
              </h2>
              <p className="mt-4 max-w-2xl text-base leading-relaxed text-text-muted">
                Four steps, from setting your targets to a trade landing back
                in your own wallet.
              </p>
            </div>

            <ol className="grid min-w-0 grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
              {HOW_IT_WORKS_STEPS.map((step) => (
                <Card key={step.title} as="li" className="flex flex-col gap-5">
                  <IconWell className="nm-num text-sm font-medium tabular-nums">
                    {step.index}
                  </IconWell>
                  <div>
                    <h3 className="font-display text-base font-medium text-text">
                      {step.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-text-muted">
                      {step.body}
                    </p>
                  </div>
                </Card>
              ))}
            </ol>
          </section>
        </Reveal>

        {/* Security */}
        <Reveal>
          <section
            id="security"
            aria-labelledby="security-heading"
            className="nm-section grid scroll-mt-6 grid-cols-1 gap-10 pt-0 lg:grid-cols-12 lg:gap-12"
          >
            <div className="min-w-0 lg:col-span-4 lg:self-center">
              <h2 id="security-heading" className="font-display text-xl font-medium text-text">
                Security
              </h2>
              <p className="mt-4 max-w-md text-base leading-relaxed text-text-muted">
                Built so there is no party, including Otolith, in a position
                to move your funds anywhere you have not authorized.
              </p>
            </div>

            <div className="min-w-0 lg:col-span-8">
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                {SECURITY_POINTS.map((point) => (
                  <Card key={point.title} variant="pressed" className="flex items-start gap-4">
                    <IconWell raised>
                      <Icon name={point.icon} />
                    </IconWell>
                    <div className="min-w-0">
                      <h3 className="font-display text-base font-medium text-text">
                        {point.title}
                      </h3>
                      {point.body ? (
                        <p className="mt-2 text-sm leading-relaxed text-text-muted">
                          {point.body}
                        </p>
                      ) : null}
                    </div>
                  </Card>
                ))}
              </div>

              <Notice role="note" className="mt-8 text-base font-medium">
                Otolith is live on Stellar testnet today. The contracts have
                not yet been independently audited.
              </Notice>
            </div>
          </section>
        </Reveal>

        {/* Closing call to action */}
        <Reveal>
          <section aria-labelledby="cta-heading" className="nm-section pt-0">
            <div className="nm-pressed-lg flex flex-col items-center gap-6 rounded-xl px-6 py-16 text-center sm:py-20">
              <h2 id="cta-heading" className="max-w-xl font-display text-2xl font-medium tracking-display text-text">
                <GlowText>
                  <span data-glow-static="">Your portfolio,</span> held to the weights you choose.
                </GlowText>
              </h2>
              <p className="text-base text-text-muted">
                Connect a wallet and set your targets.
              </p>
              <ButtonLink href="/app" variant="primary" size="lg">
                Open app
              </ButtonLink>
            </div>
          </section>
        </Reveal>
      </div>
    </>
  );
}
