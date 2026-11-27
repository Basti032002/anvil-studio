import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

/**
 * Rückgängig / Wiederholen für das ganze Projekt.
 *
 * - useUndoable(key, …) ersetzt useState für Projektdaten (Inhalte, Einstellungen …).
 *   Der Verlauf liegt pro key im Speicher und bleibt beim Tab-Wechsel erhalten,
 *   solange die geladenen Daten noch dazu passen.
 * - Editoren mit eigenem Verlauf (Texturen …) melden sich mit useUndoTarget an.
 * - Die Knöpfe oben und Strg Z / Strg Y wirken immer auf das zuletzt angemeldete Ziel.
 */

export type UndoTarget = { undo: () => void; redo: () => void; canUndo: () => boolean; canRedo: () => boolean; /** nur zuständig, solange das stimmt (z. B. zuletzt hineingeklickt) */ focused?: () => boolean };

const targets: { id: number; t: () => UndoTarget }[] = [];
const subs = new Set<() => void>();
let version = 0;
let nextId = 1;

export function notifyUndo() {
  version++;
  subs.forEach((f) => f());
}

function current(): UndoTarget | null {
  for (let i = targets.length - 1; i >= 0; i--) {
    const t = targets[i].t();
    if (!t.focused || t.focused()) return t;
  }
  return null;
}

export function undo() {
  const c = current();
  if (c?.canUndo()) c.undo();
}
export function redo() {
  const c = current();
  if (c?.canRedo()) c.redo();
}

/** Für Knöpfe: kann gerade rückgängig gemacht / wiederholt werden? */
export function useUndoState() {
  useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => version,
  );
  const c = current();
  return { canUndo: !!c?.canUndo(), canRedo: !!c?.canRedo() };
}

/** Meldet ein Rückgängig-Ziel an, solange die Komponente sichtbar ist. Das zuletzt angemeldete gewinnt. */
export function useUndoTarget(target: UndoTarget | null, active = true) {
  const ref = useRef(target);
  ref.current = target;
  useEffect(() => {
    if (!active || !ref.current) return;
    const id = nextId++;
    const fallback: UndoTarget = { undo() {}, redo() {}, canUndo: () => false, canRedo: () => false };
    targets.push({ id, t: () => ref.current ?? fallback });
    notifyUndo();
    return () => {
      const i = targets.findIndex((x) => x.id === id);
      if (i >= 0) targets.splice(i, 1);
      notifyUndo();
    };
  }, [active, !!target]);
}

type Hist = { past: unknown[]; present: unknown; future: unknown[]; last: number };
const store = new Map<string, Hist>();
const MERGE_MS = 700;
const LIMIT = 200;

const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);

type SetFn<T> = (v: T | ((prev: T) => T)) => void;

/**
 * Wie useState, aber mit Verlauf.
 * - set(…)      neuer Schritt (schnelle Folgeänderungen, z. B. Tippen oder Ziehen, werden zusammengefasst)
 * - load(v)     frisch geladene Daten; Verlauf bleibt, wenn sie zum letzten Stand passen
 * - replace(v)  Stand ersetzen ohne neuen Schritt (z. B. nach dem Speichern)
 */
/** Setzer der gerade offenen Editoren (für Plugins) */
const external = new Map<string, Set<(v: unknown) => void>>();
/** Aktueller Wert eines Verlaufs (z. B. Projektinhalt), falls geladen */
export function getPresent(key: string): unknown {
  return store.get(key)?.present ?? undefined;
}
/** Wert von außen setzen (rückgängig machbar). false = kein Editor offen */
export function setExternal(key: string, v: unknown): boolean {
  const set = external.get(key);
  if (!set || !set.size) return false;
  set.forEach((f) => f(v));
  return true;
}

export function useUndoable<T>(key: string, initial: T): [T, SetFn<T>, { load: (v: T) => void; replace: (v: T) => void }] {
  const [value, setValue] = useState<T>(initial);
  const ref = useRef<T>(initial);
  ref.current = value;
  const keyRef = useRef(key);
  keyRef.current = key;

  const hist = () => {
    let h = store.get(keyRef.current);
    if (!h) {
      h = { past: [], present: ref.current, future: [], last: 0 };
      store.set(keyRef.current, h);
    }
    return h;
  };

  const apply = (v: T) => {
    ref.current = v;
    setValue(v);
  };

  const set: SetFn<T> = useCallback((v) => {
    const prev = ref.current;
    const next = typeof v === "function" ? (v as (p: T) => T)(prev) : v;
    if (next === prev) return;
    const h = hist();
    const now = Date.now();
    if (prev != null && now - h.last > MERGE_MS) {
      h.past.push(prev);
      if (h.past.length > LIMIT) h.past.shift();
    }
    if (prev == null) h.past = [];
    h.last = now;
    h.future = [];
    h.present = next;
    apply(next);
    notifyUndo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const k = key;
    const f = (v: unknown) => set(v as T);
    if (!external.has(k)) external.set(k, new Set());
    external.get(k)!.add(f);
    return () => {
      external.get(k)?.delete(f);
    };
  }, [key, set]);

  const load = useCallback((v: T) => {
    const h = store.get(keyRef.current);
    if (h && h.present != null && same(h.present, v)) h.present = v;
    else store.set(keyRef.current, { past: [], present: v, future: [], last: 0 });
    apply(v);
    notifyUndo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const replace = useCallback((v: T) => {
    const h = hist();
    h.present = v;
    h.last = 0;
    apply(v);
    notifyUndo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useUndoTarget(
    {
      canUndo: () => (store.get(keyRef.current)?.past.length ?? 0) > 0,
      canRedo: () => (store.get(keyRef.current)?.future.length ?? 0) > 0,
      undo: () => {
        const h = hist();
        const p = h.past.pop();
        if (p === undefined) return;
        h.future.push(ref.current);
        h.present = p;
        h.last = 0;
        apply(p as T);
        notifyUndo();
      },
      redo: () => {
        const h = hist();
        const f = h.future.pop();
        if (f === undefined) return;
        h.past.push(ref.current);
        h.present = f;
        h.last = 0;
        apply(f as T);
        notifyUndo();
      },
    },
    true,
  );

  return [value, set, { load, replace }];
}

/** Strg Z / Strg Y / Strg Umschalt Z – gilt für den gerade zuständigen Bereich (Textfelder behalten ihr eigenes Rückgängig) */
export function installUndoKeys() {
  const onKey = (e: KeyboardEvent) => {
    const ctrl = e.ctrlKey || e.metaKey;
    if (!ctrl || e.altKey) return;
    const k = e.key.toLowerCase();
    const isUndo = k === "z" && !e.shiftKey;
    const isRedo = k === "y" || (k === "z" && e.shiftKey);
    if (!isUndo && !isRedo) return;
    const el = e.target as HTMLElement | null;
    const tag = el?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el?.isContentEditable || el?.closest?.(".monaco-editor")) return;
    // Browser-eigenes Rückgängig (würde z. B. das zuletzt getippte Feld zurücksetzen) verhindern
    e.preventDefault();
    if (isUndo) undo();
    else redo();
  };
  window.addEventListener("keydown", onKey, true);
  return () => window.removeEventListener("keydown", onKey, true);
}

/** Wohin zuletzt geklickt wurde – für Editoren mit eigenem Verlauf (focused) */
export let lastPointerDown: Node | null = null;
if (typeof window !== "undefined") window.addEventListener("pointerdown", (e) => (lastPointerDown = e.target as Node), true);
