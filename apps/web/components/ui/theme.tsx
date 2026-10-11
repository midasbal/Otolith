"use client";

import { useSyncExternalStore } from "react";
import { IconButton } from "./button";
import { Icon } from "./icons";
import { THEME_KEY } from "./theme-script";

export type Theme = "light" | "dark";

const THEME_EVENT = "otolith:theme";
const SYSTEM_DARK = "(prefers-color-scheme: dark)";

/** The theme in effect: the reader's choice if there is one, the system's otherwise. */
function readTheme(): Theme {
  const chosen = document.documentElement.dataset.theme;
  if (chosen === "light" || chosen === "dark") return chosen;
  return window.matchMedia(SYSTEM_DARK).matches ? "dark" : "light";
}

function subscribe(callback: () => void) {
  const system = window.matchMedia(SYSTEM_DARK);
  // Another tab changed the choice: take it up here too.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== THEME_KEY) return;
    if (event.newValue === "light" || event.newValue === "dark") document.documentElement.dataset.theme = event.newValue;
    else delete document.documentElement.dataset.theme;
    callback();
  };
  window.addEventListener(THEME_EVENT, callback);
  window.addEventListener("storage", onStorage);
  system.addEventListener("change", callback);
  return () => {
    window.removeEventListener(THEME_EVENT, callback);
    window.removeEventListener("storage", onStorage);
    system.removeEventListener("change", callback);
  };
}

/** The theme in effect, live. Light while rendering on the server. */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, readTheme, () => "light");
}

function chooseTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    window.localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Storage can be unavailable; the choice then lasts for this page only.
  }
  window.dispatchEvent(new Event(THEME_EVENT));
}

/** Switches between the light and dark themes, and remembers the choice. */
export function ThemeToggle({ className }: { className?: string }) {
  const theme = useTheme();
  const other: Theme = theme === "dark" ? "light" : "dark";
  return (
    <IconButton label={`Switch to ${other} theme`} size="sm" className={className} onClick={() => chooseTheme(other)}>
      <Icon name={theme === "dark" ? "sun" : "moon"} size={16} />
    </IconButton>
  );
}
