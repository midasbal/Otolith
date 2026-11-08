import "server-only";

import { NextResponse } from "next/server";
import { NotFoundError } from "@stellar/stellar-sdk";
import { horizonServer } from "@/lib/stellar";
import {
  DeployerNotConfiguredError,
  DeploySponsorError,
  getDeployerPublicKey,
  sponsorHostFunctionCall,
} from "@/lib/server/deployer";
import { isSponsorEnforcing } from "@/lib/server/deployer-constants";
import {
  logSponsorRequest,
  shortReason,
  summarizeSponsorRequest,
  type SponsorOutcome,
  type SponsorRequestSummary,
  type SponsorVerdict,
} from "@/lib/server/deployer-log";
import { validateSponsorRequest } from "@/lib/server/deployer-validate";

/**
 * Health check for the deploy-sponsoring deployer. Confirms the server can
 * load the deployer keypair from the server-only environment and that the
 * resulting account is reachable on Stellar testnet, without ever
 * returning the secret key itself. Only the public key ever appears in a
 * response.
 */
export async function GET() {
  let publicKey: string;
  try {
    publicKey = getDeployerPublicKey();
  } catch (err) {
    if (err instanceof DeployerNotConfiguredError) {
      return NextResponse.json({ configured: false, error: err.message }, { status: 503 });
    }
    throw err;
  }

  try {
    const account = await horizonServer.loadAccount(publicKey);
    const nativeBalance = account.balances.find((balance) => balance.asset_type === "native");

    return NextResponse.json({
      configured: true,
      publicKey,
      funded: true,
      balance: nativeBalance ? nativeBalance.balance : "0",
    });
  } catch (err) {
    if (err instanceof NotFoundError) {
      return NextResponse.json({
        configured: true,
        publicKey,
        funded: false,
        balance: "0",
      });
    }

    console.error(err);
    return NextResponse.json(
      {
        configured: true,
        publicKey,
        funded: null,
        error: "Could not reach the Stellar network to check the deployer balance.",
      },
      { status: 502 },
    );
  }
}

/**
 * Sponsors a smart-account deploy. Matches smart-account-kit's own
 * RelayerClient wire format exactly (POST { func, auth }, both base64 XDR
 * strings, respond with { success, hash } or { success, error }), so the
 * client kit can be configured with `relayerUrl` pointed at this route
 * and call it directly with no extra client-side plumbing.
 *
 * Every request leaves one structured log line (see deployer-log.ts): what
 * was asked for, decoded, the allowlist's verdict, and how it ended.
 *
 * The allowlist (deployer-validate.ts) judges every request. With
 * DEPLOYER_ENFORCE off, which is the default, the verdict is only logged
 * and the request goes ahead exactly as it always has. With it on, a
 * request that fails is answered 400 before anything is simulated, signed
 * or submitted, and the client is not told which rule failed: the log is.
 */
export async function POST(request: Request) {
  const startedAt = Date.now();
  let summary: SponsorRequestSummary | null = null;
  let verdict: (SponsorVerdict & { mode: "shadow" | "enforce" }) | null = null;
  let outcome: SponsorOutcome = { success: false, stage: "unexpected", reason: "The handler ended without an outcome." };

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      outcome = { success: false, stage: "validate", reason: "Invalid request body." };
      return NextResponse.json({ success: false, error: "Invalid request body." }, { status: 400 });
    }

    if (
      typeof body !== "object" ||
      body === null ||
      typeof (body as { func?: unknown }).func !== "string" ||
      !Array.isArray((body as { auth?: unknown }).auth) ||
      !(body as { auth: unknown[] }).auth.every((entry) => typeof entry === "string")
    ) {
      outcome = { success: false, stage: "validate", reason: "Expected a func string and an auth array of strings." };
      return NextResponse.json(
        { success: false, error: "Expected a func string and an auth array of strings." },
        { status: 400 },
      );
    }

    const { func, auth } = body as { func: string; auth: string[] };

    let deployerPublicKey: string | null = null;
    try {
      deployerPublicKey = getDeployerPublicKey();
    } catch {
      // Not configured: the sponsor call below reports it, and the log
      // simply cannot tell the deployer's own entries apart.
    }
    summary = summarizeSponsorRequest(func, auth, deployerPublicKey);

    const enforcing = isSponsorEnforcing();
    verdict = { ...validateSponsorRequest(summary, deployerPublicKey), mode: enforcing ? "enforce" : "shadow" };
    if (enforcing && verdict.result === "reject") {
      outcome = { success: false, stage: "validate", reason: `rejected: ${verdict.rule}` };
      return NextResponse.json({ success: false, error: "This request is not accepted." }, { status: 400 });
    }

    try {
      const result = await sponsorHostFunctionCall(func, auth);
      outcome = { success: true, hash: result.hash };
      return NextResponse.json({ success: true, hash: result.hash });
    } catch (err) {
      if (err instanceof DeployerNotConfiguredError) {
        outcome = { success: false, stage: "configuration", reason: shortReason(err) };
        return NextResponse.json({ success: false, error: err.message }, { status: 503 });
      }
      if (err instanceof DeploySponsorError) {
        outcome = {
          success: false,
          stage: err.stage,
          reason: shortReason(err.detail ? `${err.message} ${err.detail}` : err.message),
        };
        return NextResponse.json({ success: false, error: err.message }, { status: 502 });
      }
      console.error(err);
      outcome = { success: false, stage: "unexpected", reason: shortReason(err) };
      return NextResponse.json(
        { success: false, error: "Could not sponsor the deploy." },
        { status: 500 },
      );
    }
  } finally {
    logSponsorRequest({ summary, verdict, outcome, durationMs: Date.now() - startedAt });
  }
}
