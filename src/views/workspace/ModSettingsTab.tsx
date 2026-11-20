import { useEffect, useMemo, useState } from "react";
import { api, changeMcVersion, Content, contentApi, ModSettings, modSettingsApi, Project } from "../../api";
import { listen } from "@tauri-apps/api/event";
import { confirmDialog, showDialog } from "../../components/Overlay";
import { useRunning } from "../../store";
import { OwnEntry } from "../../components/ItemPicker";
import McIcon from "../../components/McIcon";
import { ImageIcon, InfoIcon, SaveIcon, SwapIcon, TagIcon, TrashIcon, UploadIcon, UserIcon } from "../../icons";
import { toast } from "../../state";
import { Field } from "./ContentForms";
import { shapeIcon, variantIds } from "./contentDefaults";

export default function ModSettingsTab({ project, onSaved }: { project: Project; onSaved?: () => void }) {
  const [s, setS] = useState<ModSettings | null>(null);
  const [saved, setSaved] = useState("");
  const [busy, setBusy] = useState(false);
  const [content, setContent] = useState<Content | null>(null);
  const [textures, setTextures] = useState<Record<string, string>>({});

  useEffect(() => {
    modSettingsApi
      .get(project.id)
      .then((v) => {
        setS(v);
        setSaved(JSON.stringify(v));
      })
      .catch((e) => toast(String(e), "error"));
    contentApi
      .load(project.id)
      .then(async (c) => {
        setContent(c);
        const all = await Promise.all([
          ...c.blocks.map(async (b) => [b.id, await contentApi.textureGet(project.id, "block", b.id).catch(() => null)] as const),
          ...c.items.map(async (i) => [i.id, await contentApi.textureGet(project.id, "item", i.id).catch(() => null)] as const),
        ]);
        setTextures(Object.fromEntries(all.filter(([, b]) => b).map(([id, b]) => [id, `data:image/png;base64,${b}`])));
      })
      .catch(() => {});
  }, [project.id]);

  const own: OwnEntry[] = useMemo(
    () =>
      content
        ? [
            ...content.blocks.flatMap((b) => variantIds(b).map((v) => ({ id: v.id, name: v.name, kind: "block" as const, texture: textures[b.id], shape: v.shape }))),
            ...content.items.map((i) => ({ id: i.id, name: i.nameDe || i.nameEn || i.id, kind: "item" as const, texture: textures[i.id] })),
          ]
        : [],
    [content, textures],
  );

  if (!s) return <div className="content-loading muted">Lade Einstellungen …</div>;
  const dirty = JSON.stringify(s) !== saved;
  const set = (patch: Partial<ModSettings>) => setS({ ...s, ...patch });

  async function save() {
    if (!s) return;
    setBusy(true);
    try {
      await modSettingsApi.save(project.id, s);
      const fresh = await modSettingsApi.get(project.id);
      setS(fresh);
      setSaved(JSON.stringify(fresh));
      toast("Mod-Einstellungen gespeichert.", "success");
      onSaved?.();
    } catch (e) {
      toast(String(e), "error");
    } finally {
      setBusy(false);
    }
  }

  function pickLogo(file: File) {
    if (file.type !== "image/png") return toast("Bitte eine PNG-Datei wählen.", "error");
    const r = new FileReader();
    r.onload = () => set({ logo: String(r.result).split(",")[1] ?? "" });
    r.readAsDataURL(file);
  }

  return (
    <div className="mod-settings">
      <div className="ms-grid">
        <div className="panel">
          <div className="sub-head">
            <span className="sub-icon">
              <InfoIcon size={16} />
            </span>
            <div className="grow">
              <div className="panel-title-lg">Allgemein</div>
              <div className="muted small">Steht in der Mod-Liste von Minecraft und im Dateinamen der Mod</div>
            </div>
          </div>
          <div className="form-grid">
            <Field label="Name">
              <input className="input" value={s.name} onChange={(e) => set({ name: e.target.value })} />
            </Field>
            <Field label="Version" hint="z. B. 1.0.0">
              <input className="input mono" value={s.version} onChange={(e) => set({ version: e.target.value.replace(/\s/g, "") })} />
            </Field>
            <Field label="Autor(en)" hint="mit Komma trennen">
              <input className="input" value={s.authors} onChange={(e) => set({ authors: e.target.value })} />
            </Field>
            <Field label="Lizenz" hint="z. B. MIT, All Rights Reserved">
              <input className="input" value={s.license} onChange={(e) => set({ license: e.target.value })} />
            </Field>
            <Field label="Beschreibung" span>
              <textarea className="input textarea" rows={4} value={s.description} onChange={(e) => set({ description: e.target.value })} />
            </Field>
            <Field label="Mod-ID" hint="fest, wird überall verwendet">
              <input className="input mono" readOnly value={project.modId} />
            </Field>
            <Field label="Loader">
              <input className="input mono" readOnly value="NeoForge" />
            </Field>
          </div>
        </div>

        <div className="ms-side">
          <VersionPanel project={project} onChanged={onSaved} />

          <div className="panel">
            <div className="sub-head">
              <span className="sub-icon">
                <ImageIcon size={16} />
              </span>
              <div className="grow">
                <div className="panel-title-lg">Logo</div>
                <div className="muted small">Erscheint im Menü „Mods“ (PNG, am besten quadratisch)</div>
              </div>
            </div>
            <div className="logo-row">
              <div className="logo-box">{s.logo ? <img src={`data:image/png;base64,${s.logo}`} alt="Logo" /> : <ImageIcon size={26} />}</div>
              <div className="col gap-6">
                <label className="btn small">
                  <UploadIcon size={13} /> PNG wählen …
                  <input type="file" accept="image/png" hidden onChange={(e) => e.target.files?.[0] && pickLogo(e.target.files[0])} />
                </label>
                {s.logo && (
                  <button className="btn small ghost" onClick={() => set({ logo: "" })}>
                    <TrashIcon size={13} /> Entfernen
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="sub-head">
              <span className="sub-icon">
                <TagIcon size={16} />
              </span>
              <div className="grow">
                <div className="panel-title-lg">Kreativ-Tab</div>
                <div className="muted small">Eigener Reiter im Kreativ-Inventar</div>
              </div>
            </div>
            <div className="form-grid one">
              <Field label="Name" hint="leer = Mod-Name">
                <input className="input" value={s.tabName} placeholder={s.name} onChange={(e) => set({ tabName: e.target.value })} />
              </Field>
              <div className="field">
                <span className="field-label">Symbol</span>
                <div className="tab-icons">
                  <button type="button" className={s.tabIcon === "" ? "tab-icon-btn active" : "tab-icon-btn"} onClick={() => set({ tabIcon: "" })} data-tip="Automatisch">
                    <span className="muted small">Auto</span>
                  </button>
                  {own.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      className={s.tabIcon === o.id ? "tab-icon-btn active" : "tab-icon-btn"}
                      onClick={() => set({ tabIcon: o.id })}
                      aria-label={o.name}
                      data-tip={o.name}
                    >
                      <McIcon
                        icon={o.kind === "block" ? shapeIcon(o.shape ?? "block", `own:${o.id}`) : { kind: "flat", tex: `own:${o.id}` }}
                        textures={o.texture ? { [`own:${o.id}`]: o.texture } : undefined}
                        size={28}
                        fallback={o.name}
                      />
                    </button>
                  ))}
                </div>
                {own.length === 0 && <span className="muted small">Lege unter „Inhalte“ Blöcke oder Items an, um ein Symbol zu wählen.</span>}
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="ms-footer">
        <span className="muted small">
          <UserIcon size={12} /> Wird in gradle.properties und neoforge.mods.toml gespeichert.
        </span>
        <button className={busy ? "btn primary loading" : "btn primary"} disabled={!dirty || busy} onClick={save}>
          <SaveIcon size={14} /> {dirty ? "Speichern" : "Gespeichert"}
        </button>
      </div>
    </div>
  );
}

