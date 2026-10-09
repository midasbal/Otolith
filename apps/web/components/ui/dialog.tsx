"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { IconButton } from "./button";
import { cn } from "./cn";
import { Icon } from "./icons";

type DialogProps = {
  open: boolean;
  /** Called for every way out: Escape, the backdrop, the close button. */
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  /** Action buttons, laid out at the foot of the dialog. */
  footer?: ReactNode;
  /** modal is a centered card; sheet slides in from the right edge. */
  variant?: "modal" | "sheet";
  className?: string;
};

/**
 * A modal dialog on the native <dialog> element, so the browser itself
 * traps focus, closes on Escape, makes the page behind inert, and puts
 * focus back where it came from on close. Focus opens on the element
 * marked data-autofocus if there is one (the least destructive action in
 * a confirm), otherwise on the close button.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  variant = "modal",
  className,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
      dialog.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      className={cn("nm-dialog", variant === "sheet" && "nm-sheet", className)}
      onClose={onClose}
      onClick={(event) => {
        // The panel below covers the dialog's whole box, so the dialog
        // element itself is only ever the click target on the backdrop.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="nm-dialog-panel">
        <div className="flex items-start justify-between gap-4">
          <h2 id={titleId} className="font-display text-md font-medium text-text">
            {title}
          </h2>
          <IconButton label="Close" size="sm" onClick={onClose}>
            <Icon name="close" size={16} />
          </IconButton>
        </div>
        {description ? (
          <p id={descriptionId} className="nm-hint mt-3">
            {description}
          </p>
        ) : null}
        {children ? <div className="mt-5">{children}</div> : null}
        {footer ? <div className="mt-6 flex flex-wrap items-center justify-end gap-3">{footer}</div> : null}
      </div>
    </dialog>
  );
}
