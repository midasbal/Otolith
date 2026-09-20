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
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid request body." }, { status: 400 });
  }

  if (
    typeof body !== "object" ||
    body === null ||
    typeof (body as { func?: unknown }).func !== "string" ||
    !Array.isArray((body as { auth?: unknown }).auth) ||
    !(body as { auth: unknown[] }).auth.every((entry) => typeof entry === "string")
  ) {
    return NextResponse.json(
      { success: false, error: "Expected a func string and an auth array of strings." },
      { status: 400 },
    );
  }

  const { func, auth } = body as { func: string; auth: string[] };

  try {
    const result = await sponsorHostFunctionCall(func, auth);
    return NextResponse.json({ success: true, hash: result.hash });
  } catch (err) {
    if (err instanceof DeployerNotConfiguredError) {
      return NextResponse.json({ success: false, error: err.message }, { status: 503 });
    }
    if (err instanceof DeploySponsorError) {
      return NextResponse.json({ success: false, error: err.message }, { status: 502 });
    }
    console.error(err);
    return NextResponse.json(
      { success: false, error: "Could not sponsor the deploy." },
      { status: 500 },
    );
  }
}