function VersionPanel({ project, onChanged }: { project: Project; onChanged?: () => void }) {
  const [versions, setVersions] = useState<string[]>([]);
  const [target, setTarget] = useState(project.mcVersion);
  const [step, setStep] = useState<string | null>(null);
  const running = useRunning(project.id);

  useEffect(() => {
    api.supportedVersions().then((v) => setVersions(v.versions)).catch(() => {});
  }, []);
  useEffect(() => setTarget(project.mcVersion), [project.mcVersion]);

  async function change() {
    const ok = await confirmDialog(
      `Auf Minecraft ${target} umstellen?`,
      "Die Gradle-Dateien werden durch die NeoForge-Vorlage der neuen Version ersetzt (mit Sicherung). Dein Code, Texturen und Inhalte bleiben erhalten; Blöcke und Items werden neu erzeugt.",
      "Umstellen",
      "Abbrechen",
    );
    if (!ok) return;
    const un = await listen<{ step: string }>("create-progress", (e) => setStep(e.payload.step));
    setStep("…");
    try {
      const notes = await changeMcVersion(project.id, target);
      onChanged?.();
      await showDialog({
        title: `Jetzt Minecraft ${target}`,
        icon: <SwapIcon size={20} />,
        message: (
          <ul className="dialog-list">
            {notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        ),
        actions: [{ label: "OK", value: "ok", kind: "primary" }],
      });
    } catch (e) {
      toast(String(e), "error");
    } finally {
      un();
      setStep(null);
    }
  }

  return (
    <div className="panel">
      <div className="sub-head">
        <span className="sub-icon">
          <SwapIcon size={16} />
        </span>
        <div className="grow">
          <div className="panel-title-lg">Minecraft-Version</div>
          <div className="muted small">Projekt auf eine andere Version umstellen</div>
        </div>
      </div>
      <div className="row">
        <select className="input grow" value={target} onChange={(e) => setTarget(e.target.value)} disabled={!!step}>
          {versions.map((v) => (
            <option key={v} value={v}>
              Minecraft {v}
              {v === project.mcVersion ? " (aktuell)" : ""}
            </option>
          ))}
        </select>
        <button className={step ? "btn primary loading" : "btn primary"} disabled={!!step || !!running || target === project.mcVersion} onClick={change}>
          <SwapIcon size={14} /> Umstellen
        </button>
      </div>
      {step && <div className="muted small">{step}</div>}
      {running && <div className="muted small">Erst den laufenden Vorgang beenden.</div>}
    </div>
  );
}
