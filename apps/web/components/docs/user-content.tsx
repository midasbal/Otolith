import { Level } from "@/components/ui/level";
import { Callout, Faq, H3, P, Steps, Table, UL, type DocSection } from "./docs-primitives";

/*
  The user guide. Every figure here is one the app or the contracts use: the
  ranges and defaults are the setup form's (lib/stellar/policy-config.ts and
  contracts/rebalance-policy), the windows are the contracts' own. Where a
  behavior is enforced by a contract and where it is only the interface, the
  text says which.
*/

export const USER_SECTIONS: DocSection[] = [
  {
    id: "user-what-is",
    title: "What Otolith is",
    body: (
      <>
        <P>
          Otolith keeps a two-asset portfolio close to the split you choose. You pick a target share of USDC, the rest
          stays in XLM, and when the portfolio drifts past a band you set, a rebalance sells some XLM into USDC to
          bring it back.
        </P>
        <P>
          It does this without taking custody. Your funds sit in your own smart account on Stellar, secured by a
          passkey. The rule that allows rebalancing lives on that account as a contract, with limits you signed once.
          Otolith the company holds no balance of yours and cannot move one.
        </P>
        <Callout title="Testnet only">
          Otolith runs on Stellar testnet today. The assets are testnet tokens with no value, and the contracts are
          not deployed on mainnet.
        </Callout>
        <H3>What it covers today</H3>
        <UL>
          <li>One pair: XLM and USDC.</li>
          <li>One direction: a rebalance only ever sells XLM and buys USDC.</li>
          <li>One policy per account at a time.</li>
          <li>Passkey accounts. There is no seed phrase and no browser extension.</li>
        </UL>
        <P>
          Some things are not built yet: recovering an account if you lose your passkey, a full activity history
          beyond the recent window the network keeps queryable, and portfolios of more than two assets.
        </P>
      </>
    ),
  },
  {
    id: "user-balance",
    title: "How it keeps your portfolio balanced",
    body: (
      <>
        <P>
          Your target is a single number: the share of the portfolio you want held in USDC. A target of 40% USDC means
          60% XLM. Both holdings are valued in dollars using a price oracle, so the split is a split by value, not by
          token count.
        </P>
        <P>
          Drift is how far your current USDC share sits from the target. The drift band is how much drift is
          tolerated before a rebalance is worth doing. Inside the band, nothing happens. Past it, a rebalance becomes
          due.
        </P>
        <div className="grid max-w-2xl gap-5 sm:grid-cols-2">
          <figure className="flex flex-col gap-2">
            <Level drift={0.8} band={2} label="Drift of 0.8 percent against a band of 2 percent: inside the band." />
            <figcaption className="text-sm text-text-muted">Inside the band. No rebalance is due.</figcaption>
          </figure>
          <figure className="flex flex-col gap-2">
            <Level drift={-3.5} band={2} label="Drift of 3.5 percent below target against a band of 2 percent: past the band." />
            <figcaption className="text-sm text-text-muted">Past the band. A rebalance is due.</figcaption>
          </figure>
        </div>
        <H3>One direction only</H3>
        <P>
          A rebalance only ever sells XLM to buy USDC. It acts when you hold too little USDC. If you hold more USDC
          than the target, however far past the band, nothing is triggered: the contracts never sell USDC. The
          dashboard labels that state Above target, not Past band.
        </P>
        <H3>How big the trade is</H3>
        <P>
          Nobody chooses the amount, including whoever triggers the rebalance. The rebalancer contract works out the
          trade that would close the drift exactly, checks it against the pool&rsquo;s real quote, and shrinks it if
          the pool would return more than the oracle implies. After the swap it checks where the portfolio landed. If
          the result is more than 0.5 percentage points past your target, the whole transaction is reverted and
          nothing changes. The guarantee is a bounded overshoot, not an exact landing.
        </P>
      </>
    ),
  },
  {
    id: "user-account",
    title: "Your account and passkey",
    body: (
      <>
        <P>
          Creating an account creates a passkey on your device and deploys a smart account that your passkey
          controls. The app walks through it in three stages: creating the passkey, preparing the account, then
          deploying and funding it on-chain. The deployment fee is paid by Otolith&rsquo;s fee account, not by you,
          and a new testnet account is funded with testnet XLM.
        </P>
        <P>
          A smart account is a contract that decides what counts as valid authorization. Yours has one rule from the
          start: your passkey can authorize anything. Your device keeps the private key and never shares it. Otolith
          sees a signature when you approve something, never the key.
        </P>
        <H3>Holding USDC</H3>
        <P>
          The account starts with XLM only. To hold USDC, send it to the account&rsquo;s address. The address is
          shown on the dashboard and in Settings. The USDC the app uses is the testnet token listed under Deployed
          contracts in the technical guide.
        </P>
        <Callout title="No recovery yet">
          If you lose the device that holds your passkey, there is no way to regain the account today. Recovery is not
          built. Treat a testnet account as disposable, and do not rely on it for anything you cannot lose.
        </Callout>
        <P>
          You can reconnect to an existing account from the dashboard by choosing the passkey you already have.
        </P>
      </>
    ),
  },
  {
    id: "user-setup",
    title: "Setting up a policy",
    body: (
      <>
        <P>
          Setup is three steps and one signature. Nothing is installed until the last one.
        </P>
        <Steps>
          <>
            <strong className="font-medium text-text">Split.</strong> Choose your target split between XLM and USDC.
            Whatever share you give USDC is the target the contracts hold the portfolio to.
          </>
          <>
            <strong className="font-medium text-text">Parameters.</strong> Sensible defaults are already set. Open
            Advanced settings to change the drift band, the slippage tolerance or the cooldown.
          </>
          <>
            <strong className="font-medium text-text">Review and sign.</strong> Check the terms, then approve with
            your passkey. Otolith pays the network fee.
          </>
        </Steps>
        <Table
          caption="The three settings you can change, with their defaults and allowed ranges"
          head={["Setting", "Default", "Allowed range", "What it does"]}
          rows={[
            ["Drift band", "2%", "0.10% to 20%", "How far the portfolio can drift before a rebalance is worth doing."],
            ["Slippage tolerance", "1%", "0.30% to 5%", "The most price impact a single rebalance trade may accept."],
            ["Cooldown", "1 hour", "5 minutes to 7 days", "The shortest time allowed between two rebalances."],
          ]}
        />
        <P>
          The ranges are checked twice: the form rejects a value outside them before asking for a signature, and the
          policy contract rejects it again when the policy is installed. The contract is the authority.
        </P>
        <H3>What the cooldown trades off</H3>
        <P>
          A shorter cooldown keeps the portfolio closer to target but lets it trade more often, which costs more in
          fees and price impact. A longer one trades less. It also limits how often your account can be made to trade,
          which matters because anyone can trigger a rebalance.
        </P>
        <H3>What you do not set</H3>
        <P>
          Three more values are fixed by the app: no minimum trade size, no tip allowance, and a cost limit of 25%.
          They are stored with your policy but not shown in the form.
        </P>
        <P>
          Setting up a policy adds a rule to your account with no signers and our policy contract attached. To change a
          policy, revoke it in Settings and set up a new one.
        </P>
      </>
    ),
  },
  {
    id: "user-rebalances",
    title: "How and when rebalances happen",
    body: (
      <>
        <P>
          Rebalancing is permissionless: anyone can submit it, and no owner signature is required. The contracts, not
          the person submitting, decide whether it is allowed. Otolith does not run a background bot today. A
          rebalance happens when someone triggers it, and the dashboard gives you a button to do exactly that.
        </P>
        <H3>When one is due</H3>
        <P>The dashboard checks all of these for you, and the rebalance panel says which one is holding things back:</P>
        <UL>
          <li>Your portfolio holds less USDC than the target by more than the drift band.</li>
          <li>The cooldown since your last rebalance has passed.</li>
          <li>The oracle has a current price for both assets. The contracts refuse a price older than 10 minutes.</li>
          <li>The trading pool can fill the trade within your slippage tolerance.</li>
        </UL>
        <H3>What a rebalance is</H3>
        <P>
          One atomic transaction. It reads both prices, works out the trade, swaps XLM for USDC through Soroswap, and
          checks the result. If any step fails, the whole transaction is reverted and your balances are exactly as they
          were. The fee is paid by Otolith&rsquo;s keeper account, which is never a signer on your account.
        </P>
        <P>
          A trade costs the pool&rsquo;s fee of 0.3 percent, plus whatever price impact the pool applies, up to the
          slippage tolerance you set.
        </P>
      </>
    ),
  },
  {
    id: "user-safety",
    title: "Your funds and safety",
    body: (
      <>
        <P>
          Funds never leave your account. A rebalance swaps one of your assets for another and delivers the result
          back to your account. There is no step where Otolith, the keeper or anyone else receives your tokens.
        </P>
        <P>What stops a rebalance from doing something else, and what enforces it:</P>
        <Table
          caption="Safety behaviors and what enforces each"
          head={["Behavior", "Enforced by"]}
          rows={[
            ["Only XLM can be sold, only USDC bought, only through the Soroswap router.", "The policy contract, on-chain."],
            ["The result must come back to your account, and the tokens must go to the real pool for the pair.", "The policy contract, on-chain."],
            ["The trade cannot be larger than the one that closes your drift.", "The policy contract, on-chain."],
            ["Price impact above your slippage tolerance is refused.", "The policy contract, from its own oracle read."],
            ["No rebalance inside the cooldown.", "The policy contract, on-chain."],
            ["A missing or stale price stops the rebalance.", "Both contracts, on-chain."],
            ["The policy cannot change your account or its other rules.", "The policy contract, on-chain."],
            ["Setting values outside the allowed ranges.", "The contract, and the form before it."],
            ["Asking you to confirm before you revoke.", "The interface only."],
          ]}
        />
        <H3>Revoking</H3>
        <P>
          Revoke removes the rule, and with it every future rebalance, in one passkey signature. Your balances stay
          where they are. The Settings page has the control, with a confirmation step.
        </P>
        <H3>What you still trust</H3>
        <UL>
          <li>The price oracle. The contracts bound how old a price may be, not whether it is right.</li>
          <li>The trading pool. Your slippage tolerance caps how much a poor fill can cost you.</li>
          <li>Your device and its passkey. Without a recovery path, losing it loses the account.</li>
        </UL>
      </>
    ),
  },
  {
    id: "user-dashboard",
    title: "Reading your dashboard",
    body: (
      <>
        <H3>Portfolio value</H3>
        <P>
          The total in dollars, priced from the same oracle the contracts use, not from a market quote. If the
          oracle&rsquo;s latest price is older than 10 minutes, the value is still shown, dated to when that price was
          published, with a note that the feed is delayed. If there is no price at all, it says the value is not
          available.
        </P>
        <H3>Allocation and drift</H3>
        <P>
          The ring shows how much you hold of each asset now against the target. Drift is your USDC share minus the
          target, so a negative figure means you hold less USDC than you want. The badge reads Within band, Past band
          or Above target. It is only marked as past the band while a rebalance is actually called for. With a delayed
          price the split is shown but no verdict is drawn.
        </P>
        <H3>Your policy</H3>
        <P>The terms you signed: target allocation, drift band, slippage tolerance and cooldown.</P>
        <H3>Rebalance</H3>
        <P>This panel is the authority on whether a rebalance can happen. It shows one of these:</P>
        <UL>
          <li>Within the target band, so no rebalance is needed.</li>
          <li>A rebalance is due, with the Rebalance now button.</li>
          <li>A recent rebalance, so the cooldown is running.</li>
          <li>The pool cannot support the trade safely, so Otolith holds off.</li>
          <li>The live price is delayed or unavailable, so the status cannot be determined.</li>
        </UL>
        <H3>Balances, Activity and Explore</H3>
        <P>
          Balances lists what the account holds. Activity lists recent rebalances read directly from the public
          network, with a note of how far back the search reached. It is recent activity, not the full history, and it
          links to the full record on stellar.expert. Explore shows the two supported assets and their live oracle
          prices.
        </P>
      </>
    ),
  },
  {
    id: "user-faq",
    title: "FAQ",
    body: (
      <Faq
        items={[
          {
            question: "Is this on mainnet?",
            answer: <P>No. Otolith runs on Stellar testnet only. The assets have no value.</P>,
          },
          {
            question: "Can Otolith take my funds?",
            answer: (
              <P>
                No. Funds stay in your account. The policy that allows rebalancing can only approve one narrow swap
                from XLM to USDC, delivered back to the same account. Everything else, including changing the account,
                needs your passkey.
              </P>
            ),
          },
          {
            question: "Who can trigger a rebalance?",
            answer: (
              <P>
                Anyone. They cannot choose the size or the assets, and the contracts refuse anything outside your
                policy.
              </P>
            ),
          },
          {
            question: "My portfolio is past the band and nothing happened. Why?",
            answer: (
              <>
                <P>
                  Nobody has triggered a rebalance yet, since there is no background bot. If you trigger one and it
                  is refused, the rebalance panel names the reason: the cooldown is running, the oracle price is
                  delayed, or the pool cannot fill the trade within your tolerance. If you hold more USDC than the
                  target, nothing will happen, because a rebalance never sells USDC.
                </P>
              </>
            ),
          },
          {
            question: "Why only XLM and USDC, and only selling XLM?",
            answer: (
              <P>
                The first version is deliberately narrow so the safety logic stays small and checkable. Portfolios of
                more than two assets are planned, not built.
              </P>
            ),
          },
          {
            question: "How do I change my policy?",
            answer: (
              <P>
                Revoke it in Settings, then set up a new one. A policy cannot be edited in place.
              </P>
            ),
          },
          {
            question: "What does it cost me?",
            answer: (
              <P>
                The network fees for creating the account, installing or revoking a policy, and submitting a rebalance
                are paid by Otolith on testnet. A trade itself costs the pool&rsquo;s 0.3 percent fee plus price
                impact, up to your slippage tolerance.
              </P>
            ),
          },
          {
            question: "What if I lose my passkey?",
            answer: (
              <P>
                Recovery is not built yet, so the account cannot be signed for again. Your funds would stay in the
                account, where only that passkey can move them.
              </P>
            ),
          },
          {
            question: "Why does the dashboard say the price is delayed?",
            answer: (
              <P>
                The oracle on testnet sometimes stops publishing for a while. The contracts will not act on a price
                older than 10 minutes, so rebalances pause, and the dashboard shows the last published price with its
                time instead of pretending it is current.
              </P>
            ),
          },
          {
            question: "Where is my full history?",
            answer: (
              <P>
                Activity shows the recent window the public network keeps queryable, and says how far back it reached.
                For everything older, follow the link to your account on stellar.expert.
              </P>
            ),
          },
        ]}
      />
    ),
  },
];
