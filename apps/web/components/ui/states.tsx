import type { ReactNode } from "react";
import { Button } from "./button";
import { cn } from "./cn";
import { Icon, Spinner, type IconName } from "./icons";

export type NoticeTone = "info" | "success" | "danger";

const TONE_ICON: Record<NoticeTone, IconName> = {
  info: "info",
  success: "check",
  danger: "alert",
};

type NoticeProps = {
  tone?: NoticeTone;
  /** "alert" for an error that just appeared, "status" for a result
      worth announcing, omitted for static information. */
  role?: "alert" | "status" | "note";
  title?: ReactNode;
  children: ReactNode;
  /** A follow-up control, such as a Retry button. */
  action?: ReactNode;
  className?: string;
};

/**
 * Inline status. Every tone is an icon plus text; danger adds its color
 * to both, so an error is never carried by color alone.
 */
export function Notice({ tone = "info", role, title, children, action, className }: NoticeProps) {
  return (
    <div role={role} data-tone={tone} className={cn("ot-notice", className)}>
      <Icon name={TONE_ICON[tone]} className="ot-notice-icon" />
      <div className="ot-notice-body">
        {title ? <p className="font-medium">{title}</p> : null}
        <div>{children}</div>
        {action ? <div className="mt-3">{action}</div> : null}
      </div>
    </div>
  );
}

/** A loading line: spinner plus what is being loaded, announced politely. */
export function LoadingState({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p role="status" className={cn("ot-status", className)}>
      <Spinner />
      <span>{children}</span>
    </p>
  );
}

type ErrorStateProps = {
  message: ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
};

/** A failed read: the message, and a way to try again when there is one. */
export function ErrorState({ message, onRetry, retryLabel = "Retry", className }: ErrorStateProps) {
  return (
    <Notice
      tone="danger"
      role="alert"
      className={className}
      action={
        onRetry ? (
          <Button size="sm" onClick={onRetry}>
            <Icon name="refresh" size={16} />
            {retryLabel}
          </Button>
        ) : undefined
      }
    >
      {message}
    </Notice>
  );
}

type EmptyStateProps = {
  icon?: IconName;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
};

/** Nothing to show yet: a pressed well saying so, and what comes next. */
export function EmptyState({ icon = "info", children, action, className }: EmptyStateProps) {
  return (
    <div className={cn("ot-empty", className)}>
      <Icon name={icon} size={24} />
      <div className="max-w-md">{children}</div>
      {action}
    </div>
  );
}

/** A placeholder block for content that has a known shape while it loads. */
export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn("ot-skeleton", className)} />;
}
