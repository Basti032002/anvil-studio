import { t } from "../../i18n";
import { NamesField } from "./LogicEditors";
import { useState } from "react";
import { contentApi, mcEntityTexture, MobDef, MobModel, Project } from "../../api";
import { Toggle } from "../../components/Chrome";
import { OwnEntry } from "../../components/ItemPicker";
import { confirmDialog } from "../../components/Overlay";
import { CopyIcon, GlobeIcon, HeartIcon, ImageIcon, PawIcon, SaveIcon, SkullIcon, SparkIcon, TrashIcon } from "../../icons";
import { toast } from "../../state";
import { Field, ItemField } from "./ContentForms";
import { BIOMES, eggDataUrl, MOB_MODELS } from "./contentDefaults";
import PixelEditor from "./PixelEditor";

function Num({ value, onChange, min, max, step = 1 }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number }) {
  return <input className="input" type="number" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />;
}

/** Vanilla-Textur laden, mit der Ei-Farbe einfärben und als Startpunkt speichern. */
async function applyVanillaTexture(project: Project, mob: MobDef): Promise<boolean> {
  const b64 = await mcEntityTexture(project.mcVersion, mob.model);
  if (!b64) return false;
  const img = new Image();
  await new Promise((res, rej) => {
    img.onload = res;
    img.onerror = rej;
    img.src = `data:image/png;base64,${b64}`;
  });
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext("2d")!;
  g.drawImage(img, 0, 0);
  const data = g.getImageData(0, 0, c.width, c.height);
  const n = parseInt(mob.eggPrimary.replace("#", ""), 16) || 0x888888;
  const tint = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  for (let i = 0; i < data.data.length; i += 4) {
    for (let k = 0; k < 3; k++) {
      const v = data.data[i + k];
      data.data[i + k] = Math.round(v * 0.55 + ((v * tint[k]) / 255) * 0.45 + tint[k] * 0.08);
    }
  }
  g.putImageData(data, 0, 0);
  await contentApi.textureSave(project.id, "entity", mob.id, c.toDataURL("image/png"));
  return true;
}

