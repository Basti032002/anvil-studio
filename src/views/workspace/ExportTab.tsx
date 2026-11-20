import { locale, t } from "../../i18n";
import { useEffect, useState } from "react";
import { api, exportApi, JarInfo, ModSettings, modSettingsApi, pickSaveFile, Project } from "../../api";
import { confirmDialog, contextMenu } from "../../components/Overlay";
import { AlertIcon, CheckIcon, DownloadIcon, ExternalIcon, FolderIcon, HammerIcon, PackageIcon, PencilIcon, SaveIcon, TrashIcon, UploadIcon } from "../../icons";
import { toast } from "../../state";

const size = (b: number) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

/** Eigene Seite zum Bauen und Weitergeben der Mod. */
export default function ExportTab({
  project,
  busy,
  building,
  elapsed,
  lastBuild,
  onBuild,
  onOpenSettings,
}: {
  project: Project;
  busy: boolean;
  building: boolean;
  elapsed: number;
  lastBuild: { at: number; success: boolean } | null;
  onBuild: () => void;
  onOpenSettings: () => void;
}) {
  const [jars, setJars] = useState<JarInfo[]>([]);
  const [info, setInfo] = useState<ModSettings | null>(null);
  const [version, setVersion] = useState("");
  const [zipping, setZipping] = useState(false);

  const reload = () => {
    exportApi.jars(project.id).then(setJars).catch(() => setJars([]));
    modSettingsApi
      .get(project.id)
      .then((s) => {
        setInfo(s);
        setVersion(s.version);
      })
      .catch(() => {});
  };
  useEffect(reload, [project.id, lastBuild?.at]);

  async function saveVersion() {
    if (!info || version.trim() === info.version) return;
    const next = { ...info, version: version.trim() || info.version };
    try {
      await modSettingsApi.save(project.id, next);
      setInfo(next);
      toast(t("Version gespeichert."), "success");
    } catch (e) {
      toast(String(e), "error");
    }
  }

  async function saveAs(jar: JarInfo) {
    const dest = await pickSaveFile(t("Mod-Datei speichern"), jar.name, "jar", t("Mod-Datei"));
    if (!dest) return;
    try {
      await exportApi.copyJar(project.id, jar.path, dest);
      toast(t("Mod-Datei gespeichert."), "success");
    } catch (e) {
      toast(String(e), "error");
    }
  }

  async function remove(jar: JarInfo) {
    if (!(await confirmDialog(t("„{name}“ entfernen?", { name: jar.name }), t("Die Datei wird aus dem Build-Ordner gelöscht."), t("Entfernen"), t("Abbrechen"), true))) return;
    await exportApi.deleteJar(project.id, jar.path).catch((e) => toast(String(e), "error"));
    reload();
  }

  async function sourceZip() {
    const dest = await pickSaveFile(t("Quellcode speichern"), `${project.modId}-${info?.version ?? "src"}-quellcode.zip`, "zip", "ZIP");
    if (!dest) return;
    setZipping(true);
    try {
      const n = await exportApi.sourceZip(project.id, dest);
      toast(t("Quellcode gesichert ({n} Dateien).", { n }), "success");
      api.openPath(dest).catch(() => {});
    } catch (e) {
      toast(String(e), "error");
    } finally {
      setZipping(false);
    }
  }

  const checks: { ok: boolean; label: string; hint: string }[] = info
    ? [
        { ok: !!info.name.trim(), label: t("Name"), hint: info.name || t("fehlt") },
        { ok: info.description.trim().length >= 20, label: t("Beschreibung"), hint: info.description.trim() ? t("{n} Zeichen", { n: info.description.trim().length }) : t("fehlt") },
        { ok: !!info.authors.trim(), label: t("Autoren"), hint: info.authors || t("fehlt") },
        { ok: !!info.license.trim() && info.license !== "All Rights Reserved", label: t("Lizenz"), hint: info.license || t("fehlt") },
        { ok: !!info.logo, label: t("Logo"), hint: info.logo ? t("vorhanden") : t("fehlt") },
        { ok: !/^0\.0\./.test(info.version), label: t("Version"), hint: info.version },
      ]
    : [];
  const ready = checks.filter((c) => c.ok).length;
  const latest = jars[0];

  return (
    <div className="export-page">
      <div className="export-main">
        <section className="panel export-hero">
          <div className="export-id">
            {info?.logo ? <img className="export-logo" src={info.logo} alt="" /> : <span className="export-logo export-logo-ph"><PackageIcon size={26} /></span>}
            <div className="grow">
              <div className="export-name">{info?.name || project.name}</div>
              <div className="muted small">
                <span className="mono">{project.modId}</span> · {t("Minecraft")} {project.mcVersion} · NeoForge
              </div>
            </div>
            <label className="export-version">
              <span className="muted small">{t("Version")}</span>
              <input className="input mono" value={version} onChange={(e) => setVersion(e.target.value)} onBlur={saveVersion} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
            </label>
          </div>
          <div className="export-build">
            <button className={building ? "btn primary lg loading" : "btn primary lg"} disabled={busy} onClick={onBuild}>
              <HammerIcon size={16} /> {building ? t("Wird gebaut … {s} s", { s: elapsed }) : t("Mod-Datei bauen")}
            </button>
            <div className="muted small">
              {building
                ? t("Gradle baut die .jar – das dauert beim ersten Mal etwas länger.")
                : busy
                  ? t("Es läuft gerade etwas anderes. Bauen geht danach.")
                  : t("Erzeugt eine .jar, die andere einfach in ihren mods-Ordner legen.")}
            </div>
          </div>
          {lastBuild && !building && (
            <div className={lastBuild.success ? "callout ok" : "callout error"}>
              {lastBuild.success ? <CheckIcon size={16} /> : <AlertIcon size={16} />}
              <div className="grow">
                {lastBuild.success && latest ? t("Fertig: {name} ({size})", { name: latest.name, size: size(latest.size) }) : t("Bauen ist fehlgeschlagen – Details stehen in der Konsole.")}
              </div>
              {lastBuild.success && latest && (
                <span className="row gap-6">
                  <button className="btn small" onClick={() => api.openPath(latest.path)}>
                    <FolderIcon size={14} /> {t("Im Ordner zeigen")}
                  </button>
                  <button className="btn small primary" onClick={() => saveAs(latest)}>
                    <SaveIcon size={14} /> {t("Speichern unter …")}
                  </button>
                </span>
              )}
            </div>
          )}
        </section>

        <section className="panel export-list">
          <div className="panel-head">
            <div className="panel-title-lg">{t("Erstellte Mod-Dateien")}</div>
            <span className="muted small">{jars.length ? t("{n} Dateien", { n: jars.length }) : ""}</span>
          </div>
          {jars.length === 0 ? (
            <p className="muted small pad">{t("Noch keine Mod-Datei gebaut.")}</p>
          ) : (
            <div className="jar-rows">
              {jars.map((j, i) => (
                <div
                  key={j.path}
                  className="jar-row"
                  {...contextMenu(() => [
                    { label: t("Speichern unter …"), icon: <SaveIcon size={15} />, onClick: () => saveAs(j) },
                    { label: t("Im Ordner zeigen"), icon: <FolderIcon size={15} />, onClick: () => api.openPath(j.path) },
                    "separator",
                    { label: t("Entfernen"), icon: <TrashIcon size={15} />, danger: true, onClick: () => remove(j) },
                  ])}
                >
                  <PackageIcon size={18} />
                  <div className="grow">
                    <div className="mono">
                      {j.name} {i === 0 && <span className="badge-mini">{t("Neueste")}</span>}
                    </div>
                    <div className="muted small">
                      {size(j.size)} · {new Date(j.modified * 1000).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" })}
                    </div>
                  </div>
                  <button className="icon-btn" onClick={() => saveAs(j)} aria-label={t("Speichern unter …")} data-tip={t("Speichern unter …")}>
                    <DownloadIcon size={15} />
                  </button>
                  <button className="icon-btn" onClick={() => api.openPath(j.path)} aria-label={t("Im Ordner zeigen")} data-tip={t("Im Ordner zeigen")}>
                    <FolderIcon size={15} />
                  </button>
                  <button className="icon-btn danger" onClick={() => remove(j)} aria-label={t("Entfernen")} data-tip={t("Entfernen")}>
                    <TrashIcon size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <aside className="export-side">
        <section className="panel">
          <div className="panel-head">
            <div className="panel-title-lg">{t("Bereit zum Veröffentlichen?")}</div>
            <span className={ready === checks.length ? "badge-mini ok" : "badge-mini"}>
              {ready}/{checks.length}
            </span>
          </div>
          <ul className="check-list">
            {checks.map((c) => (
              <li key={c.label} className={c.ok ? "ok" : ""}>
                {c.ok ? <CheckIcon size={15} /> : <AlertIcon size={15} />}
                <span className="grow">{c.label}</span>
                <span className="muted small ellipsis">{c.hint}</span>
              </li>
            ))}
          </ul>
          <button className="btn small full" onClick={onOpenSettings}>
            <PencilIcon size={13} /> {t("In den Mod-Einstellungen ändern")}
          </button>
        </section>

        <section className="panel">
          <div className="panel-title-lg">{t("Veröffentlichen")}</div>
          <p className="muted small">{t("Lade die neueste Mod-Datei hoch und wähle als Loader NeoForge und als Spielversion {mc}.", { mc: project.mcVersion })}</p>
          <div className="publish-links">
            <button className="btn small" onClick={() => api.openUrl("https://modrinth.com/dashboard/projects")}>
              <UploadIcon size={13} /> Modrinth <ExternalIcon size={12} />
            </button>
            <button className="btn small" onClick={() => api.openUrl("https://authors.curseforge.com/#/projects")}>
              <UploadIcon size={13} /> CurseForge <ExternalIcon size={12} />
            </button>
          </div>
        </section>

        <section className="panel">
          <div className="panel-title-lg">{t("Quellcode sichern")}</div>
          <p className="muted small">{t("Packt das ganze Projekt ohne Build- und Spielordner in eine ZIP – zum Weitergeben oder als Sicherung.")}</p>
          <button className={zipping ? "btn small full loading" : "btn small full"} disabled={zipping} onClick={sourceZip}>
            <DownloadIcon size={13} /> {t("Als ZIP speichern …")}
          </button>
        </section>
      </aside>
    </div>
  );
}
