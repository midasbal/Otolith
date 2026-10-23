import type { ReactNode } from "react";
import { Button, type ButtonVariant } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";

/**
 * One of the simulator's two actions. Whichever has been taken is
 * unavailable until the other is, and says so three ways besides its
 * look: to assistive technology (aria-disabled), to a pointer (the
 * cursor), and to the eye with a tick before its label.
 *
 * It is not the native disabled state, which would take the button out
 * of the tab order and drop the keyboard's focus the moment it is
 * pressed. It stays focusable and simply does nothing.
 *
 * The tick stands in the button's own padding, beside the label, so the
 * button is the same width with it and without it and nothing moves
 * when it comes and goes.
 */
export function DemoAction({
  done,
  variant,
  onPress,
  children,
}: {
  /** The action has been taken and is not available again yet. */
  done: boolean;
  variant?: ButtonVariant;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      variant={variant}
      aria-disabled={done ? true : undefined}
      className="ot-demo-action"
      onClick={() => {
        if (!done) onPress();
      }}
    >
      {done ? <Icon name="check" size={14} className="ot-demo-action-tick" /> : null}
      {children}
    </Button>
  );
}
