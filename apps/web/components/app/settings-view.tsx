import type { ReactNode } from "react";
import { ButtonLink, TextLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState, LoadingState } from "@/components/ui/states";
import { ConnectPrompt, PolicyTermsList, Screen, ScreenHeader } from "./common";
import type { PolicyState } from "./types";

/*
  Settings, as markup: the account, its policy, and the revoke control.
  The readings and the two interactive pieces (copy, revoke) are handed in
  by app/app/settings/page.tsx.
*/

type ConnectProps = {
  connecting: boolean;
  error: string | null;
  onCreate: () => void;
  onConnect: () => void;
};

/** Settings before an account is connected. */
export function SettingsConnectView({ connecting, error, onCreate, onConnect }: ConnectProps) {
  return (
    <Screen>
      <ScreenHeader title="Settings">Connect your account to see its settings.</ScreenHeader>
      <ConnectPrompt connecting={connecting} error={error} onCreate={onCreate} onConnect={onConnect} />
    </Screen>
  );
}

type SettingsViewProps = {
  address: string;
  explorerAccountUrl: string;
  /** The copy-address button. */
  copyButton: ReactNode;
  policyState: PolicyState;
  onRetryPolicy: () => void;
  /** The revoke control, when a policy is installed. */
  revoke: ReactNode;
};

export function SettingsView({ address, explorerAccountUrl, copyButton, policyState, onRetryPolicy, revoke }: SettingsViewProps) {
  return (
    <Screen>
      <ScreenHeader title="Settings">Account and policy details for this connection.</ScreenHeader>

      <Card className="flex flex-col gap-3">
        <p className="nm-caps">Account</p>
        <div className="nm-hash">
          <span className="nm-hash-value" title={address}>
            {address}
          </span>
          {copyButton}
        </div>
        <TextLink href={explorerAccountUrl} target="_blank" rel="noreferrer" className="w-fit text-sm">
          View on stellar.expert
        </TextLink>
      </Card>

      <div className="min-w-0">
        {policyState.status === "loading" ? <LoadingState>Checking your portfolio setup...</LoadingState> : null}

        {policyState.status === "error" ? <ErrorState message={policyState.message} onRetry={onRetryPolicy} /> : null}

        {policyState.status === "loaded" && policyState.result.kind === "not-installed" ? (
          <Card className="flex flex-col items-start gap-4">
            <div>
              <p className="nm-caps">Policy</p>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">
                No rebalance policy is installed on this account yet.
              </p>
            </div>
            <ButtonLink href="/app/setup" native variant="primary">
              Set up your portfolio
            </ButtonLink>
          </Card>
        ) : null}

        {policyState.status === "loaded" && policyState.result.kind === "installed" ? (
          <Card>
            <p className="nm-caps">Policy</p>
            <PolicyTermsList terms={policyState.result.params} className="mt-2" />
          </Card>
        ) : null}
      </div>

      {revoke ? <div className="min-w-0">{revoke}</div> : null}
    </Screen>
  );
}
