import { t } from "../i18n";
// Eigene Dialoge und Rechtsklick-Menüs (ersetzen confirm() und das Browser-Menü).
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { ClipboardIcon, CopyIcon, ScissorsIcon, SelectAllIcon } from "../icons";

// ---- kleiner Store ---------------------------------------------------------

function store<T>(initial: T) {
  let value = initial;
  const subs = new Set<() => void>();
  return {
    get: () => value,
    set: (v: T) => {
      value = v;
      subs.forEach((f) => f());
    },
    subscribe: (f: () => void) => {
      subs.add(f);
      return () => subs.delete(f);
    },
  };
}

// ---- Dialog ----------------------------------------------------------------

export type DialogAction<V extends string> = { label: string; value: V; kind?: "primary" | "danger" | "ghost"; icon?: React.ReactNode };
type DialogState = {
  title: string;
  message?: React.ReactNode;
  icon?: React.ReactNode;
  danger?: boolean;
  actions: DialogAction<string>[];
  input?: { value: string; label?: string };
  resolve: (v: string | null) => void;
} | null;

let inputValue = "";

const dialogStore = store<DialogState>(null);

/** Zeigt einen Dialog und liefert den Wert der gewählten Aktion (oder null bei Abbruch). */
export function showDialog<V extends string>(opts: { title: string; message?: React.ReactNode; icon?: React.ReactNode; danger?: boolean; actions: DialogAction<V>[] }): Promise<V | null> {
  return new Promise((resolve) => {
    dialogStore.get()?.resolve(null);
    dialogStore.set({ ...opts, resolve: resolve as (v: string | null) => void });
  });
}

/** Abfrage eines Textes (ersetzt prompt()). */
export async function promptDialog(title: string, label: string, initial: string, okLabel: string, cancelLabel: string): Promise<string | null> {
  inputValue = initial;
  const r = await new Promise<string | null>((resolve) => {
    dialogStore.get()?.resolve(null);
    dialogStore.set({
      title,
      input: { value: initial, label },
      actions: [
        { label: cancelLabel, value: "cancel", kind: "ghost" },
        { label: okLabel, value: "ok", kind: "primary" },
      ],
      resolve,
    });
  });
  return r === "ok" ? inputValue : null;
}

/** Einfache Ja/Nein-Abfrage. */
export async function confirmDialog(title: string, message: React.ReactNode, confirmLabel: string, cancelLabel: string, danger = false): Promise<boolean> {
  const r = await showDialog({
    title,
    message,
    danger,
    actions: [
      { label: cancelLabel, value: "cancel", kind: "ghost" },
      { label: confirmLabel, value: "ok", kind: danger ? "danger" : "primary" },
    ],
  });
  return r === "ok";
}

