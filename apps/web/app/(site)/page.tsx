import { ChapterHud } from "@/components/landing/chapter-hud";
import { RebalanceDemo } from "@/components/landing/rebalance-demo";
import { Reveal } from "@/components/reveal";
import { RotatingWord } from "@/components/rotating-word";
import { ButtonLink } from "@/components/ui/button";
import { Card, IconWell } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { GlowText } from "@/components/ui/glow-text";
import { Icon, type IconName } from "@/components/ui/icons";
import { Logo } from "@/components/ui/mark";
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

/** The line that opens a chapter: its number, a rule, its name. */
function ChapterLabel({ index, name }: { index: string; name: string }) {
  return (
    <p className="ot-chapter-label">
      <span>{index}</span>
      <i aria-hidden="true" />
      <span>{name}</span>
    </p>
  );
}

/**
 * The room a chapter keeps clear for the background's picture: an empty
 * box in the logo's proportions, which the scene fits the logo to. Where
 * the logo stands whole it holds the logo itself, which is what shows
 * until the scene is up; elsewhere it names the still that stands in
 * where the scene cannot run (see background.css).
 */
function Stage({ logo, still, className }: { logo?: boolean; still?: "drift" | "return" | "bounds"; className?: string }) {
  return (
    <div aria-hidden="true" data-stage="" data-still={still} className={cn("ot-stage", className)}>
      {logo ? <Logo /> : null}
    </div>
  );
}

/*
  The page is five chapters, told behind by the logo: whole in the hero,
  out of balance, level again, held inside a band, and whole once more at
  the end. Each section names its picture (data-chapter) and its own name
  for the chapter marker, and keeps a stage clear for the picture; text
  that sits directly on the ground is marked data-quiet, and the scene
  dims itself there.
*/
export default function Landing() {
  return (
    <>
      {/* 00. The logo, and the headline with its two actions. Side by
          side where there is room; on narrow viewports the logo stands
          above the copy. */}
      <section
        data-chapter="0"
        data-chapter-name="Otolith"
        className="ot-container ot-chapter ot-chapter-hero grid items-center gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.78fr)] lg:gap-16"
      >
        <Stage logo className="mx-auto max-w-xl lg:order-last lg:max-w-none" />

        <div data-quiet="" className="flex min-w-0 flex-col items-start gap-8">
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
      </section>

      <div className="ot-container flex flex-col">
        {/* 01. What it is, and why it is different */}
        <Reveal>
          <section
            id="why-different"
            aria-labelledby="why-different-heading"
            data-chapter="1"
            data-chapter-name="Why different"
            className="ot-chapter"
          >
            <div className="grid min-w-0 items-center gap-14 lg:grid-cols-2 lg:gap-16">
              <Stage still="drift" className="mx-auto max-w-xl lg:max-w-none" />
              <div data-quiet="" className="min-w-0 max-w-2xl">
                <ChapterLabel index="01" name="Why different" />
                <h2 id="why-different-heading" className="mt-5 font-display text-2xl font-medium tracking-display text-text">
                  What it is, and why it is different
                </h2>
                <p className="mt-5 text-base leading-relaxed text-text-muted">
                  Most rebalancing tools ask you to hand over your funds, either
                  to a manager or to an off-chain system you have to trust.
                  Otolith does not. Your funds stay in your own wallet at every
                  step, and rebalancing runs as a transaction your wallet&apos;s own
                  policy contract validates and bounds, on-chain, every time.
                </p>
              </div>
            </div>

            <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-3">
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

        {/* 02. How it works, with the drift simulator and its allocation dial beside the steps */}
        <Reveal>
          <section
            id="how-it-works"
            aria-labelledby="how-it-works-heading"
            data-chapter="2"
            data-chapter-name="How it works"
            className="ot-chapter"
          >
            <div className="grid min-w-0 items-center gap-14 lg:grid-cols-2 lg:gap-16">
              <Stage still="return" className="mx-auto max-w-xl lg:order-last lg:max-w-none" />
              <div data-quiet="" className="min-w-0 max-w-2xl">
                <ChapterLabel index="02" name="How it works" />
                <h2 id="how-it-works-heading" className="mt-5 font-display text-2xl font-medium tracking-display text-text">
                  How it works
                </h2>
                <p className="mt-5 text-base leading-relaxed text-text-muted">
                  Four steps, from setting your targets to a trade landing back
                  in your own wallet.
                </p>
              </div>
            </div>

            <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-12">
              <ol className="grid min-w-0 grid-cols-1 gap-6 sm:grid-cols-2 lg:col-span-7">
                {HOW_IT_WORKS_STEPS.map((step) => (
                  <Card key={step.title} as="li" className="flex flex-col gap-5">
                    <IconWell className="ot-num text-sm font-medium tabular-nums">
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
              <div className="min-w-0 lg:col-span-5">
                <RebalanceDemo />
              </div>
            </div>
          </section>
        </Reveal>

        {/* 03. Security */}
        <Reveal>
          <section
            id="security"
            aria-labelledby="security-heading"
            data-chapter="3"
            data-chapter-name="Security"
            className="ot-chapter grid grid-cols-1 lg:grid-cols-12 lg:gap-12"
          >
            <Stage still="bounds" className="mx-auto max-w-md lg:col-span-12" />

            <div data-quiet="" className="min-w-0 lg:col-span-4 lg:self-center">
              <ChapterLabel index="03" name="Security" />
              <h2 id="security-heading" className="mt-5 font-display text-2xl font-medium tracking-display text-text">
                Security
              </h2>
              <p className="mt-5 max-w-md text-base leading-relaxed text-text-muted">
                Built so there is no party, including Otolith, in a position
                to move your funds anywhere you have not authorized.
              </p>
            </div>

            <div className="min-w-0 lg:col-span-8 lg:self-center">
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                {SECURITY_POINTS.map((point) => (
                  <Card key={point.title} className="flex items-start gap-4">
                    <IconWell>
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

              {/* The notice is nearly clear, so the scene is kept quiet behind it too. */}
              <div data-quiet="" className="mt-8">
                <Notice role="note" className="text-base font-medium">
                  Otolith is live on Stellar testnet today. The contracts have
                  not yet been independently audited.
                </Notice>
              </div>
            </div>
          </section>
        </Reveal>

        {/* 04. Closing call to action, and under it the logo, whole again:
            the last thing on the page above the footer. */}
        <Reveal>
          <section
            aria-labelledby="cta-heading"
            data-chapter="4"
            data-chapter-name="Get started"
            className="ot-chapter ot-chapter-last items-center"
          >
            <div data-quiet="" className="flex flex-col items-center gap-6 text-center">
              <ChapterLabel index="04" name="Get started" />
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

            <Stage logo className="max-w-md" />
          </section>
        </Reveal>
      </div>

      <ChapterHud />
    </>
  );
}
