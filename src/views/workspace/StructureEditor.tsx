import { t } from "../../i18n";
import { useEffect, useState } from "react";
import { Content, contentApi, FoundStructure, Project, StructDef, StructPiece } from "../../api";
import { Segmented, Toggle } from "../../components/Chrome";
import { toast } from "../../state";
import { BoxIcon, CopyIcon, DownloadIcon, PlusIcon, RefreshIcon, TrashIcon } from "../../icons";
import { Field, NameFields, SubTabs } from "./ContentForms";
import { Slider } from "./DimPages";

export const newStructure = (id: string): StructDef => ({
  id,
  nameEn: "New Structure",
  nameDe: "",
  pieces: [],
  overworld: true,
  biomes: [],
  placement: "surface",
  y: 0,
  spacing: 32,
  separation: 8,
  depth: 1,
  adapt: "",
});

/** Biome der Oberwelt, in denen eine Struktur erscheinen kann */
export const STRUCT_BIOMES: { id: string; label: () => string }[] = [
  { id: "minecraft:plains", label: () => t("Ebene") },
  { id: "#minecraft:is_forest", label: () => t("Wälder") },
  { id: "#minecraft:is_taiga", label: () => t("Taiga") },
  { id: "#minecraft:is_jungle", label: () => t("Dschungel") },
  { id: "#minecraft:is_savanna", label: () => t("Savanne") },
  { id: "minecraft:desert", label: () => t("Wüste") },
  { id: "#minecraft:is_badlands", label: () => t("Tafelberge") },
  { id: "minecraft:swamp", label: () => t("Sumpf") },
  { id: "minecraft:snowy_plains", label: () => t("Verschneite Ebene") },
  { id: "#minecraft:is_mountain", label: () => t("Berge") },
  { id: "#minecraft:is_beach", label: () => t("Strände") },
  { id: "#minecraft:is_ocean", label: () => t("Ozeane") },
  { id: "#minecraft:is_river", label: () => t("Flüsse") },
];

const ago = (ms: number) => {
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return t("gerade eben");
  if (m < 60) return t("vor {n} Min.", { n: m });
  const h = Math.round(m / 60);
  if (h < 24) return t("vor {n} Std.", { n: h });
  return new Date(ms).toLocaleDateString();
};

const sizeText = (f: FoundStructure) => (f.info ? `${f.info.size[0]} × ${f.info.size[1]} × ${f.info.size[2]} · ${t("{n} Blöcke", { n: f.info.blocks })}` : (f.error ?? ""));

