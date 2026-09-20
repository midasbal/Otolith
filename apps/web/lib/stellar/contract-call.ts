import { Account, BASE_FEE, Contract, Keypair, TransactionBuilder, type xdr } from "@stellar/stellar-sdk";
import { NETWORK_PASSPHRASE, sorobanServer } from "./config";

/**
 * Simulates a read-only Soroban contract call: no signing, no
 * submission. The transaction's source account only exists because a
 * valid envelope needs one; a throwaway keypair stands in, since
 * simulation never checks its existence, signature, or ability to pay a
 * fee, and the sequence number is never checked either since this
 * transaction is never sent to the network.
 */
export async function simulateReadCall(contractId: string, method: string, args: xdr.ScVal[] = []) {
  const dummySource = new Account(Keypair.random().publicKey(), "0");
  const contract = new Contract(contractId);

  const transaction = new TransactionBuilder(dummySource, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build();

  return sorobanServer.simulateTransaction(transaction);
}
