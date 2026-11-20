import { t } from "../i18n";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Catalog, McIconDef } from "../api";
import { COMMON_TAGS, useCatalog } from "../catalog";
import { CheckIcon, CloseIcon, SearchIcon } from "../icons";
import McIcon from "./McIcon";
import { shapeIcon } from "../views/workspace/contentDefaults";

export type OwnEntry = { id: string; name: string; kind: "block" | "item"; texture?: string; shape?: "block" | "deepslate" | "stairs" | "slab" | "wall" | "fence" };
type Cat = "all" | "block" | "item" | "own" | "tags";

export type Resolved = { name: string; icon?: McIconDef; textures?: Record<string, string> };

/** Name und Symbol für eine Item-ID (Vanilla, eigene Inhalte oder Tag). */
export function resolveItem(id: string, catalog: Catalog | undefined, own: OwnEntry[], modId: string): Resolved {
  if (!id) return { name: "" };
  const mine = own.find((o) => `${modId}:${o.id}` === id);
  if (mine) {
    const key = `own:${mine.id}`;
    const textures = mine.texture ? { [key]: mine.texture } : undefined;
    const icon: McIconDef = mine.kind === "block" ? shapeIcon(mine.shape ?? "block", key) : { kind: "flat", tex: key };
    return { name: mine.name || mine.id, icon, textures };
  }
  const tag = COMMON_TAGS.find((t) => t.id === id);
  if (tag) {
    const e = catalog?.entries.find((x) => x.id === tag.icon);
    return { name: tag.name, icon: e?.icon, textures: catalog?.textures };
  }
  const e = catalog?.entries.find((x) => x.id === id);
  if (e) return { name: e.name, icon: e.icon, textures: catalog?.textures };
  return { name: id };
}

export default function ItemPicker({
  mcVersion,
  modId,
  own,
  onPick,
  onClose,
}: {
  mcVersion: string;
  modId: string;
  own: OwnEntry[];
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const { catalog, loading, error, progress } = useCatalog(mcVersion);
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<Cat>("all");
  const [limit, setLimit] = useState(240);
  const input = useRef<HTMLInputElement>(null);

  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    input.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => setLimit(240), [query, cat]);

  const ownTextures = useMemo(() => Object.fromEntries(own.filter((o) => o.texture).map((o) => [`own:${o.id}`, o.texture!])), [own]);

  type Row = { id: string; name: string; sub: string; icon?: McIconDef; textures?: Record<string, string> };
  const rows: Row[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = (r: Row) => !q || r.name.toLowerCase().includes(q) || r.id.toLowerCase().includes(q) || r.sub.toLowerCase().includes(q);
    const ownRows: Row[] = own.map((o) => ({
      id: `${modId}:${o.id}`,
      name: o.name || o.id,
      sub: o.id,
      icon: (o.kind === "block" ? shapeIcon(o.shape ?? "block", `own:${o.id}`) : { kind: "flat", tex: `own:${o.id}` }) as McIconDef,
      textures: ownTextures,
    }));
    const tagRows: Row[] = COMMON_TAGS.map((t) => {
      const e = catalog?.entries.find((x) => x.id === t.icon);
      return { id: t.id, name: t.name, sub: t.id, icon: e?.icon, textures: catalog?.textures };
    });
    const vanilla: Row[] = (catalog?.entries ?? [])
      .filter((e) => cat === "all" || cat === e.kind)
      .map((e) => ({ id: e.id, name: e.name, sub: e.nameEn, icon: e.icon, textures: catalog?.textures }));
    const list = cat === "own" ? ownRows : cat === "tags" ? tagRows : cat === "all" ? [...ownRows, ...tagRows, ...vanilla] : vanilla;
    return list.filter(match);
  }, [catalog, own, ownTextures, query, cat, modId]);

  const cats: [Cat, string][] = [
    ["all", t("Alle")],
    ["block", t("Blöcke")],
    ["item", t("Items")],
    ["own", t("Eigene ({length})", { length: own.length })],
    ["tags", t("Tags")],
  ];

  return createPortal(
    <div className="picker-overlay" onMouseDown={onClose}>
      <div className="picker" role="dialog" aria-label={t("Item auswählen")} onMouseDown={(e) => e.stopPropagation()}>
        <div className="picker-head">
          <div className="search">
            <SearchIcon size={16} />
            <input
              ref={input}
              value={query}
              placeholder={t("Block oder Item suchen … z. B. Diamant, oak, Bretter")}
              aria-label={t("Suchen")}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && rows[0] && onPick(rows[0].id)}
            />
          </div>
          <button className="icon-btn" aria-label={t("Schließen")} onClick={onClose}>
            <CloseIcon size={13} />
          </button>
        </div>
        <div className="picker-cats" role="tablist">
          {cats.map(([k, label]) => (
            <button key={k} role="tab" aria-selected={cat === k} className={cat === k ? "picker-cat active" : "picker-cat"} onClick={() => setCat(k)}>
              {label}
            </button>
          ))}
        </div>
        <div
          className="picker-grid"
          onScroll={(e) => {
            const el = e.currentTarget;
            if (el.scrollTop + el.clientHeight > el.scrollHeight - 300) setLimit((l) => l + 240);
          }}
        >
          {loading && cat !== "own" && (
            <div className="picker-state">
              <div className="bar indeterminate">
                <span />
              </div>
              <p>{progress ?? t("Minecraft-Daten werden vorbereitet …")}</p>
              <p className="small">{t("Einmalig pro Minecraft-Version: Anvil Studio lädt den offiziellen Client von Mojang und liest daraus alle Blöcke und Items.")}</p>
            </div>
          )}
          {error && cat !== "own" && (
            <div className="picker-state">
              <p className="error-text">{error}</p>
              <p className="small">{t("Eigene Inhalte und Tags kannst du trotzdem auswählen, oder eine ID direkt eintippen und Enter drücken.")}</p>
            </div>
          )}
          {rows.slice(0, limit).map((r) => (
            <button key={r.id} className="picker-item" title={`${r.name}\n${r.id}`} onClick={() => onPick(r.id)}>
              <McIcon icon={r.icon} textures={r.textures} size={34} fallback={r.name} />
              <span className="label">{r.name}</span>
            </button>
          ))}
          {!loading && rows.length === 0 && (
            <div className="picker-state">
              <p>{t("Nichts gefunden.")}</p>
              {/^#?[a-z0-9_.-]+:[a-z0-9_./-]+$/.test(query.trim()) && (
                <button className="btn small" onClick={() => onPick(query.trim())}>
                  <CheckIcon size={14} /> {t("„{query}“ verwenden", { query: query.trim() })}
                </button>
              )}
            </div>
          )}
        </div>
        <div className="picker-foot">
          <span>
            {rows.length}{" "}{t("Treffer · Minecraft")}{" "}{mcVersion}
          </span>
          <span>
            <kbd>Enter</kbd> {t("erstes übernehmen")} · <kbd>Esc</kbd> {t("schließen")}
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
