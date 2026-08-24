import { lazy, Suspense, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "@phosphor-icons/react";

const EmojiKeyboardClient = lazy(() => import("./emoji-keyboard.client"));

export function EmojiKeyboard({ onSelect, onClose }: { onSelect: (emoji: string) => void; onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);

  return createPortal(
    <div
      className="emoji-keyboard-backdrop"
      onPointerDown={(event) => {
        event.stopPropagation();
        if (event.target === event.currentTarget) onClose();
      }}
      onClick={(event) => event.stopPropagation()}
    >
      <div ref={dialogRef} className="emoji-keyboard" role="dialog" aria-modal="true" aria-label="Emoji keyboard" tabIndex={-1}>
        <header><strong>Choose an emoji</strong><button type="button" className="icon-button" onClick={onClose} aria-label="Close emoji keyboard"><X size={18} /></button></header>
        <Suspense fallback={<div className="emoji-keyboard-loading">Loading emoji…</div>}><EmojiKeyboardClient onSelect={onSelect} /></Suspense>
      </div>
    </div>,
    document.body,
  );
}
