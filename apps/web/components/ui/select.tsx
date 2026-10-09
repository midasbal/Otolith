"use client";

import {
  Children,
  isValidElement,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { cn } from "./cn";
import { Icon } from "./icons";

/*
  Select: one choice from a short list, with the list drawn in the same
  soft surface as everything else rather than by the operating system.

  It is a drop-in for <select>. It takes the same value, the same
  onChange, the same <option> children, the same name and form, because
  the native select is still there: out of sight and out of the tab
  order, holding the value. A choice made in the list is handed to that
  select, which then fires its own change event, so a caller's handler
  receives what it always did (event.target.value, from a real <select>)
  and a surrounding form submits and resets as before. Only what the user
  sees and operates is replaced.

  What they operate follows the WAI-ARIA "select-only combobox" pattern.
  The trigger is the combobox and keeps focus the whole time; the list is
  a listbox it controls; the highlighted option is named to assistive
  technology through aria-activedescendant. The list opens in the top
  layer (the Popover API), so it is never clipped by a scrolling
  container and sits above a dialog it was opened from.
*/

type Item = {
  value: string;
  label: ReactNode;
  /** The label as plain text, for type-ahead. */
  text: string;
  disabled: boolean;
};

function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return "";
}

/** The <option> children, read as data. Like a <select>, an option with no value uses its text. */
function readItems(children: ReactNode): Item[] {
  const items: Item[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement<ComponentProps<"option">>(child) || child.type !== "option") return;
    const text = textOf(child.props.children);
    items.push({
      value: child.props.value === undefined ? text : String(child.props.value),
      label: child.props.children,
      text,
      disabled: Boolean(child.props.disabled),
    });
  });
  return items;
}

// How far the list keeps from its trigger (clear of the trigger's focus
// ring, which is drawn in that space) and from the edge of the screen.
const GAP = 12;
const EDGE = 8;

// Letters typed within this long of each other are one search.
const TYPE_AHEAD_MS = 500;

/**
 * Puts the list against its trigger: below it, as wide as it at least,
 * or above it when there is more room there than below and the list
 * would not fit. It never leaves the viewport; a list taller than the
 * room it has scrolls instead.
 */
function place(anchor: HTMLElement, list: HTMLElement) {
  const box = anchor.getBoundingClientRect();
  const viewportWidth = document.documentElement.clientWidth;
  const viewportHeight = document.documentElement.clientHeight;

  list.style.maxHeight = "";
  list.style.minWidth = `${Math.min(box.width, viewportWidth - 2 * EDGE)}px`;
  list.style.maxWidth = `${viewportWidth - 2 * EDGE}px`;
  const width = list.offsetWidth;
  const height = list.offsetHeight;

  const below = viewportHeight - box.bottom - GAP - EDGE;
  const above = box.top - GAP - EDGE;
  const side = height <= below || below >= above ? "bottom" : "top";
  const room = Math.max(0, side === "bottom" ? below : above);
  const shown = Math.min(height, room);

  list.dataset.side = side;
  if (height > room) list.style.maxHeight = `${room}px`;
  list.style.left = `${Math.max(EDGE, Math.min(box.left, viewportWidth - EDGE - width))}px`;
  list.style.top = `${side === "bottom" ? box.bottom + GAP : box.top - GAP - shown}px`;
}

// Where the Popover API is missing, these throw and the stylesheet shows
// the list by its data-open attribute instead.
function showInTopLayer(list: HTMLElement) {
  try {
    if (!list.matches(":popover-open")) list.showPopover();
  } catch {}
}

function hideFromTopLayer(list: HTMLElement) {
  try {
    if (list.matches(":popover-open")) list.hidePopover();
  } catch {}
}

type SelectProps = Pick<
  ComponentProps<"select">,
  | "id"
  | "name"
  | "form"
  | "onChange"
  | "disabled"
  | "required"
  | "autoComplete"
  | "aria-label"
  | "aria-labelledby"
  | "aria-describedby"
  | "aria-invalid"
> & {
  value?: string;
  defaultValue?: string;
  /** <option> elements, exactly as a <select> takes them. */
  children: ReactNode;
  /** Content inside the well ahead of the value. */
  leading?: ReactNode;
  /** Content inside the well after the value, such as a unit. */
  trailing?: ReactNode;
  wellClassName?: string;
  className?: string;
};

