import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "./cn";
import { Spinner } from "./icons";

export type ButtonVariant = "primary" | "secondary" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

type ButtonStyleProps = {
  /** primary is the one accent-filled control; use it once per view. */
  variant?: ButtonVariant;
  size?: ButtonSize;
};

function buttonClass({ variant = "secondary", size = "md" }: ButtonStyleProps, className?: string) {
  return cn(
    "ot-btn",
    variant === "primary" && "ot-btn-primary",
    variant === "danger" && "ot-btn-danger",
    size === "sm" && "ot-btn-sm",
    size === "lg" && "ot-btn-lg",
    className,
  );
}

type ButtonProps = ComponentProps<"button"> &
  ButtonStyleProps & {
    /** Shows a spinner ahead of the label and marks the button busy. */
    loading?: boolean;
  };

/**
 * A native button. Disabled is the real `disabled` attribute, so a click
 * is blocked by the browser, mirrored as aria-disabled and shown by
 * shape: a dashed outline where the fill was, with a not-allowed cursor.
 * (Pass aria-disabled alone, without `disabled`, for a button that
 * should stay focusable while it is unavailable; it looks the same.)
 */
export function Button({
  variant,
  size,
  loading = false,
  className,
  disabled,
  type = "button",
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled}
      aria-disabled={disabled ? true : undefined}
      aria-busy={loading ? true : undefined}
      className={buttonClass({ variant, size }, className)}
      {...rest}
    >
      {loading ? <Spinner size={16} /> : null}
      {children}
    </button>
  );
}

type ButtonLinkProps = Omit<ComponentProps<"a">, "href"> &
  ButtonStyleProps & {
    href: string;
    /** Render a plain anchor (a full page navigation) instead of a
        client-side Link. */
    native?: boolean;
  };

/** A link that looks like a button. Same variants and sizes as Button. */
export function ButtonLink({ href, native = false, variant, size, className, children, ...rest }: ButtonLinkProps) {
  const classes = buttonClass({ variant, size }, className);
  if (native) {
    return (
      <a href={href} className={classes} {...rest}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={classes} {...rest}>
      {children}
    </Link>
  );
}

type IconButtonProps = Omit<ButtonProps, "children" | "aria-label"> & {
  /** The button's accessible name, also shown as its tooltip. */
  label: string;
  children: ReactNode;
};

/** A round button holding only an icon. The label is required. */
export function IconButton({ label, className, children, ...rest }: IconButtonProps) {
  return (
    <Button aria-label={label} title={label} className={cn("ot-btn-icon", className)} {...rest}>
      {children}
    </Button>
  );
}

type TextButtonProps = ComponentProps<"button"> & {
  /** Secondary ink instead of the accent, for a quieter action. */
  muted?: boolean;
};

/** A button that reads as an inline link: accent, always underlined. */
export function TextButton({ muted = false, className, type = "button", ...rest }: TextButtonProps) {
  return <button type={type} className={cn("ot-link", muted && "ot-link-muted", className)} {...rest} />;
}

type TextLinkProps = Omit<ComponentProps<"a">, "href"> & {
  href: string;
  muted?: boolean;
  /** Render a plain anchor instead of a client-side Link. Absolute URLs
      and in-page anchors are always plain anchors. */
  native?: boolean;
};

/** An inline link: accent, always underlined. */
export function TextLink({ href, muted = false, native = false, className, children, ...rest }: TextLinkProps) {
  const classes = cn("ot-link", muted && "ot-link-muted", className);
  if (native || href.startsWith("http") || href.startsWith("#")) {
    return (
      <a href={href} className={classes} {...rest}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={classes} {...rest}>
      {children}
    </Link>
  );
}