export default function MobEditor({
  project,
  mob,
  own,
  saved,
  busy,
  onChange,
  onSave,
  onDuplicate,
  onRemove,
}: {
  project: Project;
  mob: MobDef;
  own: OwnEntry[];
  saved: boolean;
  busy: boolean;
  onChange: (patch: Partial<MobDef>) => void;
  onSave: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const [reload, setReload] = useState(0);
  const [loadingTex, setLoadingTex] = useState(false);
  const model = MOB_MODELS.find((m) => m.id === mob.model) ?? MOB_MODELS[0];

  async function vanilla() {
    if (!(await confirmDialog(t("Minecraft-Textur übernehmen?"), t("Die Textur von „{label}“ wird aus Minecraft {mcVersion} geladen, in deiner Ei-Farbe eingefärbt und ersetzt die aktuelle Textur.", { label: model.label, mcVersion: project.mcVersion }), t("Übernehmen"), t("Abbrechen"))))
      return;
    setLoadingTex(true);
    try {
      const ok = await applyVanillaTexture(project, mob);
      if (ok) {
        setReload((r) => r + 1);
        toast(t("Textur übernommen."), "success");
      } else toast(t("In dieser Minecraft-Version wurde keine passende Textur gefunden."), "error");
    } catch (e) {
      toast(String(e), "error");
    } finally {
      setLoadingTex(false);
    }
  }

  return (
    <div className="editor-grid">
      <div className="panel form-panel">
        <div className="panel-head">
          <div className="row">
            <img className="egg-icon lg" src={eggDataUrl(mob.eggPrimary, mob.eggSecondary)} alt="" />
            <div className="panel-title-lg">{t("Kreatur")}</div>
          </div>
          <div className="row gap-6">
            <button className="icon-btn" onClick={onDuplicate} aria-label={t("Duplizieren")} data-tip={t("Duplizieren")}>
              <CopyIcon size={15} />
            </button>
            <button className="icon-btn danger" onClick={onRemove} aria-label={t("Entfernen")} data-tip={t("Entfernen")}>
              <TrashIcon size={15} />
            </button>
          </div>
        </div>

        <div className="form-grid">
          <Field label={t("ID")} hint={t("Kleinbuchstaben, _")}>
            <input className="input mono" value={mob.id} onChange={(e) => onChange({ id: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })} />
          </Field>
          <Field label={t("Vollständige ID")}>
            <input className="input mono" readOnly value={`${project.modId}:${mob.id}`} />
          </Field>
          <Field label={t("Name (Deutsch)")}>
            <input className="input" value={mob.nameDe} onChange={(e) => onChange({ nameDe: e.target.value })} />
          </Field>
          <Field label={t("Name (Englisch)")}>
            <input className="input" value={mob.nameEn} onChange={(e) => onChange({ nameEn: e.target.value })} />
          </Field>
          <NamesField names={mob.names ?? {}} onChange={(names) => onChange({ names })} />

          <div className="field span-2">
            <span className="field-label">{t("Körper & Verhalten wie")}</span>
            <div className="mob-models">
              {MOB_MODELS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={mob.model === m.id ? "kind-card active" : "kind-card"}
                  aria-pressed={mob.model === m.id}
                  onClick={() =>
                    mob.model !== m.id &&
                    onChange({ model: m.id as MobModel, health: m.health, speed: m.speed, attackDamage: m.attack, weight: m.hostile ? 60 : 8, biomes: m.hostile ? "overworld" : mob.biomes })
                  }
                >
                  {m.hostile ? <SkullIcon size={16} /> : <PawIcon size={16} />}
                  <span>{m.label}</span>
                </button>
              ))}
            </div>
            <span className="muted small">
              {model.hostile ? t("Feindlich: greift Spieler an und erscheint im Dunkeln.") : t("Friedlich: läuft herum, lässt sich mit dem passenden Futter anlocken und vermehren.")}
            </span>
          </div>

          <Field label={t("Leben · {v0} Herzen", { v0: mob.health / 2 })}>
            <input type="range" className="range full" min={1} max={100} value={mob.health} onChange={(e) => onChange({ health: Number(e.target.value) })} />
          </Field>
          <Field label={t("Tempo")} hint={t("Kuh 0,2 · Spinne 0,3")}>
            <Num value={mob.speed} min={0.05} max={1} step={0.01} onChange={(v) => onChange({ speed: v })} />
          </Field>
          {model.hostile && (
            <Field label={t("Angriffsschaden")} hint={t("Zombie 3")}>
              <Num value={mob.attackDamage} min={0} max={100} step={0.5} onChange={(v) => onChange({ attackDamage: v })} />
            </Field>
          )}
          <div className="field">
            <span className="field-label">{t("Spawn-Ei")}</span>
            <div className="row gap-6">
              <input type="color" className="color-input" value={mob.eggPrimary} onChange={(e) => onChange({ eggPrimary: e.target.value })} aria-label={t("Grundfarbe")} />
              <input type="color" className="color-input" value={mob.eggSecondary} onChange={(e) => onChange({ eggSecondary: e.target.value })} aria-label={t("Fleckenfarbe")} />
              <img className="egg-icon" src={eggDataUrl(mob.eggPrimary, mob.eggSecondary)} alt="" />
            </div>
          </div>
        </div>

        <div className="sub-section">
          <div className="sub-head">
            <span className="sub-icon">
              <GlobeIcon size={16} />
            </span>
            <div className="grow">
              <div className="panel-title-lg">{t("Natürliches Spawnen")}</div>
              <div className="muted small">{t("Erscheint von selbst in der Welt")}</div>
            </div>
            <Toggle label={t("Spawnen")} checked={mob.spawn} onChange={(v) => onChange({ spawn: v })} />
          </div>
          {mob.spawn && (
            <div className="form-grid">
              <Field label={t("Wo")} span>
                <select className="input" value={mob.biomes} onChange={(e) => onChange({ biomes: e.target.value })}>
                  {BIOMES.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t("Häufigkeit")} hint={t("Kuh 8 · Zombie 95")}>
                <Num value={mob.weight} min={1} max={200} onChange={(v) => onChange({ weight: v })} />
              </Field>
              <div className="field">
                <span className="field-label">{t("Gruppengröße")}</span>
                <div className="row gap-6">
                  <Num value={mob.groupMin} min={1} max={16} onChange={(v) => onChange({ groupMin: v })} />
                  <span className="muted">–</span>
                  <Num value={mob.groupMax} min={1} max={16} onChange={(v) => onChange({ groupMax: v })} />
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="sub-section">
          <div className="sub-head">
            <span className="sub-icon">
              <HeartIcon size={16} />
            </span>
            <div className="grow">
              <div className="panel-title-lg">{t("Beute")}</div>
              <div className="muted small">{t("Was die Kreatur beim Tod fallen lässt (Plünderung erhöht)")}</div>
            </div>
          </div>
          <div className="form-grid">
            <Field label={t("Item")} span>
              <ItemField project={project} own={own} value={mob.drop} onChange={(v) => onChange({ drop: v })} placeholder={t("Keine Beute")} />
            </Field>
            {mob.drop && (
              <>
                <Field label={t("Anzahl min.")}>
                  <Num value={mob.dropMin} min={0} max={64} onChange={(v) => onChange({ dropMin: v })} />
                </Field>
                <Field label={t("Anzahl max.")}>
                  <Num value={mob.dropMax} min={0} max={64} onChange={(v) => onChange({ dropMax: v })} />
                </Field>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="panel texture-panel">
        <div className="panel-title-lg">{t("Textur")}</div>
        {saved ? (
          <>
            <PixelEditor projectId={project.id} kind="entity" id={mob.id} reload={reload} />
            <button className={loadingTex ? "btn small loading" : "btn small"} onClick={vanilla} disabled={loadingTex}>
              <ImageIcon size={14} />{" "}{t("Minecraft-Textur als Vorlage")}
            </button>
            <p className="muted small">
              {t("Die Textur nutzt den Aufbau der {model}-Textur aus Minecraft. Mit der Vorlage siehst du sofort, welcher Bereich zu welchem Körperteil gehört.", { model: model.label })}
            </p>
          </>
        ) : (
          <div className="texture-wait">
            <SparkIcon size={20} />
            <p className="muted small">{t("Speichere zuerst, dann kannst du die Textur malen.")}</p>
            <button className="btn small primary" onClick={onSave} disabled={busy}>
              <SaveIcon size={14} />{" "}{t("Jetzt speichern")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