export function Select({
  id,
  name,
  form,
  value,
  defaultValue,
  onChange,
  disabled = false,
  required,
  autoComplete,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
  leading,
  trailing,
  wellClassName,
  className,
  children,
}: SelectProps) {
  const items = readItems(children);
  const firstValue = items[0]?.value ?? "";

  const baseId = useId();
  const listId = `${baseId}-list`;
  const optionId = (index: number) => `${baseId}-option-${index}`;

  // Uncontrolled, the choice lives here; controlled, `value` wins.
  const [inner, setInner] = useState(defaultValue ?? firstValue);
  const current = value ?? inner;
  const selectedIndex = items.findIndex((item) => item.value === current);
  const selected = selectedIndex >= 0 ? items[selectedIndex] : undefined;

  const [open, setOpen] = useState(false);
  // The highlighted option: where the arrow keys are, or the pointer.
  const [activeIndex, setActiveIndex] = useState(-1);

  const wellRef = useRef<HTMLDivElement>(null);
  const nativeRef = useRef<HTMLSelectElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const typed = useRef({ text: "", at: 0 });

  /** The first option that can be chosen at `from` or beyond it, looking in `direction`. */
  const seek = (from: number, direction: 1 | -1): number => {
    for (let index = from; index >= 0 && index < items.length; index += direction) {
      if (!items[index].disabled) return index;
    }
    return -1;
  };

  const openList = (index = selectedIndex) => {
    if (disabled || items.length === 0) return;
    const usable = index >= 0 && index < items.length && !items[index].disabled;
    setActiveIndex(usable ? index : seek(0, 1));
    setOpen(true);
  };

  /** Moves the highlight to `index`, or to the nearest option to it that can be chosen. */
  const highlight = (index: number, direction: 1 | -1) => {
    const from = Math.min(items.length - 1, Math.max(0, index));
    const forward = seek(from, direction);
    const next = forward >= 0 ? forward : seek(from, direction === 1 ? -1 : 1);
    if (next >= 0) setActiveIndex(next);
  };

  // Choosing hands the value to the native select and lets it announce
  // the change itself, so onChange receives a real change event from a
  // real <select>. Choosing the option already selected changes nothing.
  const choose = (index: number) => {
    const item = items[index];
    const native = nativeRef.current;
    setOpen(false);
    if (!item || item.disabled || !native || item.value === current) return;
    native.value = item.value;
    native.dispatchEvent(new Event("change", { bubbles: true }));
  };

  // Type-ahead: the letters typed in quick succession find the next
  // option that starts with them. One letter repeated steps through the
  // options that start with it.
  const typeAhead = (character: string) => {
    if (disabled || items.length === 0) return;

    const now = Date.now();
    const text = (now - typed.current.at > TYPE_AHEAD_MS ? "" : typed.current.text) + character.toLowerCase();
    typed.current = { text, at: now };

    const start = (open ? activeIndex : selectedIndex) + 1;
    const order = items.map((_, offset) => (start + offset + items.length) % items.length);
    const find = (query: string) =>
      order.find((index) => !items[index].disabled && items[index].text.toLowerCase().startsWith(query));
    const repeated = [...text].every((letter) => letter === text[0]);
    const match = find(text) ?? (repeated ? find(text[0]) : undefined);
    if (match === undefined) return;

    setActiveIndex(match);
    setOpen(true);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const { key } = event;
    if (event.ctrlKey || event.metaKey) return;

    if (key.length === 1 && key !== " " && !event.altKey) {
      event.preventDefault();
      typeAhead(key);
      return;
    }

    if (!open) {
      if (key === "Enter" || key === " " || key === "ArrowDown" || key === "ArrowUp") {
        event.preventDefault();
        openList();
      } else if (key === "Home") {
        event.preventDefault();
        openList(seek(0, 1));
      } else if (key === "End") {
        event.preventDefault();
        openList(seek(items.length - 1, -1));
      }
      return;
    }

    switch (key) {
      case "ArrowDown":
        event.preventDefault();
        if (!event.altKey) highlight(activeIndex + 1, 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        if (event.altKey) choose(activeIndex);
        else highlight(activeIndex - 1, -1);
        break;
      case "Home":
        event.preventDefault();
        highlight(0, 1);
        break;
      case "End":
        event.preventDefault();
        highlight(items.length - 1, -1);
        break;
      case "PageUp":
        event.preventDefault();
        highlight(activeIndex - 10, -1);
        break;
      case "PageDown":
        event.preventDefault();
        highlight(activeIndex + 10, 1);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        choose(activeIndex);
        break;
      case "Escape":
        // Closes the list and nothing else: inside a dialog, the same
        // key must not go on to close the dialog too.
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        break;
      case "Tab":
        // Focus moves on; the value stays as it was.
        setOpen(false);
        break;
    }
  };

  // While the list is open: keep it against the trigger as the page
  // scrolls or resizes, and close it on a press anywhere outside.
  useLayoutEffect(() => {
    const well = wellRef.current;
    const list = listRef.current;
    if (!open || !well || !list) return;

    const reposition = () => place(well, list);
    const handleScroll = (event: Event) => {
      // The list's own scrolling is not a reason to move it.
      if (event.target instanceof Node && list.contains(event.target)) return;
      reposition();
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && well.contains(event.target)) return;
      setOpen(false);
    };

    showInTopLayer(list);
    reposition();
    document.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", handleScroll, true);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", handleScroll, true);
      hideFromTopLayer(list);
    };
  }, [open]);

  // Keep the highlighted option in view in a list long enough to scroll.
  useEffect(() => {
    if (!open || activeIndex < 0) return;
    document.getElementById(`${baseId}-option-${activeIndex}`)?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex, baseId]);

  // Uncontrolled, a form's reset puts the choice back where it started.
  useEffect(() => {
    const owner = nativeRef.current?.form;
    if (!owner) return;
    const handleReset = () => setInner(defaultValue ?? firstValue);
    owner.addEventListener("reset", handleReset);
    return () => owner.removeEventListener("reset", handleReset);
  }, [defaultValue, firstValue]);

  return (
    <div
      ref={wellRef}
      className={cn("nm-well nm-select", wellClassName)}
      data-invalid={ariaInvalid === true || ariaInvalid === "true" ? "true" : undefined}
      data-open={open ? "true" : undefined}
    >
      {leading ? <span className="nm-affix">{leading}</span> : null}

      <button
        type="button"
        role="combobox"
        id={id}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && activeIndex >= 0 ? optionId(activeIndex) : undefined}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
        aria-required={required ? true : undefined}
        className={cn("nm-select-trigger", className)}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={handleKeyDown}
        onKeyUp={(event) => {
          // Space on a button clicks it on the way up; the key is
          // already handled on the way down.
          if (event.key === " ") event.preventDefault();
        }}
        onBlur={() => setOpen(false)}
      >
        {selected ? selected.label : null}
      </button>

      {trailing ? <span className="nm-affix">{trailing}</span> : null}
      <Icon name="chevron-down" size={16} className="nm-select-chevron" />

      <select
        ref={nativeRef}
        className="nm-select-native"
        tabIndex={-1}
        aria-hidden="true"
        name={name}
        form={form}
        required={required}
        disabled={disabled}
        autoComplete={autoComplete}
        value={current}
        onChange={(event) => {
          setInner(event.target.value);
          onChange?.(event);
        }}
      >
        {children}
      </select>

      <ul
        ref={listRef}
        id={listId}
        role="listbox"
        popover="manual"
        tabIndex={-1}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        className="nm-listbox"
        data-open={open ? "true" : undefined}
        // A press in the list must not take focus from the trigger.
        onMouseDown={(event) => event.preventDefault()}
      >
        {items.map((item, index) => (
          <li
            key={index}
            id={optionId(index)}
            role="option"
            aria-selected={index === selectedIndex}
            aria-disabled={item.disabled ? true : undefined}
            data-active={index === activeIndex ? "true" : undefined}
            className="nm-option"
            onPointerMove={() => {
              if (!item.disabled && index !== activeIndex) setActiveIndex(index);
            }}
            onClick={() => choose(index)}
          >
            <span className="nm-option-label">{item.label}</span>
            <Icon name="check" size={16} className="nm-option-check" />
          </li>
        ))}
      </ul>
    </div>
  );
}
