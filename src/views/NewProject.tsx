import { t, translateMessage } from "../i18n";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";
import { api, pickFolder, Project } from "../api";
import { CheckIcon, CloseIcon, FolderIcon, PlusIcon } from "../icons";

type Props = { onCancel: () => void; onCreated: (p: Project) => void };

function slug(name: string) {
  return name
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^[0-9_]+/, "")
    .slice(0, 64);
}

function className(name: string) {
  const ascii = name.replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss");
  const out = ascii
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join("");
  return out ? (/^[0-9]/.test(out) ? `Mod${out}` : out) : "MeineMod";
}

const STEPS = [t("NeoForge-Vorlage wird heruntergeladen …"), t("Vorlage wird entpackt …"), t("Git-Repository wird angelegt …"), t("Fertig!")];

export default function NewProject({ onCancel, onCreated }: Props) {
  const [name, setName] = useState("");
  const [modId, setModId] = useState<string | null>(null);
  const [author, setAuthor] = useState(() => localStorage.getItem("anvil.author") ?? "");
  const [pkg, setPkg] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [versions, setVersions] = useState<string[]>([]);
  const [mcVersion, setMcVersion] = useState("1.21.1");
  const [parentDir, setParentDir] = useState("");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.supportedVersions().then((v) => {
      setVersions(v.versions);
      setParentDir(v.defaultDir);
    });
    const un = listen<{ step: string }>("create-progress", (e) => setStep(translateMessage(e.payload.step)));
    return () => {
      un.then((f) => f());
    };
  }, []);

  const id = modId ?? slug(name);
  const authorPart = slug(author).replace(/_/g, "") || "deinname";
  const pack = pkg ?? (id ? `de.${authorPart}.${id}` : "");
  const cls = className(name);
  const stepIndex = step ? STEPS.indexOf(step) : -1;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    localStorage.setItem("anvil.author", author);
    try {
      const p = await api.createProject({
        name,
        modId: id,
        package: pack,
        mcVersion,
        author,
        description: description || t("{name} – eine Minecraft-Mod", { name: name }),
        parentDir: parentDir || null,
      });
      onCreated(p);
    } catch (err) {
      setError(translateMessage(String(err)));
    } finally {
      setBusy(false);
      setStep(null);
    }
  }

  return (
    <form className="page new-project" onSubmit={submit} data-tour="np-form">
      <header className="page-header">
        <div>
          <div className="eyebrow">{t("Neues Projekt")}</div>
          <h1>{t("Was baust du als Nächstes?")}</h1>
        </div>
      </header>

      <div className="split-layout">
        <section className="panel form-grid">
          <Field label={t("Projektname")} id="name">
            <input id="name" className="input" required autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={t("z. B. Kristallhöhlen")} />
          </Field>
          <Field label={t("Mod-ID")} hint={t("automatisch")} id="modid">
            <input
              id="modid"
              className="input mono"
              required
              pattern="[a-z][a-z0-9_]{1,63}"
              title={t("Kleinbuchstaben, Ziffern und _, mit Buchstaben beginnen")}
              value={id}
              onChange={(e) => setModId(e.target.value)}
            />
          </Field>
          <Field label={t("Autor")} id="author">
            <input id="author" className="input" value={author} onChange={(e) => setAuthor(e.target.value)} placeholder={t("Dein Name")} />
          </Field>
          <Field label={t("Java-Paket")} hint={t("automatisch")} id="pkg">
            <input id="pkg" className="input mono" required value={pack} onChange={(e) => setPkg(e.target.value)} />
          </Field>
          <Field label={t("Minecraft-Version")} id="mcver">
            <select id="mcver" className="input" value={mcVersion} onChange={(e) => setMcVersion(e.target.value)}>
              {versions.map((v) => (
                <option key={v} value={v}>
                  {v}
                  {v === "1.21.1" ? t(" · empfohlen") : t(" · experimentell")}
                </option>
              ))}
            </select>
            {mcVersion !== "1.21.1" && (
              <div className="small warn-text mcver-note">{t("Experimentell: wird automatisch getestet, aber noch nicht im Spiel ausprobiert. Für deine erste Mod ist 1.21.1 die sichere Wahl.")}</div>
            )}
          </Field>
          <Field label={t("Mod-Loader")} id="loader">
            <select id="loader" className="input" value="neoforge" disabled>
              <option value="neoforge">{t("NeoForge")}</option>
            </select>
          </Field>
          <div className="span-2">
            <Field label={t("Beschreibung")} id="desc">
              <input id="desc" className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("Worum geht es in deiner Mod?")} />
            </Field>
          </div>
          <div className="span-2">
            <Field label={t("Speicherort")} id="dir">
              <div className="input-row">
                <input id="dir" className="input mono" value={parentDir} onChange={(e) => setParentDir(e.target.value)} />
                <button
                  type="button"
                  className="btn"
                  onClick={async () => {
                    const d = await pickFolder(t("Ordner für das neue Projekt wählen"), parentDir);
                    if (d) setParentDir(d);
                  }}
                >
                  <FolderIcon size={15} />{" "}{t("Durchsuchen …")}
                </button>
              </div>
            </Field>
            <p className="muted small">
              {t("Das Projekt landet in")}{" "}<span className="mono">{(parentDir || "…").replace(/[\\/]+$/, "")}{parentDir.includes("\\") ? "\\" : "/"}{id || "mod_id"}</span>
            </p>
          </div>
        </section>

        <aside className="panel preview">
          <div className="panel-title">
            <FolderIcon size={15} />{" "}{t("Vorschau")}
          </div>
          <div className="tree mono">
            <div className="tree-root">{id || "mod_id"}/</div>
            <div style={{ "--d": 1 } as React.CSSProperties}>build.gradle</div>
            <div style={{ "--d": 1 } as React.CSSProperties}>gradle.properties</div>
            <div style={{ "--d": 1 } as React.CSSProperties}>src/main/java/</div>
            <div className="accent-text" style={{ "--d": 2 } as React.CSSProperties}>
              {(pack || "…").replace(/\./g, "/")}/
            </div>
            <div className="hl" style={{ "--d": 3 } as React.CSSProperties} key={cls}>
              {cls}.java
            </div>
            <div style={{ "--d": 3 } as React.CSSProperties}>{cls}Client.java</div>
            <div style={{ "--d": 3 } as React.CSSProperties}>Config.java</div>
            <div style={{ "--d": 1 } as React.CSSProperties}>src/main/resources/</div>
            <div style={{ "--d": 2 } as React.CSSProperties}>assets/{id || "mod_id"}/lang/</div>
          </div>
          <ul className="checklist">
            <li>
              <CheckIcon size={14} />{" "}{t("Beispiel-Block, -Item & Kreativ-Tab")}
            </li>
            <li>
              <CheckIcon size={14} />{" "}{t("Testen-Knopf mit „Direkt in Welt“")}
            </li>
            <li>
              <CheckIcon size={14} /> {t("Git-Repository")}
            </li>
          </ul>
        </aside>
      </div>

      {busy && (
        <div className="progress-steps">
          {STEPS.slice(0, 3).map((s, i) => (
            <div key={s} className={i < stepIndex ? "pstep done" : i === stepIndex ? "pstep active" : "pstep"}>
              <span className="pstep-dot">{i < stepIndex ? <CheckIcon size={11} /> : i + 1}</span>
              {s.replace(" …", "")}
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="callout error" role="alert">
          {error}
        </div>
      )}

      <div className="row end">
        <button type="button" className="btn ghost" onClick={onCancel} disabled={busy}>
          <CloseIcon size={14} />{" "}{t("Abbrechen")}
        </button>
        <button type="submit" data-tour="np-create" className={busy ? "btn primary loading" : "btn primary"} disabled={busy || !name.trim()}>
          <PlusIcon size={14} /> {busy ? t("Wird erstellt …") : t("Projekt erstellen")}
        </button>
      </div>
    </form>
  );
}

function Field({ label, hint, id, children }: { label: string; hint?: string; id: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <label htmlFor={id}>
        {label} {hint && <span className="muted normal">· {hint}</span>}
      </label>
      {children}
    </div>
  );
}
