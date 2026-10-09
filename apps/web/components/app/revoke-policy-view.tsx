import { Button } from "@/components/ui/button";
import { Card, IconWell } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Icon } from "@/components/ui/icons";
import { Notice } from "@/components/ui/states";
import { TransactionReceipt } from "./common";
import type { RevokeState } from "./types";

/*
  The revoke control, as markup: the honest copy about what revoking does
  and does not touch, the confirm step, and the result. Whether the
  confirm step is open, and the revoke itself, belong to
  components/revoke-policy-panel.tsx.

  The confirm step is a dialog. Revoking is the one destructive action in
  the app, so it gets a deliberate second step, focus opens on Cancel, and
  the confirm button is marked with the danger ink and an icon as well as
  its words.
*/

type RevokePolicyViewProps = {
  state: RevokeState;
  confirming: boolean;
  onAskConfirm: () => void;
  onCancel: () => void;
  onConfirm: () => void;
  onContinue: () => void;
};

const copy = "mt-2 text-sm leading-relaxed text-text-muted";

export function RevokePolicyView({ state, confirming, onAskConfirm, onCancel, onConfirm, onContinue }: RevokePolicyViewProps) {
  if (state.status === "success") {
    return (
      <Card role="status" className="flex flex-col gap-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-5">
          <IconWell>
            <Icon name="check" />
          </IconWell>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-base font-medium text-text">Policy revoked</h2>
            <p className={copy}>
              The standing rebalance authorization on this account has been
              removed. No further rebalance can be triggered. Your funds stayed
              in your account the whole time and are untouched; you can set up
              a new policy whenever you want.
            </p>
          </div>
        </div>
        <TransactionReceipt hash={state.hash} />
        <Button variant="primary" onClick={onContinue} className="w-fit">
          Back to dashboard
        </Button>
      </Card>
    );
  }

  const revoking = state.status === "revoking";

  return (
    <Card className="flex flex-col items-start gap-4">
      <div>
        <p className="nm-caps">Revoke</p>
        <p className={copy}>
          Revoking removes this account&rsquo;s standing rebalance
          authorization. No further rebalance can be triggered until you set
          up a new policy. Your funds stay in your account, untouched; you
          are only withdrawing the permission, not moving anything.
        </p>
      </div>

      <Button variant="danger" onClick={onAskConfirm} disabled={revoking} loading={revoking}>
        {revoking ? null : <Icon name="alert" size={16} />}
        {revoking ? "Revoking..." : "Revoke policy"}
      </Button>

      {state.status === "error" ? (
        <Notice tone="danger" role="alert" className="w-full">
          {state.message}
        </Notice>
      ) : null}

      <Dialog
        open={confirming}
        onClose={onCancel}
        title="Revoke this policy?"
        description="This needs one more passkey signature."
        footer={
          <>
            <Button data-autofocus onClick={onCancel} disabled={revoking}>
              Cancel
            </Button>
            <Button variant="danger" onClick={onConfirm} disabled={revoking}>
              <Icon name="alert" size={16} />
              {revoking ? "Revoking..." : "Confirm revoke"}
            </Button>
          </>
        }
      />
    </Card>
  );
}
