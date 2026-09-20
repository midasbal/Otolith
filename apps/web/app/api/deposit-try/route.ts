import "server-only";

import { NextResponse } from "next/server";
import { estimateUsdcForTry, runLiraDeposit, AnchorDepositError, DeployerNotConfiguredError } from "@/lib/server/anchor";

function isValidAccountAddress(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("C") && value.length === 56;
}

function isValidTryAmount(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }
  const numeric = Number(value);
  // Kept modest on purpose for a demo deposit: large enough to be a real
  // trade, small enough that a mistaken retry never asks the sandbox for
  // an outsized amount.
  return /^\d+(\.\d{1,2})?$/.test(value) && numeric > 0 && numeric <= 5000;
}

/**
 * Estimates the USDC a given TRY amount would produce, from the anchor's
 * own public SEP-38 price endpoint. Read-only: no deposit is created.
 */
export async function GET(request: Request) {
  // Wraps the whole handler, not just the anchor call: a route that
  // throws anywhere (including at module load, a bad import, or a
  // programming mistake) must still answer with JSON, never an empty
  // response the client's res.json() then chokes on.
  try {
    const amount = new URL(request.url).searchParams.get("amount");
    if (!isValidTryAmount(amount)) {
      return NextResponse.json({ message: "Expected an amount query parameter between 0 and 5000 TRY." }, { status: 400 });
    }

    const estimatedUsdc = await estimateUsdcForTry(amount);
    return NextResponse.json({ estimatedUsdc });
  } catch (err) {
    if (err instanceof AnchorDepositError) {
      return NextResponse.json({ message: err.message }, { status: 502 });
    }
    console.error(err);
    return NextResponse.json({ message: "Could not reach the anchor for a rate estimate." }, { status: 502 });
  }
}

/**
 * Runs the full lira deposit flow: SEP-10 auth and SEP-6 deposit against
 * the anchor, the sandbox bank settlement, a bounded poll to completion,
 * and the forward into the user's smart-account C-address. The relay's
 * key never leaves the server; the browser only ever sees this route.
 */
export async function POST(request: Request) {
  // Wraps the whole handler, not just the anchor call: a route that
  // throws anywhere (including at module load, a bad import, or a
  // programming mistake) must still answer with JSON, never an empty
  // response the client's res.json() then chokes on.
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, message: "Invalid request body." }, { status: 400 });
    }

    const parsed = typeof body === "object" && body !== null ? (body as { account?: unknown; amountTry?: unknown }) : {};
    if (!isValidAccountAddress(parsed.account)) {
      return NextResponse.json({ success: false, message: "Expected an account field (a C... address)." }, { status: 400 });
    }
    if (!isValidTryAmount(parsed.amountTry)) {
      return NextResponse.json({ success: false, message: "Expected an amountTry field between 0 and 5000." }, { status: 400 });
    }

    const outcome = await runLiraDeposit(parsed.account, parsed.amountTry);
    return NextResponse.json(outcome);
  } catch (err) {
    if (err instanceof DeployerNotConfiguredError) {
      return NextResponse.json({ success: false, message: err.message, stages: [] }, { status: 503 });
    }
    console.error(err);
    return NextResponse.json(
      { success: false, message: "Could not reach the anchor or the Stellar network to complete this deposit.", stages: [] },
      { status: 502 },
    );
  }
}
