import { Address, Callout, Code, Faq, H3, P, Steps, Table, UL, type DocSection } from "./docs-primitives";
import {
  ACCOUNT_WASM_HASH,
  WEBAUTHN_VERIFIER_ADDRESS,
} from "@/lib/stellar/account-config";
import {
  ORACLE,
  POLICY_CONTRACT,
  REBALANCER_CONTRACT,
  ROUTER,
  USDC_ASSET,
  XLM_ASSET,
} from "@/lib/stellar/policy-config";

/*
  The technical guide: the project's architecture reference. Everything in it
  is read from the code. Constants and ranges are the contracts' own
  (contracts/rebalance-policy, contracts/rebalancer, contracts/rebalance-sizing),
  the server behavior is lib/server and app/api, and the addresses come from
  the same config files the app reads, so they cannot drift from the app.
*/

export const TECHNICAL_SECTIONS: DocSection[] = [
  {
    id: "tech-architecture",
    title: "Architecture overview",
    body: (
      <>
        <P>
          Otolith is a passkey-owned Soroban smart account, two Rust contracts that govern what may be done with it,
          and a web app. The design is compute-then-validate: the rebalancer contract computes an exact swap, and the
          policy contract, which the account consults before authorizing it, validates the finished swap against its
          own independent reads. It does not trust the rebalancer&rsquo;s arithmetic.
        </P>
        <Table
          caption="The parts of the system"
          head={["Part", "Role"]}
          rows={[
            [
              "Smart account",
              "A deployed OpenZeppelin stellar-accounts smart account, one per user. Holds the funds. Authorization is decided by its context rules.",
            ],
            [
              "rebalance-policy",
              "A stellar-accounts Policy attached to a rule with no signers. Its enforce is the only gate for a permissionless rebalance.",
            ],
            [
              "rebalancer",
              "Public entry point. Prices both assets, sizes the trade, and calls the Soroswap router with the account as recipient.",
            ],
            [
              "rebalance-sizing",
              "A pure crate, no contract surface, holding the one formula both contracts use for the ideal trade size.",
            ],
            ["Reflector oracle", "On-chain prices, read by ticker symbol."],
            ["Soroswap router", "The execution venue."],
            [
              "Web app",
              "Next.js. Reads chain state from public Soroban RPC. Its server routes sponsor fees and submit rebalances.",
            ],
          ]}
        />
        <H3>A rebalance, end to end</H3>
        <Steps>
          <>The caller invokes <Code>rebalancer.rebalance</Code> with the account, the policy, the rule id and the pair. It passes no amount.</>
          <>The rebalancer reads both prices and refuses if either is missing, stale or invalid.</>
          <>It reads the stored params from the policy and the account&rsquo;s balances, and refuses unless the drift exceeds the band.</>
          <>It sizes the trade, corrects it against the router&rsquo;s own quote, and calls <Code>swap_exact_tokens_for_tokens</Code> with the account as recipient.</>
          <>The account asks the policy to authorize the swap context, then the nested token transfer context. Each is checked on its own.</>
          <>After the swap, the rebalancer checks the new weight against the target, and reverts everything if it landed too far past.</>
        </Steps>
        <H3>The web app</H3>
        <P>
          The browser reads through public Soroban RPC with simulated calls: policy parameters, token balances, oracle
          prices, and token transfer events for the activity feed. Every RPC answer carries the ledger it was
          evaluated at. After a confirmed transaction, the app raises a per-account floor at that ledger and discards
          any later read evaluated below it, so a node that lags cannot put stale state back on screen.
        </P>
        <P>
          Two server routes exist, <Code>/api/deployer</Code> and <Code>/api/rebalance</Code>. Both are described under
          The keeper and deployer. Neither is in the custody path: neither can sign for an account.
        </P>
      </>
    ),
  },
  {
    id: "tech-account",
    title: "Smart account and authorization",
    body: (
      <>
        <P>
          Each user&rsquo;s account is deployed from the wasm hash <Code>{ACCOUNT_WASM_HASH}</Code> through
          smart-account-kit, whose version is pinned. Its constructor takes the initial signers and policies. The kit
          creates the account with one signer, your passkey, and no policies.
        </P>
        <H3>Context rules</H3>
        <P>
          Authorization is organized as context rules. A rule has a context type (Default, a call to one contract, or
          contract creation), a name, an optional expiry, a set of signers and a set of policies. The deployed account
          caps these at 15 signers, 5 policies, a 20 byte name and 256 bytes of key data for an external signer. The
          kit mirrors the same limits to fail early with a clear error.
        </P>
        <UL>
          <li>
            <Code>Rule 0</Code>, created with the account: Default context, one signer. The signer is External: the
            WebAuthn verifier <Code>{WEBAUTHN_VERIFIER_ADDRESS}</Code> plus key data holding the passkey&rsquo;s
            public key and credential id.
          </li>
          <li>
            The policy rule, created by install: Default context, named by the setup flow, <strong className="font-medium text-text">no signers</strong>, one
            policy, the rebalance policy, with its params. Rule ids are not reused, so installing again after a revoke
            gets a new id.
          </li>
        </UL>
        <P>
          A rule with no signers defers authorization to its policies. That is how a permissionless rebalance is
          authorized with no signature: the keeper submits authorization entries that name the rule and carry no
          signature, and the policy&rsquo;s <Code>enforce</Code> is the check.
        </P>
        <H3>Owner actions</H3>
        <P>
          Installing and revoking a policy are calls on the account itself: <Code>add_context_rule</Code> with the
          policy and its params, and <Code>remove_context_rule</Code>. The account authorizes them under rule 0, so each
          needs a passkey signature. The kit signs the authorization entry with a WebAuthn assertion over its digest,
          with a signature expiry set an hour of ledgers ahead, re-simulates, and posts the result to the relayer.
          Removing the rule makes the account call the policy&rsquo;s <Code>uninstall</Code>, which deletes the stored
          params.
        </P>
        <H3>What the policy rule cannot do</H3>
        <P>
          The policy rule is a Default rule, but its policy approves only two exact shapes. A context aimed at the
          account itself is refused with <Code>SelfManagementNotAllowed</Code>, so the rule can never add a signer,
          change a rule or install a policy. Management stays with rule 0 and the passkey.
        </P>
      </>
    ),
  },
  {
    id: "tech-policy",
    title: "The policy contract",
    body: (
      <>
        <P>
          <Code>rebalance-policy</Code> implements the stellar-accounts <Code>Policy</Code> trait: <Code>install</Code>,
          <Code> uninstall</Code> and <Code>enforce</Code>, plus a <Code>get_params</Code> view. It is multi-tenant: one
          deployment serves every account, with storage keyed by <Code>(smart_account, context_rule_id)</Code>.
        </P>
        <H3>Stored parameters</H3>
        <Table
          caption="Policy parameters, their ranges, and what the app sets"
          head={["Parameter", "Range at install", "Used by", "In the app"]}
          rows={[
            ["sell_asset, buy_asset", "The whitelisted pair", "Policy", "XLM, USDC"],
            ["router", "Soroswap router address", "Policy", "Fixed"],
            ["oracle, sell_symbol, buy_symbol", "Reflector oracle and tickers", "Both", "Fixed"],
            ["pair", "Derived by install via router_pair_for", "Policy", "Not user input"],
            ["slippage_tolerance_bps", "30 to 500", "Both", "Default 100"],
            ["target_buy_weight_bps", "0 to 10,000", "Rebalancer, policy", "Set by the split"],
            ["band_threshold_bps", "10 to 2,000", "Rebalancer", "Default 200"],
            ["min_trade_size", "0 to 10^15 raw units", "Rebalancer", "0"],
            ["reserved_tip_bps", "0 to 1,000", "Rebalancer", "0"],
            ["max_cost_ratio_bps", "500 to 5,000", "Rebalancer", "2,500"],
            ["cooldown_secs", "300 to 604,800", "Policy", "Default 3,600"],
          ]}
        />
        <P>
          <Code>install</Code> requires the account&rsquo;s own authorization, range checks every setting, refuses a
          second install for the same rule (<Code>AlreadyInstalled</Code>), and overwrites <Code>pair</Code> with the
          address it derives from a live <Code>router_pair_for</Code> call. The caller&rsquo;s value is never stored.
        </P>
        <H3>enforce: the swap context</H3>
        <P>
          <Code>enforce</Code> runs once per authorization context and recognizes exactly two. For a call to the
          router&rsquo;s <Code>swap_exact_tokens_for_tokens</Code> it requires, in order:
        </P>
        <Steps>
          <>The recipient is the smart account, and the path is exactly <Code>[sell_asset, buy_asset]</Code>.</>
          <>The cooldown has passed: the time since <Code>LastRebalance</Code> for this rule is at least <Code>cooldown_secs</Code>. This runs before the oracle reads, so a spammer fails cheaply.</>
          <>Both oracle prices are present, not future-dated, no older than 600 seconds, and positive.</>
          <><Code>amount_in</Code> is no larger than the ideal size from <Code>rebalance-sizing</Code>, computed here from live balances and prices, never from the caller. Past it fails with <Code>TradeTooLarge</Code>.</>
          <><Code>amount_out_min</Code> meets a floor the policy derives itself: the oracle-implied output reduced by the slippage tolerance, rounded up so the floor is never looser than stated.</>
        </Steps>
        <P>
          Only when every check has passed does the policy record <Code>LastRebalance</Code>, exactly once, and write a
          single-use <Code>PendingTransfer</Code> marker holding the approved <Code>amount_in</Code> in temporary
          storage. Soroban commits state only on success, so a transaction that fails later leaves neither behind.
        </P>
        <H3>enforce: the transfer context</H3>
        <P>
          The router moves the sell asset as a nested transfer, which is its own context. It is approved only if the
          sender is the account, the destination is the stored <Code>pair</Code>, and a <Code>PendingTransfer</Code> marker
          exists with exactly that amount, which it consumes. The destination check alone would not be enough: a
          Soroswap pair exposes a permissionless skim that pays out any balance above its reserves, so a correctly
          addressed transfer with no matching swap would still be a leak. A standalone transfer finds no marker and is
          refused with <Code>NoMatchingApproval</Code>. This branch never touches the cooldown.
        </P>
        <P>
          Any other context is refused: <Code>InvalidContext</Code> for contract creation,
          <Code> UnrecognizedContext</Code> for any other call, <Code>SelfManagementNotAllowed</Code> for a call on the
          account itself. <Code>enforce</Code> calls <Code>require_auth</Code> only on the account and makes only view
          calls, so it opens no reentrancy.
        </P>
        <H3>Errors</H3>
        <Table
          caption="The policy contract's error codes"
          head={["Code", "Name", "Code", "Name"]}
          numeric={[0, 2]}
          rows={[
            ["1", "NotInstalled", "14", "PriceMissing"],
            ["2", "AlreadyInstalled", "15", "PriceStale"],
            ["3", "InvalidContext", "16", "InvalidTargetWeight"],
            ["4", "SelfManagementNotAllowed", "17", "InvalidBandThreshold"],
            ["5", "WrongRecipient", "18", "InvalidMinTradeSize"],
            ["6", "InvalidPath", "19", "InvalidReservedTip"],
            ["7", "AssetNotWhitelisted", "20", "InvalidMaxCostRatio"],
            ["8", "SlippageTooHigh", "21", "InvalidCooldown"],
            ["9", "WrongSender", "22", "CooldownActive"],
            ["10", "UnrecognizedContext", "23", "TradeTooLarge"],
            ["11", "BadArgs", "24", "WrongDestination"],
            ["12", "Overflow", "25", "NoMatchingApproval"],
            ["13", "InvalidSlippageTolerance", "26", "PriceInvalid"],
          ]}
        />
      </>
    ),
  },
  {
    id: "tech-rebalancer",
    title: "The rebalancer contract",
    body: (
      <>
        <P>
          <Code>rebalancer.rebalance</Code> is callable by anyone. Its arguments are the account, the policy, the rule
          id, the router, the oracle, the two assets and their ticker symbols, and a deadline. There is no amount. The
          caller identifies the account and the rule; the contract decides how much moves. It holds no authority of its
          own over those arguments: the policy checks the router, the assets and the oracle against what it stored.
        </P>
        <H3>Steps and the errors they raise</H3>
        <Steps>
          <>Read both prices from the oracle. Missing, older than 600 seconds, future-dated or non-positive prices stop here with <Code>PriceMissing</Code>, <Code>PriceStale</Code> or <Code>PriceInvalid</Code>. This runs before the policy is read, so an oracle refusal never depends on the policy being reachable.</>
          <>Read the stored params from the policy, and the account&rsquo;s balances of both assets. Value both in the oracle&rsquo;s scale. No value at all is <Code>NoValue</Code>.</>
          <>Compute drift as the target buy weight minus the current one. If it does not exceed <Code>band_threshold_bps</Code>, <Code>BelowBand</Code>.</>
          <>Compute the ideal size with <Code>rebalance-sizing</Code>. If the account is already at or past target, that is not actionable and also reports <Code>BelowBand</Code>.</>
          <>Ask the router for a quote on that size. If the pool would return more value than the oracle implies, scale the trade down by the ratio.</>
          <>Refuse a trade below <Code>min_trade_size</Code> (<Code>BelowMinTradeSize</Code>) or one that fails the cost gate (<Code>CostExceedsBenefit</Code>).</>
          <>Derive <Code>amount_out_min</Code> from the slippage tolerance, rounded up, and call the router with the account as recipient.</>
          <>Recompute the account&rsquo;s weight from the real result. If it is more than 50 bps past the target, <Code>OvershootTolerance</Code> reverts the whole transaction, swap included.</>
        </Steps>
        <H3>Sizing</H3>
        <P>
          The ideal size is the sell-asset value that brings the buy weight to the target exactly:
          <Code> (T × sell_value − (10,000 − T) × buy_value) / 10,000</Code>, converted to raw sell-asset units at the
          oracle price, where <Code>T</Code> is the target buy weight in bps. If that is not positive there is nothing
          to do. The crate is pure: no I/O, no cross-contract calls and no authorization, because it also runs inside
          the policy&rsquo;s <Code>enforce</Code>.
        </P>
        <P>
          The pool correction exists because the oracle price is frictionless and the pool can be priced above it, in
          which case the oracle-sized trade overshoots the target. That happened on testnet. It is a single linear
          correction against a curved price, which is why the post-swap check allows 50 bps of slack and the stated
          guarantee is bounded overshoot, not an exact landing.
        </P>
        <H3>The cost gate</H3>
        <P>
          The estimated cost rate is the pool fee (30 bps) plus the slippage tolerance plus <Code>reserved_tip_bps</Code>.
          The trade is skipped if that rate exceeds <Code>max_cost_ratio_bps</Code>, which makes the ratio a conservative
          outer ceiling on what a rebalance may cost. The app sets it to 2,500, far above the 530 bps that the pool fee
          and the largest slippage tolerance the app allows (500) add up to. Inside that ceiling it is the slippage
          tolerance that binds in the app&rsquo;s configuration: it sets the minimum output of every swap, and both
          contracts enforce it. The ceiling is there for the policies it can still catch. The contract accepts a ratio
          from 500 to 5,000, and a policy installed with a lower one makes the gate the tighter of the two.
        </P>
        <Table
          caption="The rebalancer's error codes"
          head={["Code", "Name", "Code", "Name"]}
          numeric={[0, 2]}
          rows={[
            ["1", "PriceMissing", "6", "BelowMinTradeSize"],
            ["2", "PriceStale", "7", "CostExceedsBenefit"],
            ["3", "Overflow", "8", "OvershootTolerance"],
            ["4", "NoValue", "9", "PriceInvalid"],
            ["5", "BelowBand", "", ""],
          ]}
        />
      </>
    ),
  },
  {
    id: "tech-oracle",
    title: "Price oracle",
    body: (
      <>
        <P>
          Prices come from the Reflector oracle <Code>{ORACLE}</Code>. Reflector prices assets by ticker symbol, not
          by contract address, so the contracts call <Code>lastprice</Code> with <Code>Other(&quot;XLM&quot;)</Code> and
          <Code> Other(&quot;USDC&quot;)</Code>. It returns an optional record of price and timestamp. As read from the live
          contract, the oracle reports 14 decimals, a 300 second resolution and USD as its base. Both assets are priced
          on the same scale, so their values are directly comparable and the scale cancels in the math.
        </P>
        <H3>Freshness</H3>
        <P>
          The rebalancer and the policy each apply the same rules to their own read: a price must exist, must not be
          dated in the future, must be no older than 600 seconds, and must be positive. 600 seconds is twice the
          oracle&rsquo;s resolution, which allows one missed update. There is no fallback price. A stale or missing
          price stops the rebalance, since a wrong price is worse than no rebalance.
        </P>
        <H3>In the app</H3>
        <P>
          The client reads the same call and classifies each price as fresh, stale or unavailable, using the same
          600 second rule. A stale price is not thrown away: it is kept with its publish time. The dashboard then
          shows the value as a dated snapshot with no drift verdict, and the rebalance panel, which reflects what the
          contracts would do, reports that the status cannot be determined. The keeper&rsquo;s read-only check maps
          the contract&rsquo;s <Code>PriceMissing</Code>, <Code>PriceStale</Code> and <Code>PriceInvalid</Code> to a not-due
          result with that reason, and the interface treats those reasons as a price problem, not as being within the
          band.
        </P>
      </>
    ),
  },
  {
    id: "tech-keeper",
    title: "The keeper and deployer",
    body: (
      <>
        <P>
          One funded testnet key, held only in the server&rsquo;s environment, plays two fee-only roles: it sponsors
          account deployment and policy changes, and it submits rebalances. It is never a signer on any account.
        </P>
        <H3>The deploy sponsor, POST /api/deployer</H3>
        <P>
          The kit&rsquo;s relayer client posts a host function and its authorization entries, both base64 XDR. The
          route builds a transaction sourced by the deployer key, prepares it, signs it with that key, sends it and
          polls for the result. Every request is validated first against an allowlist of exactly four permitted
          operations, and anything else is rejected before it is signed:
        </P>
        <Table
          caption="The operations the deploy sponsor accepts"
          head={["Shape", "Accepted when"]}
          rows={[
            ["deploy", "A create-contract of the account wasm hash, by the kit's default deployer."],
            ["fund", "A native XLM transfer from the signer to a contract, up to 20,000 XLM."],
            ["install", "add_context_rule on a smart account that authorizes itself, with the policy contract in its arguments."],
            ["revoke", "remove_context_rule on a smart account that authorizes itself."],
          ]}
        />
        <P>
          Every request must also carry at least one authorization entry, all with address credentials, and none signed
          by the deployer itself. A request that fails any of this is rejected with a generic error, and the reason is
          kept in the server&rsquo;s log, not returned. A fee budget, a size cap and a rate limit sit in front of the
          allowlist.
        </P>
        <Table
          caption="Protections on the deployer and keeper endpoints"
          head={["Protection", "Setting"]}
          rows={[
            [
              "Fee budget",
              "Before sponsoring or submitting, the key's balance is read (cached 5 seconds). Once it falls to a configured floor, 100 XLM by default, the keeper stops sponsoring fees and the request is refused with a 503 that does not state the balance.",
            ],
            ["Body size", "32 KiB for the deployer, 1 KiB for the rebalance POST. Larger bodies get a 413."],
            [
              "Rate limit",
              "Per client IP, sliding window, on Upstash Redis: 10 per 10 minutes on the deployer, 5 per minute on rebalance submission, 30 per minute on the rebalance check. It fails open if Upstash is absent or unreachable.",
            ],
            ["Health check", "GET /api/deployer reports only whether a deployer key is configured and its account reachable."],
          ]}
        />
        <H3>The keeper, /api/rebalance</H3>
        <P>
          GET is a read-only check. It reads the account&rsquo;s policy, then simulates the rebalance with a throwaway
          source account and classifies the result: no policy, not due (with the rebalancer&rsquo;s reason), ready (with
          the amounts), cooldown, or pool blocked, for the router&rsquo;s insufficient-output error. The response
          carries the lowest ledger of the simulations behind it, which the client uses to reject a stale check.
        </P>
        <P>
          POST re-checks, and only if the rebalance is ready, assembles the simulated call and submits it through the
          kit with zero selected signers and the rule id for both the swap and the transfer context. The deadline is an
          hour out. The fee budget is checked just before submission, so a rebalance that is not due never reads it.
          The rebalancer and the policy both use small error numbers, and the keeper reads them as the
          rebalancer&rsquo;s. That is safe because a call built this way cannot reach the policy&rsquo;s colliding errors.
        </P>
        <Callout title="No scheduler">
          Nothing in the repository triggers rebalances on a timer. They happen when the dashboard&rsquo;s button is
          used or when anyone calls the contract.
        </Callout>
      </>
    ),
  },
  {
    id: "tech-security",
    title: "Security model",
    body: (
      <>
        <P>
          The trust surface is the contracts. The keeper pays fees and nothing else; the web app and its server
          routes can refuse to help, but they cannot authorize a trade. The source of neither contract defines an admin,
          owner or upgrade function.
        </P>
        <Table
          caption="Threats, what stops each, and where it is enforced"
          head={["Threat", "Stopped by", "Enforced"]}
          rows={[
            ["A caller picks the trade size", "No amount argument; the policy recomputes the ceiling from live balances and prices", "Contracts"],
            ["Tokens sent somewhere else", "Recipient must be the account; the transfer must go to the stored pair and consume a single-use marker", "Policy"],
            ["A bad or manipulated price", "Missing, stale, future-dated and non-positive prices refused; the policy derives its own slippage floor", "Contracts"],
            ["Over-trading", "Drift band, cooldown, overshoot revert", "Contracts"],
            ["The policy used to change the account", "Contexts aimed at the account are refused", "Policy"],
            ["Wrong router, assets or oracle", "Policy compares them with the params it stored at install", "Policy"],
            ["Out-of-range settings", "Ranges checked at install", "Policy, and the form before it"],
            ["Draining the fee key", "Allowlist, size cap, rate limits, balance floor", "Server"],
            ["Revoking by mistake", "A confirmation step", "Interface only"],
          ]}
        />
        <H3>What it does not cover</H3>
        <UL>
          <li>The oracle is trusted for the value of a price. The contracts bound its age only.</li>
          <li>The pool is trusted to the extent of the slippage floor, which caps the loss from a poor fill.</li>
          <li>A compromised keeper key cannot move user funds: the contracts never authorize the keeper to transfer them, and it is not a signer on any account. The most it can do to an account is submit a rebalance that the user&rsquo;s own policy already permits, which anyone can do. At most it can burn the keeper&rsquo;s own fee balance. The server&rsquo;s balance floor is a secondary limit on abuse of the endpoints.</li>
          <li>The contracts are deployed on testnet only and are not documented as audited.</li>
        </UL>
        <H3>Not built yet</H3>
        <UL>
          <li>Passkey recovery or additional signers on an account.</li>
          <li>Full transaction history. The activity feed reads the recent window the RPC retains.</li>
          <li>Portfolios of more than two assets, or a direction other than XLM to USDC.</li>
          <li>A caller tip. <Code>reserved_tip_bps</Code> is stored and counted in the cost gate, but no tip mechanism exists.</li>
          <li>Mainnet deployment.</li>
        </UL>
      </>
    ),
  },
  {
    id: "tech-contracts",
    title: "Deployed contracts",
    body: (
      <>
        <P>Stellar testnet. The app reads these from one configuration file, so this list is the one it uses.</P>
        <div className="flex flex-col gap-5">
          {[
            ["rebalance-policy", "The policy attached to each account's rebalance rule.", POLICY_CONTRACT],
            ["rebalancer", "The public entry point that sizes and submits a rebalance.", REBALANCER_CONTRACT],
            ["Soroswap router", "The swap venue.", ROUTER],
            ["Reflector oracle", "Prices by ticker symbol.", ORACLE],
            [`${XLM_ASSET.symbol} token`, "The native XLM Stellar Asset Contract. The sell asset.", XLM_ASSET.contract],
            [`${USDC_ASSET.symbol} token`, "The USDC the app holds. The buy asset.", USDC_ASSET.contract],
            ["WebAuthn verifier", "Verifies passkey signatures for the accounts' external signer.", WEBAUTHN_VERIFIER_ADDRESS],
          ].map(([name, role, address]) => (
            <div key={address} className="flex max-w-2xl flex-col gap-1 py-1">
              <p className="font-display text-base font-medium text-text">{name}</p>
              <p className="text-sm leading-relaxed text-text-muted">{role}</p>
              <Address value={address} />
            </div>
          ))}
        </div>
        <P>
          Smart accounts are deployed from the wasm hash <Code>{ACCOUNT_WASM_HASH}</Code>, so each has its own address.
          The Soroswap pair for XLM and USDC is derived by the policy at install time, not configured.
        </P>
      </>
    ),
  },
  {
    id: "tech-faq",
    title: "FAQ",
    body: (
      <Faq
        items={[
          {
            question: "Why does the policy recompute what the rebalancer already computed?",
            answer: (
              <P>
                So that a mistake or compromise in one contract does not carry into the other. The policy reads the
                oracle itself, derives its own slippage floor and trade ceiling from live balances, and checks the
                finished swap against those. Anyone can also skip the rebalancer and call the router directly with the
                account&rsquo;s authorization context, and the policy has to hold up in that case too.
              </P>
            ),
          },
          {
            question: "Why does the rule have no signers, and why is that safe?",
            answer: (
              <P>
                With no signers, authorization is deferred entirely to the policy, which is what makes a rebalance
                permissionless. It is safe because the policy approves only two exact shapes, refuses anything aimed at
                the account itself, and the account&rsquo;s real signer sits on a different rule.
              </P>
            ),
          },
          {
            question: "How is the cooldown enforced, and when does it advance?",
            answer: (
              <P>
                The policy checks the time since <Code>LastRebalance</Code> against <Code>cooldown_secs</Code> in the swap
                context, and writes the new timestamp only once every other check on that context has passed. It never
                advances in the transfer context. Because Soroban commits only on success, a rebalance that reverts
                later leaves the cooldown untouched.
              </P>
            ),
          },
          {
            question: "What happens when the oracle is stale or down?",
            answer: (
              <P>
                Both contracts refuse, no swap is attempted, and nothing falls back to another price. The app keeps
                showing the last published price with its time, and the rebalance panel says the status cannot be
                determined.
              </P>
            ),
          },
          {
            question: "Why is the lowest slippage tolerance 30 bps?",
            answer: (
              <P>
                30 bps is Soroswap&rsquo;s own pool fee. A tolerance below it would revert every swap, so it is not a
                usable setting. The 500 bps ceiling is where the floor stops meaningfully protecting the user.
              </P>
            ),
          },
          {
            question: "What can a compromised keeper key do?",
            answer: (
              <P>
                It cannot move user funds. The contracts never authorize the keeper to transfer them, and the key is
                not a signer on any account. The most it can do to an account is submit a rebalance that the
                user&rsquo;s own policy already permits, which anyone can do. At most, someone holding the key could
                burn the keeper&rsquo;s own fee balance. Separately, the server limits abuse of its endpoints with the
                allowlist, a size cap and rate limits, and it stops sponsoring once the balance reaches a floor.
              </P>
            ),
          },
          {
            question: "Can a policy be edited in place?",
            answer: (
              <P>
                No. Params are written once at install, and a second install on the same rule is refused. To change a
                policy, remove the rule, which uninstalls it, and add a new one. The new rule has a new id.
              </P>
            ),
          },
          {
            question: "Why do the app and the contracts both check ranges?",
            answer: (
              <P>
                The form checks so that an invalid value is caught before a signature is requested. The contract checks
                because it is the authority: a client can be bypassed, and the contract cannot.
              </P>
            ),
          },
          {
            question: "Is there an admin or upgrade key?",
            answer: (
              <P>
                Neither contract&rsquo;s source defines an admin, owner or upgrade function. What a deployed instance
                allows is determined by how it was deployed, which the source cannot show.
              </P>
            ),
          },
        ]}
      />
    ),
  },
];
