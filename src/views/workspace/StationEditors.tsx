import { t } from "../../i18n";
import { useState } from "react";
import { BlockDef, MachineRecipe, Project, WorkbenchRecipe } from "../../api";
import { useCatalog } from "../../catalog";
import { Segmented, Toggle } from "../../components/Chrome";
import ItemPicker, { OwnEntry, resolveItem } from "../../components/ItemPicker";
import McIcon from "../../components/McIcon";
import { CloseIcon, PlusIcon, TrashIcon } from "../../icons";

/** Ein Item-Feld als Slot (Klick öffnet die Auswahl) */
function SlotButton({ project, own, value, onPick, onClear, label, size = 34 }: { project: Project; own: OwnEntry[]; value: string; onPick: () => void; onClear: () => void; label: string; size?: number }) {
  const { catalog } = useCatalog(project.mcVersion, !!value);
  const info = resolveItem(value, catalog, own, project.modId);
  return (
    <button type="button" className={value ? "slot-btn filled" : "slot-btn"} title={value ? `${info.name}\n${value}` : label} aria-label={value ? `${label}: ${info.name}` : `${label}: ${t("leer")}`} onClick={onPick}>
      {value ? <McIcon icon={info.icon} textures={info.textures} size={size} fallback={info.name} /> : <PlusIcon size={14} />}
      {value && (
        <span
          role="button"
          className="slot-clear"
          aria-label={t("Leeren")}
          onClick={(e) => {
            e.stopPropagation();
            onClear();
          }}
        >
          <CloseIcon size={9} />
        </span>
      )}
    </button>
  );
}

