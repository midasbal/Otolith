// The smart-account contracts this app deploys accounts from, shared by
// the browser (components/wallet-provider.tsx), the keeper
// (lib/server/rebalance.ts) and the deploy sponsor's allowlist
// (lib/server/deployer-constants.ts), so there is exactly one place these
// addresses live. Published, already-deployed OpenZeppelin smart account
// WASM and WebAuthn verifier for Protocol 27 testnet.

export const ACCOUNT_WASM_HASH = "1b5f4534a76322da2ad7c745f6900857a6802b0ca79850c35a03561df997785a";
export const WEBAUTHN_VERIFIER_ADDRESS = "CC7EKIHQP3TN4CARQDND6CEOY2UXLWWC2X5GHTD5NLAT7BG5GPZIOM3F";
