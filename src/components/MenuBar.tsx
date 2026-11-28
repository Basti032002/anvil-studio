import { useEffect, useRef, useState } from "react";
import { CheckIcon } from "../icons";

export type MenuItem =
  | "separator"
  | { label: string; shortcut?: string; run?: () => void; disabled?: boolean; checked?: boolean; heading?: boolean };
export type Menu = { label: string; items: MenuItem[] };

/** Menüleiste wie in einer IDE: Klick öffnet, Maus über einem anderen Menü wechselt, Esc/Klick daneben schließt */
export function MenuBar({ menus }: { menus: Menu[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const [hot, setHot] = useState(-1);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open === null) return;
    const down = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(null);
    };
    const key = (e: KeyboardEvent) => {
      const items = menus[open]?.items ?? [];
      const pickable = items.map((x, i) => (x !== "separator" && !x.heading && !x.disabled ? i : -1)).filter((i) => i >= 0);
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(null);
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (!pickable.length) return;
        const at = pickable.indexOf(hot);
        const next = e.key === "ArrowDown" ? pickable[(at + 1) % pickable.length] : pickable[(at - 1 + pickable.length) % pickable.length];
        setHot(next);
      } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        setOpen((o) => (o === null ? o : (o + (e.key === "ArrowRight" ? 1 : menus.length - 1)) % menus.length));
        setHot(-1);
      } else if (e.key === "Enter" && hot >= 0) {
        e.preventDefault();
        const it = items[hot];
        if (it !== "separator" && it.run && !it.disabled) {
          setOpen(null);
          it.run();
        }
      }
    };
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("keydown", key, true);
    return () => {
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("keydown", key, true);
    };
  }, [open, hot, menus]);

  return (
    <div className="menubar" ref={root} role="menubar">
      {menus.map((m, i) => (
        <div key={m.label} className="menubar-item">
          <button
            role="menuitem"
            aria-haspopup="menu"
            aria-expanded={open === i}
            className={open === i ? "menubar-btn open" : "menubar-btn"}
            onClick={() => {
              setOpen(open === i ? null : i);
              setHot(-1);
            }}
            onPointerEnter={() => open !== null && open !== i && (setOpen(i), setHot(-1))}
          >
            {m.label}
          </button>
          {open === i && (
            <div className="menu-pop" role="menu" aria-label={m.label}>
              {m.items.map((it, j) =>
                it === "separator" ? (
                  <div key={j} className="menu-sep" role="separator" />
                ) : it.heading ? (
                  <div key={j} className="menu-heading">
                    {it.label}
                  </div>
                ) : (
                  <button
                    key={j}
                    role={it.checked === undefined ? "menuitem" : "menuitemcheckbox"}
                    aria-checked={it.checked}
                    className={hot === j ? "menu-row hot" : "menu-row"}
                    disabled={it.disabled}
                    onPointerEnter={() => setHot(j)}
                    onClick={() => {
                      setOpen(null);
                      it.run?.();
                    }}
                  >
                    <span className="menu-check">{it.checked && <CheckIcon size={12} />}</span>
                    <span className="grow">{it.label}</span>
                    {it.shortcut && <kbd>{it.shortcut}</kbd>}
                  </button>
                ),
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
