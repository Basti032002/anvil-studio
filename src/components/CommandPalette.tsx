import { t } from "../i18n";
import { useEffect, useMemo, useRef, useState } from "react";
import { SearchIcon } from "../icons";

export type Command = {
  id: string;
  label: string;
  group: string;
  icon?: React.ReactNode;
  shortcut?: string;
  disabled?: boolean;
  run: () => void;
};

// Einfache unscharfe Suche: alle Zeichen in Reihenfolge, Treffer am Wortanfang zählen mehr
function score(text: string, query: string): number {
  if (!query) return 1;
  const t = text.toLowerCase();
  const q = query.toLowerCase();
  const at = t.indexOf(q);
  if (at >= 0) {
    // Treffer am Wortanfang (z. B. „tes“ → „testen“) deutlich bevorzugen
    const wordStart = at === 0 || t[at - 1] === " ";
    return (wordStart ? 200 : 100) - at;
  }
  let ti = 0;
  let s = 0;
  for (const ch of q) {
    const found = t.indexOf(ch, ti);
    if (found < 0) return 0;
    s += found === 0 || t[found - 1] === " " ? 3 : 1;
    ti = found + 1;
  }
  return s;
}

export default function CommandPalette({ open, onClose, commands }: { open: boolean; onClose: () => void; commands: Command[] }) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setIndex(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  const results = useMemo(
    () =>
      commands
        .filter((c) => !c.disabled)
        .map((c) => ({ c, s: score(`${c.label} ${c.group}`, query) }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s)
        .slice(0, 12)
        .map((x) => x.c),
    [commands, query],
  );

  useEffect(() => setIndex(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector(".cmd-item.active")?.scrollIntoView({ block: "nearest" });
  }, [index]);

  if (!open) return null;

  function run(c?: Command) {
    if (!c) return;
    onClose();
    setTimeout(c.run, 0);
  }

  return (
    <div className="cmd-overlay" onMouseDown={onClose}>
      <div className="cmd" role="dialog" aria-label={t("Befehlspalette")} onMouseDown={(e) => e.stopPropagation()}>
        <div className="cmd-input">
          <SearchIcon size={16} />
          <input
            ref={inputRef}
            value={query}
            placeholder={t("Befehl oder Projekt suchen …")}
            aria-label={t("Befehl suchen")}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              else if (e.key === "ArrowDown") {
                e.preventDefault();
                setIndex((i) => Math.min(results.length - 1, i + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setIndex((i) => Math.max(0, i - 1));
              } else if (e.key === "Enter") run(results[index]);
            }}
          />
          <kbd>{t("Esc")}</kbd>
        </div>
        <div className="cmd-list" ref={listRef}>
          {results.length === 0 && <div className="cmd-empty">{t("Nichts gefunden.")}</div>}
          {results.map((c, i) => (
            <button
              key={c.id}
              className={i === index ? "cmd-item active" : "cmd-item"}
              onMouseEnter={() => setIndex(i)}
              onClick={() => run(c)}
              style={{ "--i": i } as React.CSSProperties}
            >
              <span className="cmd-icon">{c.icon}</span>
              <span className="cmd-label">{c.label}</span>
              <span className="cmd-group">{c.group}</span>
              {c.shortcut && <kbd>{c.shortcut}</kbd>}
            </button>
          ))}
        </div>
        <div className="cmd-foot muted">
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd>{" "}{t("auswählen")}
          </span>
          <span>
            <kbd>↵</kbd>{" "}{t("ausführen")}
          </span>
        </div>
      </div>
    </div>
  );
}