export function DialogHost() {
  const d = useSyncExternalStore(dialogStore.subscribe, dialogStore.get);
  const close = (v: string | null) => {
    d?.resolve(v);
    dialogStore.set(null);
  };
  useEffect(() => {
    if (!d) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  if (!d) return null;
  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close(null)}>
      <div className={d.danger ? "dialog danger" : "dialog"} role="dialog" aria-modal="true" aria-labelledby="dlg-title">
        {d.icon && <div className="dialog-icon">{d.icon}</div>}
        <div className="dialog-title" id="dlg-title">
          {d.title}
        </div>
        {d.message && <div className="dialog-message">{d.message}</div>}
        {d.input && (
          <label className="field">
            {d.input.label && <span className="field-label">{d.input.label}</span>}
            <input
              className="input mono"
              autoFocus
              defaultValue={d.input.value}
              onChange={(e) => (inputValue = e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && close("ok")}
            />
          </label>
        )}
        <div className="dialog-actions">
          {d.actions.map((a, i) => (
            <button
              key={a.value}
              autoFocus={!d.input && i === d.actions.length - 1}
              className={a.kind === "danger" ? "btn danger" : a.kind === "primary" ? "btn primary" : a.kind === "ghost" ? "btn ghost" : "btn"}
              onClick={() => close(a.value)}
            >
              {a.icon} {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ---- Rechtsklick-Menü ------------------------------------------------------

export type MenuItem =
  | { label: string; icon?: React.ReactNode; onClick: () => void; danger?: boolean; disabled?: boolean; hint?: string }
  | "separator";

const menuStore = store<{ x: number; y: number; items: MenuItem[] } | null>(null);

/** Öffnet ein Rechtsklick-Menü an der Mausposition. */
export function openMenu(e: React.MouseEvent | MouseEvent, items: MenuItem[]) {
  e.preventDefault();
  e.stopPropagation();
  (e as MouseEvent & { __anvilMenu?: boolean }).__anvilMenu = true;
  menuStore.set({ x: e.clientX, y: e.clientY, items });
}

/** Props für ein Element mit eigenem Rechtsklick-Menü. */
export const contextMenu = (items: () => MenuItem[]) => ({ onContextMenu: (e: React.MouseEvent) => openMenu(e, items()) });

export function ContextMenuHost({ editLabels }: { editLabels: { cut: string; copy: string; paste: string; selectAll: string } }) {
  const m = useSyncExternalStore(menuStore.subscribe, menuStore.get);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  useLayoutEffect(() => {
    if (!m || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setPos({ x: Math.min(m.x, window.innerWidth - r.width - 6), y: Math.min(m.y, window.innerHeight - r.height - 6) });
  }, [m]);

  useEffect(() => {
    // Browser-Menü überall unterdrücken; in Eingabefeldern eigenes Bearbeiten-Menü
    const onContext = (e: MouseEvent) => {
      if ((e as MouseEvent & { __anvilMenu?: boolean }).__anvilMenu || e.defaultPrevented) {
        e.preventDefault();
        return;
      }
      e.preventDefault();
      const el = e.target as HTMLElement;
      const field = el.closest("input, textarea") as HTMLInputElement | HTMLTextAreaElement | null;
      const editable = field && !field.readOnly && !field.disabled && !["range", "checkbox", "radio", "file", "color"].includes((field as HTMLInputElement).type);
      const selection = window.getSelection()?.toString() ?? "";
      if (!field && !selection) return;
      const items: MenuItem[] = [];
      if (editable) items.push({ label: editLabels.cut, icon: <ScissorsIcon size={15} />, hint: t("Strg X"), onClick: () => document.execCommand("cut") });
      items.push({ label: editLabels.copy, icon: <CopyIcon size={15} />, hint: t("Strg C"), onClick: () => document.execCommand("copy") });
      if (editable)
        items.push({
          label: editLabels.paste,
          icon: <ClipboardIcon size={15} />,
          hint: t("Strg V"),
          onClick: async () => {
            field!.focus();
            try {
              const text = await navigator.clipboard.readText();
              document.execCommand("insertText", false, text);
            } catch {
              /* Zwischenablage nicht erlaubt */
            }
          },
        });
      if (field) {
        items.push("separator");
        items.push({ label: editLabels.selectAll, icon: <SelectAllIcon size={15} />, hint: t("Strg A"), onClick: () => (field.focus(), field.select()) });
      }
      menuStore.set({ x: e.clientX, y: e.clientY, items });
    };
    // Browser-Tastenkürzel abschalten (Neu laden, Drucken, Quelltext, Suchen …)
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      const ctrl = e.ctrlKey || e.metaKey;
      if (e.key === "F5" || e.key === "F7" || e.key === "F3" || (ctrl && ["r", "p", "u", "f", "g", "j", "h", "+", "-", "="].includes(k) && !e.altKey) || (ctrl && e.shiftKey && ["i", "c", "r"].includes(k))) {
        if (!(ctrl && k === "f" && (e.target as HTMLElement).closest(".monaco-editor"))) e.preventDefault();
      }
      if (e.key === "Escape") menuStore.set(null);
    };
    const close = () => menuStore.set(null);
    window.addEventListener("contextmenu", onContext);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("blur", close);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("contextmenu", onContext);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("blur", close);
      window.removeEventListener("resize", close);
    };
  }, [editLabels]);

  if (!m) return null;
  return createPortal(
    <div className="ctx-backdrop" onMouseDown={() => menuStore.set(null)} onContextMenu={(e) => (e.preventDefault(), menuStore.set(null))}>
      <div ref={ref} className="ctx-menu" role="menu" style={{ left: pos.x || m.x, top: pos.y || m.y }} onMouseDown={(e) => e.stopPropagation()}>
        {m.items.map((it, i) =>
          it === "separator" ? (
            <div key={i} className="ctx-sep" />
          ) : (
            <button
              key={i}
              role="menuitem"
              className={it.danger ? "ctx-item danger" : "ctx-item"}
              disabled={it.disabled}
              onClick={() => {
                menuStore.set(null);
                it.onClick();
              }}
            >
              <span className="ctx-icon">{it.icon}</span>
              <span className="ctx-label">{it.label}</span>
              {it.hint && <span className="ctx-hint">{it.hint}</span>}
            </button>
          ),
        )}
      </div>
    </div>,
    document.body,
  );
}
