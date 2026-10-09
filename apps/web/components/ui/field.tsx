import { useId, type ComponentProps, type ReactNode } from "react";
import { cn } from "./cn";
import { Icon } from "./icons";

/** What a Field hands to its control so the two are wired together. */
export type FieldControlProps = {
  id: string;
  "aria-labelledby": string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
};

type FieldProps = {
  label: ReactNode;
  /** Supporting text under the label, read with the control. */
  hint?: ReactNode;
  /** A validation message. Shown in the danger color with an icon, and
      marks the control invalid. */
  error?: string | null;
  className?: string;
  children: (control: FieldControlProps) => ReactNode;
};

/**
 * A labelled form field. The label is always visible and always tied to
 * the control: an inset well does not identify itself as an input, the
 * label does. It is tied twice: by `for`, so a click on it reaches the
 * control, and by aria-labelledby, so a control that is not a native form
 * element (Select's trigger) is named by it too. Hint and error are
 * announced with the control through aria-describedby.
 */
export function Field({ label, hint, error, className, children }: FieldProps) {
  const id = useId();
  const labelId = `${id}-label`;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("ot-field", className)}>
      <label id={labelId} htmlFor={id} className="ot-label">
        {label}
      </label>
      {hint ? (
        <p id={hintId} className="ot-hint">
          {hint}
        </p>
      ) : null}
      {children({
        id,
        "aria-labelledby": labelId,
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : undefined,
      })}
      {error ? (
        <p id={errorId} role="alert" className="ot-field-error">
          <Icon name="alert" size={16} />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}

function isInvalid(value: ComponentProps<"input">["aria-invalid"]): boolean {
  return value === true || value === "true";
}

type InputProps = ComponentProps<"input"> & {
  /** Content inside the well ahead of the value, such as a currency. */
  leading?: ReactNode;
  /** Content inside the well after the value, such as a unit. */
  trailing?: ReactNode;
  wellClassName?: string;
};

/**
 * A text or number input, set into a pressed well. Numerals are tabular.
 * The focus ring is drawn around the whole well, units included.
 */
export function Input({ leading, trailing, wellClassName, className, ...rest }: InputProps) {
  return (
    <div className={cn("ot-well", wellClassName)} data-invalid={isInvalid(rest["aria-invalid"]) ? "true" : undefined}>
      {leading ? <span className="ot-affix">{leading}</span> : null}
      <input className={cn("ot-input", className)} {...rest} />
      {trailing ? <span className="ot-affix">{trailing}</span> : null}
    </div>
  );
}
