import { Horizon, Networks, rpc } from "@stellar/stellar-sdk";

// Public Stellar testnet defaults, used whenever the environment variable
// is not set. These are the standard public testnet endpoints, safe to
// call from a browser with no API key.
const DEFAULT_HORIZON_URL = "https://horizon-testnet.stellar.org";
const DEFAULT_SOROBAN_RPC_URL = "https://soroban-testnet.stellar.org";

export const HORIZON_URL = process.env.NEXT_PUBLIC_HORIZON_URL || DEFAULT_HORIZON_URL;

export const SOROBAN_RPC_URL =
  process.env.NEXT_PUBLIC_SOROBAN_RPC_URL || DEFAULT_SOROBAN_RPC_URL;

// Testnet only, for now: everything in this app targets Stellar testnet.
export const NETWORK_PASSPHRASE = Networks.TESTNET;

export const horizonServer = new Horizon.Server(HORIZON_URL);

// Not used by any read function yet: reserved for the Soroban contract
// state reads (smart account, policy) that come in a later step.
export const sorobanServer = new rpc.Server(SOROBAN_RPC_URL);
