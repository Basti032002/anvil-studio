import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";
import { api, Project } from "../api";

type Props = { onCancel: () => void; onCreated: (p: Project) => void };

function toModId(name: string) {
  const id = name
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^[0-9_]+/, "");
  return id.slice(0, 64);
}

export default function NewProject({ onCancel, onCreated }: Props) {
  const [name, setName] = useState("");
  const [modId, setModId] = useState("");
  const [modIdTouched, setModIdTouched] = useState(false);
  const [author, setAuthor] = useState(() => localStorageGet("author") ?? "");
  const [pkg, setPkg] = useState("");
  const [pkgTouched, setPkgTouched] = useState(false);
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
    const un = listen<{ step: string }>("create-progress", (e) => setStep(e.payload.step));
    return () => {
      un.then((f) => f());
    };
  }, []);

  const effectiveModId = modIdTouched ? modId : toModId(name);
  const authorPart = toModId(author).replace(/_/g, "") || "deinname";
  const effectivePkg = pkgTouched ? pkg : effectiveModId ? `de.${authorPart}.${effectiveModId}` : "";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    localStorageSet("author", author);
    try {
      const p = await api.createProject({
        name,
        modId: effectiveModId,
        package: effectivePkg,
        mcVersion,
        author,
        description: description || `${name} – eine Minecraft-Mod`,
        parentDir: parentDir || null,
      });
      onCreated(p);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
      setStep(null);
    }
  }

  return (
    <form className="page narrow" onSubmit={submit}>
      <header>
        <button type="button" className="link" onClick={onCancel}>
          ← Zurück zu Projekte
        </button>
        <h1>Neues Mod-Projekt</h1>
      </header>

      <section className="panel form-grid">
        <Field label="Projektname" id="name">
          <input id="name" className="input" required value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Kristallhöhlen" />
        </Field>
        <Field label="Mod-ID" hint="automatisch" id="modid">
          <input
            id="modid"
            className="input mono"
            required
            pattern="[a-z][a-z0-9_]{1,63}"
            title="Kleinbuchstaben, Ziffern und _, mit Buchstaben beginnen"
            value={effectiveModId}
            onChange={(e) => {
              setModIdTouched(true);
              setModId(e.target.value);
            }}
          />
        </Field>
        <Field label="Autor" id="author">
          <input id="author" className="input" value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Dein Name" />
        </Field>
        <Field label="Java-Paket" hint="automatisch" id="pkg">
          <input
            id="pkg"
            className="input mono"
            required
            value={effectivePkg}
            onChange={(e) => {
              setPkgTouched(true);
              setPkg(e.target.value);
            }}
          />
        </Field>
        <Field label="Minecraft-Version" id="mcver">
          <select id="mcver" className="input" value={mcVersion} onChange={(e) => setMcVersion(e.target.value)}>
            {versions.map((v) => (
              <option key={v} value={v}>
                {v}
                {v === "1.21.1" ? " (empfohlen, größte Mod-Auswahl)" : ""}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Mod-Loader" id="loader">
          <select id="loader" className="input" value="neoforge" disabled>
            <option value="neoforge">NeoForge (Fabric &amp; Forge folgen)</option>
          </select>
        </Field>
        <div className="span-2">
          <Field label="Beschreibung" id="desc">
            <input id="desc" className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Worum geht es in deiner Mod?" />
          </Field>
        </div>
        <div className="span-2">
          <Field label="Speicherort" id="dir">
            <input id="dir" className="input mono" value={parentDir} onChange={(e) => setParentDir(e.target.value)} />
          </Field>
          <p className="muted small">Das Projekt landet in {parentDir || "…"}/{effectiveModId || "mod_id"}</p>
        </div>
      </section>

      <section className="panel soft">
        <div className="panel-title">Das erledigt Anvil Studio automatisch</div>
        <ul className="checklist">
          <li>Offizielle NeoForge-Vorlage (MDK) laden – mit Beispiel-Block, -Item und Kreativ-Tab</li>
          <li>Paket, Mod-ID und Klassennamen auf dein Projekt umbenennen</li>
          <li>Testen-Knopf mit „direkt in Welt laden“ einrichten</li>
          <li>Git-Repository anlegen (falls Git installiert ist)</li>
        </ul>
      </section>

      {error && (
        <div className="banner error" role="alert">
          {error}
        </div>
      )}

      <div className="row end">
        {step && <span className="muted">{step}</span>}
        <button type="button" className="btn" onClick={onCancel} disabled={busy}>
          Abbrechen
        </button>
        <button type="submit" className="btn primary" disabled={busy || !name.trim()}>
          {busy ? "Wird erstellt …" : "Projekt erstellen"}
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

function localStorageGet(key: string): string | null {
  try {
    return localStorage.getItem(`anvil.${key}`);
  } catch {
    return null;
  }
}

function localStorageSet(key: string, value: string) {
  try {
    localStorage.setItem(`anvil.${key}`, value);
  } catch {
    /* egal */
  }
}
