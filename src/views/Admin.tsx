import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useRef, useState } from "react";
import { adminApi, AdminUser, bump, DeviceCode, loggedIn, logout, Overview, ReleaseRow, relTime, RunRow, useAdminSession } from "../admin";
import { Segmented } from "../components/Chrome";
import { AlertIcon, CheckIcon, CloseIcon, DownloadIcon, GithubIcon, RefreshIcon, RocketIcon, ShieldIcon, TrashIcon } from "../icons";
import { toast } from "../state";

const openUrl = (url: string) => invoke("open_url", { url }).catch((e) => toast(String(e), "error"));

export default function Admin() {
  const session = useAdminSession();
  return session ? <Dashboard user={session} /> : <Login />;
}

// ---- Anmeldung ------------------------------------------------------------------

function Login() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [code, setCode] = useState<DeviceCode | null>(null);
  const [state, setState] = useState<"idle" | "waiting" | "forbidden" | "expired" | "denied">("idle");
  const [forbiddenLogin, setForbiddenLogin] = useState("");
  const [busy, setBusy] = useState(false);
  const timer = useRef<number>();

  useEffect(() => {
    adminApi.configured().then(setConfigured);
    return () => window.clearTimeout(timer.current);
  }, []);

  async function start() {
    setBusy(true);
    try {
      const c = await adminApi.startLogin();
      setCode(c);
      setState("waiting");
      openUrl(c.verificationUri);
      poll(c, c.interval);
    } catch (e) {
      toast(String(e), "error");
    } finally {
      setBusy(false);
    }
  }

  function poll(c: DeviceCode, interval: number) {
    timer.current = window.setTimeout(async () => {
      try {
        const r = await adminApi.pollLogin(c.deviceCode);
        if (r.status === "done" && r.user) {
          toast(`Angemeldet als ${r.user.login}.`, "success");
          loggedIn(r.user);
        } else if (r.status === "pending") poll(c, interval);
        else if (r.status === "slow_down") poll(c, interval + 5);
        else if (r.status === "forbidden") {
          setForbiddenLogin(r.login ?? "");
          setState("forbidden");
          setCode(null);
        } else {
          setState(r.status === "denied" ? "denied" : "expired");
          setCode(null);
        }
      } catch (e) {
        toast(String(e), "error");
        setState("idle");
        setCode(null);
      }
    }, interval * 1000);
  }

  return (
    <div className="admin-login">
      <div className="login-card">
        <div className="login-icon">
          <ShieldIcon size={26} />
        </div>
        <h1>Entwicklerbereich</h1>
        <p className="muted">Veröffentliche neue Versionen, verwalte Releases und behalte die Builds im Blick. Zugang nur für Basti032002.</p>

        {configured === false && (
          <div className="callout warn left">
            <AlertIcon size={18} />
            <div>
              <div className="callout-title">GitHub-Login ist noch nicht eingerichtet</div>
              <div className="muted small">
                Diese Version wurde ohne Client-ID gebaut. Lege eine GitHub-OAuth-App mit aktiviertem Device Flow an und hinterlege die Client-ID als
                Repo-Variable <span className="mono">ANVIL_GITHUB_CLIENT_ID</span>.
              </div>
            </div>
          </div>
        )}

        {state === "waiting" && code ? (
          <div className="device">
            <div className="muted small">Gib diesen Code auf GitHub ein:</div>
            <div className="device-code mono">
              {code.userCode.split("").map((ch, i) => (
                <span key={i} style={{ "--i": i } as React.CSSProperties}>
                  {ch}
                </span>
              ))}
            </div>
            <div className="row center">
              <button
                className="btn small"
                onClick={() => {
                  navigator.clipboard.writeText(code.userCode).then(() => toast("Code kopiert.", "success"));
                }}
              >
                Code kopieren
              </button>
              <button className="btn small" onClick={() => openUrl(code.verificationUri)}>
                <GithubIcon size={14} /> GitHub öffnen
              </button>
            </div>
            <div className="waiting">
              <span className="spinner" /> Warte auf Bestätigung …
            </div>
          </div>
        ) : (
          <>
            {state === "forbidden" && (
              <div className="callout error left">
                Angemeldet als <b>{forbiddenLogin}</b> – dieses Konto hat keinen Zugriff.
              </div>
            )}
            {(state === "expired" || state === "denied") && (
              <div className="callout warn left">{state === "denied" ? "Anmeldung abgelehnt." : "Der Code ist abgelaufen."} Versuch es noch einmal.</div>
            )}
            <button className="btn primary large" disabled={!configured || busy} onClick={start}>
              <GithubIcon size={17} /> Mit GitHub anmelden
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ---- Dashboard ------------------------------------------------------------------

type Tab = "overview" | "publish" | "releases" | "builds";

function Dashboard({ user }: { user: AdminUser }) {
  const [tab, setTab] = useState<Tab>("overview");
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(false);
  const [publishing, setPublishing] = useState<{ version: string; sha: string; startedAt: number } | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      setData(await adminApi.overview());
    } catch (e) {
      toast(String(e), "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  // Während eines Release-Builds regelmäßig aktualisieren
  const activeRun = data?.runs.some((r) => r.status !== "completed");
  useEffect(() => {
    if (!publishing && !activeRun) return;
    const t = setInterval(refresh, 8000);
    return () => clearInterval(t);
  }, [publishing, activeRun]);

  return (
    <div className="page admin">
      <header className="page-header">
        <div className="row">
          <img className="avatar" src={user.avatarUrl} alt="" />
          <div>
            <div className="eyebrow">Entwicklerbereich</div>
            <h1>Hallo {user.name ?? user.login}</h1>
          </div>
        </div>
        <div className="row">
          <button className="icon-btn" aria-label="Aktualisieren" data-tip="Aktualisieren" onClick={refresh} disabled={loading}>
            <span className={loading ? "spin-icon" : ""}>
              <RefreshIcon size={16} />
            </span>
          </button>
          <button className="btn ghost" onClick={() => logout().then(() => toast("Abgemeldet.", "info"))}>
            Abmelden
          </button>
        </div>
      </header>

      <Segmented
        label="Bereich"
        value={tab}
        onChange={setTab}
        options={[
          { value: "overview", label: "Übersicht" },
          { value: "publish", label: "Veröffentlichen" },
          { value: "releases", label: "Releases" },
          { value: "builds", label: "Builds" },
        ]}
      />

      {!data ? (
        <div className="skeleton-grid">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton" />
          ))}
        </div>
      ) : (
        <div className="admin-body" key={tab}>
          {tab === "overview" && <OverviewTab data={data} onPublish={() => setTab("publish")} />}
          {tab === "publish" && (
            <PublishTab
              data={data}
              publishing={publishing}
              onPublished={(version, sha) => {
                setPublishing({ version, sha, startedAt: Date.now() });
                refresh();
              }}
              onReset={() => setPublishing(null)}
            />
          )}
          {tab === "releases" && <ReleasesTab releases={data.releases} onChanged={refresh} />}
          {tab === "builds" && <BuildsTab runs={data.runs} onChanged={refresh} />}
        </div>
      )}
    </div>
  );
}

function runState(r?: RunRow) {
  if (!r) return { label: "–", cls: "" };
  if (r.status !== "completed") return { label: r.status === "queued" ? "In Warteschlange" : "Läuft", cls: "running" };
  if (r.conclusion === "success") return { label: "Erfolgreich", cls: "ok" };
  if (r.conclusion === "cancelled") return { label: "Abgebrochen", cls: "muted" };
  return { label: "Fehlgeschlagen", cls: "fail" };
}

function OverviewTab({ data, onPublish }: { data: Overview; onPublish: () => void }) {
  const latest = data.releases.find((r) => !r.draft);
  const total = data.releases.reduce((s, r) => s + r.downloads, 0);
  const lastRun = data.runs[0];
  const rs = runState(lastRun);

  return (
    <>
      <div className="stats">
        <Stat label="Version im Code" value={data.repoVersion} />
        <Stat label="Neuestes Release" value={latest ? latest.tag : "–"} sub={latest ? relTime(latest.publishedAt) : "noch keins"} />
        <Stat label="Downloads gesamt" value={total.toLocaleString("de-DE")} sub={`${data.releases.length} Releases`} />
        <Stat label="Letzter Build" value={rs.label} cls={rs.cls} sub={lastRun ? relTime(lastRun.createdAt) : ""} />
      </div>

      <div className="panel">
        <div className="panel-head">
          <div>
            <div className="panel-title-lg">Noch nicht veröffentlicht</div>
            <div className="muted small">Commits seit dem letzten Release</div>
          </div>
          <button className="btn primary" onClick={onPublish}>
            <RocketIcon size={15} /> Neue Version
          </button>
        </div>
        {data.unreleased.length === 0 ? (
          <p className="muted small">Alles veröffentlicht – keine neuen Änderungen.</p>
        ) : (
          <ul className="commit-list">
            {data.unreleased.map((c, i) => (
              <li key={i} style={{ "--i": i } as React.CSSProperties}>
                <span className="commit-dot" />
                {c}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function Stat({ label, value, sub, cls }: { label: string; value: string; sub?: string; cls?: string }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${cls ?? ""}`}>{value}</div>
      {sub && <div className="muted small">{sub}</div>}
    </div>
  );
}

function PublishTab({
  data,
  publishing,
  onPublished,
  onReset,
}: {
  data: Overview;
  publishing: { version: string; sha: string; startedAt: number } | null;
  onPublished: (version: string, sha: string) => void;
  onReset: () => void;
}) {
  const [kind, setKind] = useState<"patch" | "minor" | "major" | "beta">("patch");
  const [version, setVersion] = useState(() => bump(data.repoVersion, "patch"));
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => setVersion(bump(data.repoVersion, kind)), [kind, data.repoVersion]);

  if (publishing) {
    const run = data.runs.find((r) => r.headSha === publishing.sha);
    const release = data.releases.find((r) => r.tag === `v${publishing.version}`);
    const failed = run?.status === "completed" && run.conclusion !== "success";
    const steps = [
      { label: "Commit auf main erstellt", state: "done" },
      {
        label: run ? (run.status === "completed" ? (failed ? "Build fehlgeschlagen" : "Installer gebaut") : "Installer wird gebaut …") : "Warte auf GitHub Actions …",
        state: failed ? "fail" : run?.status === "completed" ? "done" : "active",
      },
      { label: release ? "Release ist online" : "Release veröffentlichen", state: release ? "done" : failed ? "idle" : run?.status === "completed" ? "active" : "idle" },
    ];
    return (
      <div className="panel publish-progress">
        <div className="panel-title-lg">Version {publishing.version}</div>
        <div className="timeline">
          {steps.map((s, i) => (
            <div key={i} className={`tl-step ${s.state}`}>
              <span className="tl-dot">{s.state === "done" ? <CheckIcon size={12} /> : s.state === "fail" ? <CloseIcon size={10} /> : null}</span>
              <span>{s.label}</span>
            </div>
          ))}
        </div>
        {release && (
          <div className="callout ok">
            <CheckIcon size={18} />
            <div className="grow">
              <div className="callout-title">Fertig!</div>
              <div className="muted small">Alle Installationen mit automatischen Updates bekommen {release.tag} beim nächsten Check.</div>
            </div>
            <button className="btn small" onClick={() => openUrl(release.htmlUrl)}>
              Ansehen
            </button>
          </div>
        )}
        <div className="row">
          {run && (
            <button className="btn small" onClick={() => openUrl(run.htmlUrl)}>
              Build-Log
            </button>
          )}
          {failed && run && (
            <button className="btn small" onClick={() => adminApi.rerun(run.id).then(() => toast("Build wird neu gestartet.", "info"))}>
              <RefreshIcon size={14} /> Erneut versuchen
            </button>
          )}
          {(release || failed) && (
            <button className="btn small ghost" onClick={onReset}>
              Neue Version vorbereiten
            </button>
          )}
        </div>
      </div>
    );
  }

  const suggested = data.unreleased.filter((c) => !/^Version \d/.test(c));

  async function publish() {
    if (!confirm(`Version ${version} jetzt veröffentlichen? Alle Nutzer bekommen das Update.`)) return;
    setBusy(true);
    try {
      const r = await adminApi.publish(version, notes);
      toast(`Version ${version} wird gebaut.`, "success");
      onPublished(version, r.commitSha);
    } catch (e) {
      toast(String(e), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="publish">
      <div className="panel">
        <div className="field">
          <label>Art der Änderung</label>
          <Segmented
            label="Art der Änderung"
            value={kind}
            onChange={setKind}
            options={[
              { value: "patch", label: "Fehlerbehebung" },
              { value: "minor", label: "Neue Funktionen" },
              { value: "major", label: "Großes Update" },
              { value: "beta", label: "Beta" },
            ]}
          />
        </div>
        <div className="version-row">
          <div className="version-from mono">{data.repoVersion}</div>
          <span className="version-arrow">→</span>
          <label htmlFor="ver" className="sr-only">
            Neue Version
          </label>
          <input id="ver" className="input mono version-input" value={version} onChange={(e) => setVersion(e.target.value)} />
          {version.includes("-") && <span className="tag">Vorabversion</span>}
        </div>
        <div className="field">
          <label htmlFor="notes">Was ist neu? (erscheint im Release und in der App)</label>
          <textarea id="notes" className="input textarea" rows={6} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="- Neues Feature …&#10;- Fehler behoben …" />
          {suggested.length > 0 && !notes && (
            <button className="link small" onClick={() => setNotes(suggested.map((c) => `- ${c}`).join("\n"))}>
              Aus {suggested.length} Commits übernehmen
            </button>
          )}
        </div>
        <div className="row end">
          <button className={busy ? "btn primary loading" : "btn primary"} disabled={busy || !version} onClick={publish}>
            <RocketIcon size={15} /> Version {version} veröffentlichen
          </button>
        </div>
      </div>
      <div className="panel soft explain">
        <div className="panel-title-lg">Was passiert dann?</div>
        <ol>
          <li>Die Versionsnummer wird in allen Dateien gesetzt und als Commit auf <span className="mono">main</span> gespeichert.</li>
          <li>GitHub Actions baut den Windows-Installer (ca. 4–12 Minuten).</li>
          <li>Das Release erscheint im öffentlichen Repo – alle Installationen finden das Update automatisch.</li>
        </ol>
      </div>
    </div>
  );
}

function ReleasesTab({ releases, onChanged }: { releases: ReleaseRow[]; onChanged: () => void }) {
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const max = useMemo(() => Math.max(1, ...releases.map((r) => r.downloads)), [releases]);

  if (releases.length === 0) return <p className="muted">Noch keine Releases.</p>;

  return (
    <div className="list">
      {releases.map((r, i) => (
        <div key={r.id} className="list-row release" style={{ "--i": i } as React.CSSProperties}>
          <div className="release-main">
            <div className="row gap-6">
              <span className="release-tag mono">{r.tag}</span>
              {i === 0 && !r.prerelease && <span className="tag accent">Aktuell</span>}
              {r.prerelease && <span className="tag warn">Beta</span>}
            </div>
            <div className="muted small">{relTime(r.publishedAt)}</div>
          </div>
          <div className="downloads">
            <DownloadIcon size={13} />
            <span>{r.downloads}</span>
            <div className="dl-bar">
              <span style={{ width: `${(r.downloads / max) * 100}%` }} />
            </div>
          </div>
          <div className="row gap-6">
            <button
              className="btn small"
              onClick={() =>
                adminApi
                  .setPrerelease(r.id, !r.prerelease)
                  .then(() => {
                    toast(r.prerelease ? `${r.tag} ist jetzt stabil.` : `${r.tag} ist jetzt Beta.`, "success");
                    onChanged();
                  })
                  .catch((e) => toast(String(e), "error"))
              }
            >
              {r.prerelease ? "Als stabil markieren" : "Zur Beta machen"}
            </button>
            <button
              className="btn small"
              onClick={() => {
                setEditing(editing === r.id ? null : r.id);
                setDraft(r.body);
              }}
            >
              Notizen
            </button>
            <button className="icon-btn" aria-label="Auf GitHub ansehen" data-tip="Auf GitHub" onClick={() => openUrl(r.htmlUrl)}>
              <GithubIcon size={15} />
            </button>
            <button
              className="icon-btn danger"
              aria-label="Release löschen"
              data-tip="Löschen"
              onClick={() => {
                if (!confirm(`${r.tag} wirklich löschen? Nutzer bekommen diese Version dann nicht mehr angeboten.`)) return;
                adminApi
                  .deleteRelease(r.id, r.tag)
                  .then(() => {
                    toast(`${r.tag} gelöscht.`, "success");
                    onChanged();
                  })
                  .catch((e) => toast(String(e), "error"));
              }}
            >
              <TrashIcon size={15} />
            </button>
          </div>
          {editing === r.id && (
            <div className="notes-edit">
              <textarea className="input textarea mono" rows={8} value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="Release-Notizen" />
              <div className="row end">
                <button className="btn small ghost" onClick={() => setEditing(null)}>
                  Abbrechen
                </button>
                <button
                  className="btn small primary"
                  onClick={() =>
                    adminApi
                      .updateNotes(r.id, draft)
                      .then(() => {
                        toast("Notizen gespeichert.", "success");
                        setEditing(null);
                        onChanged();
                      })
                      .catch((e) => toast(String(e), "error"))
                  }
                >
                  Speichern
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function BuildsTab({ runs, onChanged }: { runs: RunRow[]; onChanged: () => void }) {
  if (runs.length === 0) return <p className="muted">Noch keine Builds.</p>;
  return (
    <div className="list">
      {runs.map((r, i) => {
        const s = runState(r);
        return (
          <div key={r.id} className="list-row" style={{ "--i": i } as React.CSSProperties}>
            <span className={`run-icon ${s.cls}`}>
              {s.cls === "ok" ? <CheckIcon size={13} /> : s.cls === "fail" ? <CloseIcon size={11} /> : s.cls === "running" ? <span className="spinner small" /> : <span>–</span>}
            </span>
            <div className="grow min0">
              <div className="ellipsis">{r.title}</div>
              <div className="muted small">
                {s.label} · {relTime(r.createdAt)} · <span className="mono">{r.headSha.slice(0, 7)}</span>
              </div>
            </div>
            {r.status === "completed" && r.conclusion !== "success" && (
              <button
                className="btn small"
                onClick={() =>
                  adminApi
                    .rerun(r.id)
                    .then(() => {
                      toast("Build wird neu gestartet.", "info");
                      onChanged();
                    })
                    .catch((e) => toast(String(e), "error"))
                }
              >
                <RefreshIcon size={14} /> Neu starten
              </button>
            )}
            <button className="icon-btn" aria-label="Log öffnen" data-tip="Log öffnen" onClick={() => openUrl(r.htmlUrl)}>
              <GithubIcon size={15} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
