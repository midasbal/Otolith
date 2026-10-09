"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { IconButton } from "./button";
import { Icon, type IconName } from "./icons";

export type ToastTone = "info" | "success" | "danger";

type ToastInput = {
  message: ReactNode;
  tone?: ToastTone;
};

type ToastEntry = {
  id: number;
  message: ReactNode;
  tone: ToastTone;
};

const TOAST_VISIBLE_MS = 6000;

const TONE_ICON: Record<ToastTone, IconName> = {
  info: "info",
  success: "check",
  danger: "alert",
};

const ToastContext = createContext<((toast: ToastInput) => void) | null>(null);

/**
 * Hosts the toast stack and exposes useToast() to everything inside it.
 * A toast is a short confirmation of something that also stays visible
 * in the page (a transaction result keeps its own panel); it is never
 * the only place a message appears, since it leaves on its own.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(({ message, tone = "info" }: ToastInput) => {
    const id = nextId.current;
    nextId.current += 1;
    setToasts((list) => [...list, { id, message, tone }]);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="nm-toast-viewport">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onDismiss }: { toast: ToastEntry; onDismiss: (id: number) => void }) {
  // Hovering or focusing a toast holds it open: nobody should lose a
  // message because they were still reading it.
  const [held, setHeld] = useState(false);

  useEffect(() => {
    if (held) return;
    const timer = window.setTimeout(() => onDismiss(toast.id), TOAST_VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [held, toast.id, onDismiss]);

  const hold = useMemo(
    () => ({
      onMouseEnter: () => setHeld(true),
      onMouseLeave: () => setHeld(false),
      onFocus: () => setHeld(true),
      onBlur: () => setHeld(false),
    }),
    [],
  );

  return (
    <div role={toast.tone === "danger" ? "alert" : "status"} data-tone={toast.tone} className="nm-toast" {...hold}>
      <Icon name={TONE_ICON[toast.tone]} className="nm-notice-icon" />
      <div className="nm-toast-body">{toast.message}</div>
      <IconButton label="Dismiss" size="sm" onClick={() => onDismiss(toast.id)}>
        <Icon name="close" size={14} />
      </IconButton>
    </div>
  );
}

/** Returns a function that shows a toast. Needs a ToastProvider above. */
export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}
