import type { ProgressStage } from "@/components/ui/operation-progress";

/*
  The stages shown while a slow on-chain operation runs. Each list is
  only as fine as what the app can actually observe, so a stage here
  always has a real signal behind it: an event from the account kit, the
  start of a call, or (for the last, opaque stage of each) simply the
  time since the call began.
*/

/** Account creation. The first two advance on the kit's own events. */
export type CreationStage = "passkey" | "preparing" | "deploying";

export const CREATION_STAGES: ProgressStage<CreationStage>[] = [
  { id: "passkey", label: "Creating your passkey" },
  { id: "preparing", label: "Preparing your account" },
  { id: "deploying", label: "Deploying and funding on-chain" },
];

/** Installing a policy. The last stage follows the call, it does not report it. */
export type InstallStage = "preparing" | "authorizing" | "confirming";

export const INSTALL_STAGES: ProgressStage<InstallStage>[] = [
  { id: "preparing", label: "Preparing" },
  { id: "authorizing", label: "Authorizing" },
  { id: "confirming", label: "Confirming on-chain" },
];

/** Revoking a policy. Staged like an install, and the last stage follows the call too. */
export type RevokeStage = "preparing" | "authorizing" | "confirming";

export const REVOKE_STAGES: ProgressStage<RevokeStage>[] = [
  { id: "preparing", label: "Preparing" },
  { id: "authorizing", label: "Authorizing" },
  { id: "confirming", label: "Confirming on-chain" },
];

/** Submitting a rebalance through the keeper. */
export type TriggerStage = "submitting" | "confirming";

export const TRIGGER_STAGES: ProgressStage<TriggerStage>[] = [
  { id: "submitting", label: "Submitting rebalance" },
  { id: "confirming", label: "Confirming on-chain" },
];

/** The quiet line under a wait whose later stages cannot be observed. */
export const SLOW_WAIT_NOTE = "This can take up to about 30 seconds.";
