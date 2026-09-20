import "server-only";

import { NextResponse } from "next/server";
import { checkRebalance, triggerRebalance, DeployerNotConfiguredError } from "@/lib/server/rebalance";

function isValidAccountAddress(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("C") && value.length === 56;
}

/**
 * Checks whether a rebalance is currently due for a smart account.
 * Read-only: never submits anything, so it needs no deployer key at
 * all, only the account address.
 */
export async function GET(request: Request) {
  const account = new URL(request.url).searchParams.get("account");
  if (!isValidAccountAddress(account)) {
    return NextResponse.json({ state: "error", message: "Expected an account query parameter (a C... address)." }, { status: 400 });
  }

  try {
    const state = await checkRebalance(account);
    return NextResponse.json(state);
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { state: "error", message: "Could not reach the Stellar network to check this account." },
      { status: 502 },
    );
  }
}

/**
 * Triggers a real permissionless rebalance, submitted and fee-paid by
 * our own deployer/keeper key. Re-checks eligibility first and never
 * submits a transaction that is not ready.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ state: "error", message: "Invalid request body." }, { status: 400 });
  }

  const account = typeof body === "object" && body !== null ? (body as { account?: unknown }).account : undefined;
  if (!isValidAccountAddress(account)) {
    return NextResponse.json({ state: "error", message: "Expected an account field (a C... address)." }, { status: 400 });
  }

  try {
    const result = await triggerRebalance(account);
    if ("submitted" in result) {
      return NextResponse.json({ success: true, hash: result.hash, ledger: result.ledger });
    }
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof DeployerNotConfiguredError) {
      return NextResponse.json({ state: "error", message: err.message }, { status: 503 });
    }
    console.error(err);
    return NextResponse.json(
      { state: "error", message: "Could not reach the Stellar network to submit this rebalance." },
      { status: 502 },
    );
  }
}
