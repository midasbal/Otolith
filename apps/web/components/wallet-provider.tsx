"use client";

import "@/lib/buffer-polyfill";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { IndexedDBStorage, SmartAccountKit } from "smart-account-kit";
import { NETWORK_PASSPHRASE, SOROBAN_RPC_URL } from "@/lib/stellar";

// Published, already-deployed OpenZeppelin smart account WASM and WebAuthn
// verifier for Protocol 27 testnet, and the native XLM Stellar Asset
// Contract on testnet.
const ACCOUNT_WASM_HASH = "1b5f4534a76322da2ad7c745f6900857a6802b0ca79850c35a03561df997785a";
const WEBAUTHN_VERIFIER_ADDRESS = "CC7EKIHQP3TN4CARQDND6CEOY2UXLWWC2X5GHTD5NLAT7BG5GPZIOM3F";
const NATIVE_SAC = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";

const APP_NAME = "Otolith";
const DEPLOY_SPONSOR_URL = "/api/deployer";

type WalletContextValue = {
  address: string | null;
  connecting: boolean;
  error: string | null;
  createWallet: () => Promise<void>;
  connectWallet: () => Promise<void>;
  disconnect: () => Promise<void>;
};

const WalletContext = createContext<WalletContextValue | null>(null);

export function truncateAddress(address: string) {
  if (address.length <= 12) {
    return address;
  }
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

// The kit holds its own connection state internally, so it must only be
// constructed once per page load, not once per WalletProvider mount, and
// only client-side: IndexedDBStorage and the real WebAuthn ceremony both
// require browser APIs that do not exist during SSR.
let kitInstance: SmartAccountKit | null = null;

export function getKit(): SmartAccountKit {
  if (!kitInstance) {
    kitInstance = new SmartAccountKit({
      rpcUrl: SOROBAN_RPC_URL,
      networkPassphrase: NETWORK_PASSPHRASE,
      accountWasmHash: ACCOUNT_WASM_HASH,
      webauthnVerifierAddress: WEBAUTHN_VERIFIER_ADDRESS,
      storage: new IndexedDBStorage(),
      relayerUrl: DEPLOY_SPONSOR_URL,
      // No deployerSecret here: this stays the kit's shared, public,
      // well-known default deployer, which only ever signs the deploy
      // authorization entry and never pays a fee or becomes a signer.
      // Our own funded deployer key lives only on the server, behind
      // relayerUrl above, and pays the fee there instead.
    });
  }
  return kitInstance;
}

function describeError(err: unknown, fallback: string): string {
  if (err instanceof Error) {
    if (err.name === "NotAllowedError") {
      return "The passkey request was cancelled.";
    }
    if (err.message.includes("Smart account contract not found on-chain")) {
      return "No Otolith account was found for that passkey.";
    }
    if (err.message) {
      return err.message;
    }
  }
  return fallback;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const restoreAttempted = useRef(false);

  useEffect(() => {
    if (restoreAttempted.current) {
      return;
    }
    restoreAttempted.current = true;

    // Silent restore only: no stored session means no ceremony and no
    // error, just a normal not-connected state for a first-time visitor.
    getKit()
      .connectWallet()
      .then((result) => {
        if (result) {
          setAddress(result.contractId);
        }
      })
      .catch((err) => {
        console.error(err);
      });
  }, []);

  const createWallet = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      const kit = getKit();
      const result = await kit.createWallet(APP_NAME, `Otolith account ${new Date().toLocaleDateString()}`, {
        autoSubmit: true,
        autoFund: true,
        nativeTokenContract: NATIVE_SAC,
      });

      if (result.submitResult && result.submitResult.success === false) {
        throw new Error(result.submitResult.error.message || "Could not deploy the smart account.");
      }

      setAddress(result.contractId);

      if (result.fundResult && result.fundResult.success === false) {
        setError(
          "The account was created, but funding it with testnet XLM failed. It may need funding before it can do anything.",
        );
      }
    } catch (err) {
      console.error(err);
      setError(describeError(err, "Could not create a new Otolith account. Try again."));
    } finally {
      setConnecting(false);
    }
  }, []);

  const connectWallet = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      const kit = getKit();
      const result = await kit.connectWallet({ fresh: true });
      if (!result) {
        throw new Error("No passkey was selected.");
      }
      setAddress(result.contractId);
    } catch (err) {
      console.error(err);
      setError(describeError(err, "Could not connect with that passkey. Try again."));
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    try {
      await getKit().disconnect();
    } finally {
      setAddress(null);
    }
  }, []);

  const value = useMemo(
    () => ({ address, connecting, error, createWallet, connectWallet, disconnect }),
    [address, connecting, error, createWallet, connectWallet, disconnect],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error("useWallet must be used within a WalletProvider");
  }
  return context;
}