const Arrow = () => (
  <svg className="craft-arrow" width="28" height="20" viewBox="0 0 28 20" aria-hidden="true">
    <path d="M2 10h22M17 3l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** Rezepte, die nur an dieser Werkbank funktionieren */
export function WorkbenchRecipes({ project, block, own, onChange }: { project: Project; block: BlockDef; own: OwnEntry[]; onChange: (patch: Partial<BlockDef>) => void }) {
  const recipes = block.workbenchRecipes ?? [];
  const [pick, setPick] = useState<{ r: number; cell: number | "result" } | null>(null);
  const set = (i: number, patch: Partial<WorkbenchRecipe>) => onChange({ workbenchRecipes: recipes.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  const add = () => onChange({ workbenchRecipes: [...recipes, { shaped: true, grid: Array(9).fill(""), result: "", count: 1 }] });

  return (
    <div className="station">
      <div className="muted small">{t("Rechtsklick öffnet ein 3×3-Raster wie bei der Werkbank. Die normalen Rezepte funktionieren dort auch, die hier angelegten nur an diesem Block.")}</div>
      {recipes.map((r, i) => {
        const grid = r.grid?.length === 9 ? r.grid : Array(9).fill("");
        return (
          <div key={i} className="station-recipe">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <Segmented
                value={r.shaped ? "shaped" : "shapeless"}
                options={[
                  { value: "shaped", label: t("Mit Form") },
                  { value: "shapeless", label: t("Ohne Form") },
                ]}
                onChange={(v) => set(i, { shaped: v === "shaped" })}
                label={t("Rezeptart")}
              />
              <button type="button" className="icon-btn danger" aria-label={t("Rezept entfernen")} data-tip={t("Rezept entfernen")} onClick={() => onChange({ workbenchRecipes: recipes.filter((_, j) => j !== i) })}>
                <TrashIcon size={14} />
              </button>
            </div>
            <div className="recipe-body">
              <div className="craft-grid">
                {grid.map((id, c) => (
                  <SlotButton
                    key={c}
                    project={project}
                    own={own}
                    value={id}
                    label={t("Feld {v0}", { v0: c + 1 })}
                    onPick={() => setPick({ r: i, cell: c })}
                    onClear={() => set(i, { grid: grid.map((g, k) => (k === c ? "" : g)) })}
                  />
                ))}
              </div>
              <div className="craft-result">
                <Arrow />
                <div className="result-slot-wrap">
                  <SlotButton project={project} own={own} value={r.result} size={40} label={t("Ergebnis")} onPick={() => setPick({ r: i, cell: "result" })} onClear={() => set(i, { result: "" })} />
                  {r.count > 1 && <span className="result-count">{r.count}</span>}
                </div>
              </div>
              <div className="recipe-options">
                <label className="field">
                  <span className="field-label">{t("Anzahl")}</span>
                  <input className="input" type="number" min={1} max={64} value={r.count} onChange={(e) => set(i, { count: Math.max(1, Math.min(64, Number(e.target.value) || 1)) })} />
                </label>
              </div>
            </div>
            {!r.result && <div className="muted small">{t("Wähle rechts, was herauskommt.")}</div>}
          </div>
        );
      })}
      <button type="button" className="btn" onClick={add}>
        <PlusIcon size={14} /> {t("Rezept hinzufügen")}
      </button>
      {pick && (
        <ItemPicker
          mcVersion={project.mcVersion}
          modId={project.modId}
          own={own}
          onClose={() => setPick(null)}
          onPick={(id) => {
            const r = recipes[pick.r];
            if (pick.cell === "result") set(pick.r, { result: id.startsWith("#") ? r.result : id });
            else {
              const grid = r.grid?.length === 9 ? [...r.grid] : Array(9).fill("");
              grid[pick.cell] = id;
              set(pick.r, { grid });
            }
            setPick(null);
          }}
        />
      )}
    </div>
  );
}

/** Maschine: Eingabe → Ausgabe über eine Dauer, wahlweise mit Brennstoff */
export function MachineEditor({ project, block, own, onChange }: { project: Project; block: BlockDef; own: OwnEntry[]; onChange: (patch: Partial<BlockDef>) => void }) {
  const machine = block.machine ?? { fuel: true, recipes: [] };
  const recipes = machine.recipes;
  const [pick, setPick] = useState<{ r: number; field: "input" | "output" } | null>(null);
  const setMachine = (patch: Partial<typeof machine>) => onChange({ machine: { ...machine, ...patch } });
  const set = (i: number, patch: Partial<MachineRecipe>) => setMachine({ recipes: recipes.map((r, j) => (j === i ? { ...r, ...patch } : r)) });

  return (
    <div className="station">
      <div className="muted small">{t("Rechtsklick öffnet eine Ofen-Oberfläche: oben die Eingabe, unten der Brennstoff, rechts das Ergebnis. Ein Pfeil zeigt den Fortschritt.")}</div>
      <Toggle label={t("Braucht Brennstoff (Kohle, Holz …)")} checked={machine.fuel} onChange={(v) => setMachine({ fuel: v })} />
      {!machine.fuel && <div className="muted small">{t("Ohne Brennstoff arbeitet die Maschine von selbst, sobald etwas Passendes in der Eingabe liegt.")}</div>}
      {recipes.map((r, i) => (
        <div key={i} className="station-recipe">
          <div className="recipe-body machine-row">
            <div className="result-slot-wrap">
              <SlotButton project={project} own={own} value={r.input} label={t("Eingabe")} onPick={() => setPick({ r: i, field: "input" })} onClear={() => set(i, { input: "" })} />
              {r.inputCount > 1 && <span className="result-count">{r.inputCount}</span>}
            </div>
            <Arrow />
            <div className="result-slot-wrap">
              <SlotButton project={project} own={own} value={r.output} size={40} label={t("Ergebnis")} onPick={() => setPick({ r: i, field: "output" })} onClear={() => set(i, { output: "" })} />
              {r.outputCount > 1 && <span className="result-count">{r.outputCount}</span>}
            </div>
            <div className="recipe-options machine-options">
              <label className="field">
                <span className="field-label">{t("Eingabe-Anzahl")}</span>
                <input className="input" type="number" min={1} max={64} value={r.inputCount} onChange={(e) => set(i, { inputCount: Math.max(1, Math.min(64, Number(e.target.value) || 1)) })} />
              </label>
              <label className="field">
                <span className="field-label">{t("Ergebnis-Anzahl")}</span>
                <input className="input" type="number" min={1} max={64} value={r.outputCount} onChange={(e) => set(i, { outputCount: Math.max(1, Math.min(64, Number(e.target.value) || 1)) })} />
              </label>
              <label className="field">
                <span className="field-label">{t("Dauer (Sekunden)")}</span>
                <input className="input" type="number" min={0.05} step={0.5} value={r.time / 20} onChange={(e) => set(i, { time: Math.max(1, Math.round((Number(e.target.value) || 1) * 20)) })} />
              </label>
            </div>
            <button type="button" className="icon-btn danger" aria-label={t("Rezept entfernen")} data-tip={t("Rezept entfernen")} onClick={() => setMachine({ recipes: recipes.filter((_, j) => j !== i) })}>
              <TrashIcon size={14} />
            </button>
          </div>
        </div>
      ))}
      <button type="button" className="btn" onClick={() => setMachine({ recipes: [...recipes, { input: "", inputCount: 1, output: "", outputCount: 1, time: 200 }] })}>
        <PlusIcon size={14} /> {t("Rezept hinzufügen")}
      </button>
      {pick && (
        <ItemPicker
          mcVersion={project.mcVersion}
          modId={project.modId}
          own={own}
          onClose={() => setPick(null)}
          onPick={(id) => {
            if (pick.field === "output" && id.startsWith("#")) return;
            set(pick.r, { [pick.field]: id } as Partial<MachineRecipe>);
            setPick(null);
          }}
        />
      )}
    </div>
  );
}