export default function StructureEditor({
  project,
  content,
  st,
  onChange,
  onDuplicate,
  onRemove,
}: {
  project: Project;
  content: Content;
  st: StructDef;
  onChange: (s: StructDef) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const set = (p: Partial<StructDef>) => onChange({ ...st, ...p });
  const [tab, setTab] = useState("pieces");
  const [found, setFound] = useState<FoundStructure[]>([]);
  const [imported, setImported] = useState<FoundStructure[]>([]);
  const [scanning, setScanning] = useState(false);
  const [names, setNames] = useState<Record<string, string>>({});
  const german = (content.languages ?? []).includes("de_de");
  const multi = st.pieces.length > 1;
  const partsPool = `${st.id}/teile`;

  async function scan() {
    setScanning(true);
    try {
      const [f, i] = await Promise.all([contentApi.structuresScan(project.id), contentApi.structuresImported(project.id)]);
      setFound(f);
      setImported(i);
    } catch (e) {
      toast(String(e), "error");
    } finally {
      setScanning(false);
    }
  }
  useEffect(() => {
    scan();
    const h = window.setInterval(() => document.visibilityState === "visible" && scan(), 15000);
    return () => window.clearInterval(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  async function take(f: FoundStructure) {
    const name = (names[f.file] ?? f.short).trim().toLowerCase().replace(/[^a-z0-9_/.-]/g, "_");
    try {
      await contentApi.structureImport(project.id, f.file, name);
      const i = await contentApi.structuresImported(project.id);
      setImported(i);
      if (!st.pieces.some((p) => p.template === name)) set({ pieces: [...st.pieces, { template: name, pool: st.pieces.length === 0 ? "" : partsPool, weight: 1 }] });
      toast(t("„{name}“ übernommen.", { name }), "success");
    } catch (e) {
      toast(String(e), "error");
    }
  }

  const updPiece = (i: number, p: Partial<StructPiece>) => set({ pieces: st.pieces.map((x, j) => (j === i ? { ...x, ...p } : x)) });
  const infoOf = (tpl: string) => imported.find((x) => x.short === tpl);
  const jigsawPools = [...new Set(st.pieces.flatMap((p) => infoOf(p.template)?.info?.pools ?? []).map((p) => p.replace(`${project.modId}:`, "")))];
  const poolOptions = [...new Set([partsPool, ...jigsawPools, ...st.pieces.map((p) => p.pool).filter(Boolean)])];
  const usedIn = content.dimensions.filter((d) => (d.structures ?? []).includes(`#${st.id}`));

  return (
    <div className="editor-grid">
      <div className="panel form-panel logic-panel">
        <div className="editor-head">
          <span className="logic-icon">
            <BoxIcon size={18} />
          </span>
          <div className="grow editor-head-text">
            <div className="editor-head-title">{st.nameEn || st.nameDe || st.id}</div>
            <div className="editor-head-sub mono">
              {project.modId}:{st.id} · {t("Struktur")}
            </div>
          </div>
          <button className="icon-btn" onClick={onDuplicate} aria-label={t("Duplizieren")} data-tip={t("Duplizieren")}>
            <CopyIcon size={15} />
          </button>
          <button className="icon-btn danger" onClick={onRemove} aria-label={t("Entfernen")} data-tip={t("Entfernen")}>
            <TrashIcon size={15} />
          </button>
        </div>
        <SubTabs
          value={tab}
          onChange={setTab}
          tabs={[
            ["pieces", t("Teile")],
            ["gen", t("Generierung")],
            ["general", t("Allgemein")],
          ]}
        />

        {tab === "general" && (
          <div className="form-grid">
            <Field label={t("ID")} hint={t("Kleinbuchstaben, _")}>
              <input className="input mono" value={st.id} onChange={(e) => set({ id: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })} />
            </Field>
            <Field label={t("Vollständige ID")}>
              <input className="input mono" readOnly value={`${project.modId}:${st.id}`} />
            </Field>
            <NameFields en={st.nameEn} de={st.nameDe} german={german} onEn={(v) => set({ nameEn: v })} onDe={(v) => set({ nameDe: v })} />
            <div className="muted small" style={{ gridColumn: "1 / -1" }}>
              {t("Im Spiel findest du sie mit /locate structure {id}", { id: `${project.modId}:${st.id}` })}
            </div>
          </div>
        )}

        {tab === "pieces" && (
          <>
            <div className="muted small">{t("Ein Teil ist eine im Spiel gespeicherte Struktur. Das Start-Teil wird zuerst gesetzt, weitere Teile docken über Verbundblöcke (Jigsaw) an.")}</div>
            {st.pieces.length === 0 && (
              <div className="callout">
                <DownloadIcon size={18} />
                <div className="grow muted small">{t("Noch keine Teile. Rechts siehst du alle Strukturen, die du im Testspiel gespeichert hast – klicke auf „Übernehmen“.")}</div>
              </div>
            )}
            <div className="st-pieces">
              {st.pieces.map((p, i) => {
                const inf = infoOf(p.template);
                return (
                  <div key={i} className="st-piece">
                    <div className="st-piece-main">
                      <select className="input" value={p.template} onChange={(e) => updPiece(i, { template: e.target.value })}>
                        {!imported.some((x) => x.short === p.template) && <option value={p.template}>{p.template || t("– wählen –")}</option>}
                        {imported.map((x) => (
                          <option key={x.short} value={x.short}>
                            {x.short}
                          </option>
                        ))}
                      </select>
                      <div className="muted small">{inf ? sizeText(inf) : t("Datei fehlt im Projekt – übernimm sie rechts.")}</div>
                      {inf?.info && inf.info.pools.length > 0 && (
                        <div className="muted small">
                          {t("Verbundblöcke suchen in:")} <span className="mono">{inf.info.pools.join(", ")}</span>
                        </div>
                      )}
                    </div>
                    <label className="dx-mini">
                      <span>{t("Rolle")}</span>
                      <select className="input" value={p.pool} onChange={(e) => updPiece(i, { pool: e.target.value })}>
                        <option value="">{t("Start-Teil")}</option>
                        {poolOptions.map((o) => (
                          <option key={o} value={o}>
                            {t("Anbau-Teil in {pool}", { pool: o })}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="dx-mini st-weight">
                      <span>{t("Gewicht")}</span>
                      <input className="input" type="number" min={1} max={150} value={p.weight} onChange={(e) => updPiece(i, { weight: Number(e.target.value) })} />
                    </label>
                    <button className="icon-btn danger" onClick={() => set({ pieces: st.pieces.filter((_, j) => j !== i) })} aria-label={t("Entfernen")}>
                      <TrashIcon size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
            {imported.length > 0 && (
              <div className="row">
                <button className="btn small" onClick={() => set({ pieces: [...st.pieces, { template: imported[0].short, pool: st.pieces.length === 0 ? "" : partsPool, weight: 1 }] })}>
                  <PlusIcon size={13} /> {t("Teil hinzufügen")}
                </button>
              </div>
            )}
            <div className="callout">
              <BoxIcon size={18} />
              <div className="grow small">
                <div className="callout-title">{t("Mehrteilige Strukturen")}</div>
                <div className="muted">
                  {t("Setze im Spiel Verbundblöcke (Jigsaw) an die Andockstellen. Trage als „Ziel-Pool“ ein:")} <span className="mono">{`${project.modId}:${partsPool}`}</span>.{" "}
                  {t("Name und Ziel-Name der Verbundblöcke müssen zusammenpassen (z. B. beide „{name}“).", { name: `${project.modId}:tuer` })}
                </div>
              </div>
            </div>
          </>
        )}

        {tab === "gen" && (
          <>
            <div className="dx-card">
              <div className="dx-row-between">
                <div className="dx-card-title">{t("In der Oberwelt automatisch generieren")}</div>
                <Toggle checked={st.overworld} onChange={(v) => set({ overworld: v })} label={t("In der Oberwelt automatisch generieren")} />
              </div>
              {st.overworld && (
                <>
                  <div className="muted small">{t("In welchen Biomen? Ohne Auswahl in allen.")}</div>
                  <div className="dx-chips">
                    <button className={st.biomes.length === 0 ? "dx-chip on" : "dx-chip"} onClick={() => set({ biomes: [] })}>
                      {t("Alle Biome")}
                    </button>
                    {STRUCT_BIOMES.map((b) => {
                      const on = st.biomes.includes(b.id);
                      return (
                        <button key={b.id} className={on ? "dx-chip on" : "dx-chip"} onClick={() => set({ biomes: on ? st.biomes.filter((x) => x !== b.id) : [...st.biomes, b.id] })}>
                          {b.label()}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
              <div className="muted small">
                {usedIn.length
                  ? t("Außerdem in: {dims}", { dims: usedIn.map((d) => d.nameEn || d.nameDe || d.id).join(", ") })
                  : t("Für eigene Dimensionen wählst du sie dort unter „Strukturen & Pflanzen“ aus.")}
              </div>
            </div>
            <div className="form-grid">
              <Field label={t("Platzierung")}>
                <Segmented
                  label={t("Platzierung")}
                  value={st.placement}
                  onChange={(v) => set({ placement: v, y: v === "surface" ? 0 : v === "underground" ? -20 : 160 })}
                  options={[
                    { value: "surface", label: t("Oberfläche") },
                    { value: "underground", label: t("Unterirdisch") },
                    { value: "sky", label: t("Himmel") },
                  ]}
                />
              </Field>
              <Field label={st.placement === "surface" ? t("Versatz zur Oberfläche") : t("Höhe (Y)")} hint={st.placement === "surface" ? t("negativ = tiefer im Boden") : undefined}>
                <input className="input" type="number" value={st.y} onChange={(e) => set({ y: Number(e.target.value) })} />
              </Field>
            </div>
            <div className="dx-grid2">
              <Slider
                label={t("Seltenheit")}
                value={st.spacing}
                text={t("etwa alle {n} Chunks", { n: st.spacing })}
                min={4}
                max={200}
                onChange={(v) => set({ spacing: v, separation: Math.min(st.separation, v - 1) })}
              />
              <Slider label={t("Mindestabstand")} value={Math.min(st.separation, st.spacing - 1)} text={t("{n} Chunks", { n: Math.min(st.separation, st.spacing - 1) })} min={1} max={Math.max(2, st.spacing - 1)} onChange={(v) => set({ separation: v })} />
              {multi && <Slider label={t("Anbau-Tiefe")} value={st.depth} text={t("bis zu {n} Teile hintereinander", { n: st.depth })} min={1} max={20} onChange={(v) => set({ depth: v })} />}
            </div>
            <Field label={t("Anpassung ans Gelände")}>
              <select className="input" value={st.adapt} onChange={(e) => set({ adapt: e.target.value as StructDef["adapt"] })}>
                <option value="">{t("Automatisch")}</option>
                <option value="none">{t("Keine")}</option>
                <option value="beard_thin">{t("Boden darunter auffüllen (dünn)")}</option>
                <option value="beard_box">{t("Boden darunter auffüllen (Kasten)")}</option>
                <option value="bury">{t("Einbetten (wie Antike Stätten)")}</option>
                <option value="encapsulate">{t("Komplett mit Gestein umschließen")}</option>
              </select>
            </Field>
          </>
        )}
      </div>

      <div className="panel st-found">
        <div className="dx-row-between">
          <div className="panel-title-lg">{t("Aus dem Testspiel")}</div>
          <button className={scanning ? "icon-btn spin" : "icon-btn"} onClick={scan} aria-label={t("Neu laden")} data-tip={t("Neu laden")}>
            <RefreshIcon size={14} />
          </button>
        </div>
        <ol className="st-howto muted small">
          <li>{t("Im Spiel bauen, dann /give @p structure_block")}</li>
          <li>{t("Strukturblock auf „Speichern“ stellen, Namen eingeben und Größe einstellen")}</li>
          <li>{t("„Speichern“ klicken – die Struktur erscheint hier")}</li>
        </ol>
        {found.length === 0 ? (
          <div className="muted small">{t("Noch nichts gespeichert. Starte das Spiel mit dem Play-Knopf oben.")}</div>
        ) : (
          <div className="st-list">
            {found.map((f) => {
              const already = imported.some((x) => x.short === (names[f.file] ?? f.short));
              return (
                <div key={f.file} className="st-item">
                  <div className="st-item-head">
                    <span className="mono st-name">{f.name}</span>
                    <span className="muted small">{ago(f.modified)}</span>
                  </div>
                  <div className="muted small">
                    {sizeText(f)} · {f.world}
                  </div>
                  <div className="row">
                    <input className="input mono small-input" value={names[f.file] ?? f.short} onChange={(e) => setNames({ ...names, [f.file]: e.target.value })} aria-label={t("Name im Projekt")} />
                    <button className="btn small primary" onClick={() => take(f)} disabled={!f.info}>
                      {already ? t("Aktualisieren") : t("Übernehmen")}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {imported.length > 0 && (
          <>
            <div className="dx-label">{t("Im Projekt")}</div>
            <div className="st-list">
              {imported.map((x) => (
                <div key={x.short} className="st-item compact">
                  <span className="mono">{x.short}</span>
                  <span className="muted small">{sizeText(x)}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
