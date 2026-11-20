import { t } from "../i18n";
import { confirmDialog } from "../components/Overlay";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AccountInfo,
  adminApi,
  bump,
  BumpKind,
  CHANNEL_LABEL,
  channelOf,
  DeviceCode,
  loggedIn,
  logout,
  Overview,
  ReleaseRow,
  relTime,
  RunRow,
  Tester,
  useAccount,
} from "../admin";
import { Segmented } from "../components/Chrome";
import { AlertIcon, ArrowRightIcon, CheckIcon, CloseIcon, CopyIcon, DownloadIcon, ExternalIcon, GithubIcon, LogoutIcon, PencilIcon, PlusIcon, RefreshIcon, RocketIcon, SaveIcon, ShieldIcon, TagIcon, TrashIcon } from "../icons";
import { toast } from "../state";

const openUrl = (url: string) => invoke("open_url", { url }).catch((e) => toast(String(e), "error"));

export const openGithub = openUrl;

export default function Admin() {
  const account = useAccount();
  if (!account) {
    return (
      <div className="admin-login">
        <div className="login-card">
          <div className="login-icon">
            <ShieldIcon size={26} />
          </div>
          <h1>{t("Entwicklerbereich")}</h1>
          <p className="muted">{t("Veröffentliche neue Versionen, verwalte Releases, Tester und Builds. Zugang nur für Basti032002.")}</p>
          <GitHubLogin />
        </div>
      </div>
    );
  }
  if (!account.isAdmin) {
    return (
      <div className="admin-login">
        <div className="login-card">
          <div className="login-icon warn">
            <AlertIcon size={24} />
          </div>
          <h1>{t("Kein Zugriff")}</h1>
          <p className="muted">{t("Angemeldet als {user}. Der Entwicklerbereich ist nur für {owner}.", { user: account.user.login, owner: "Basti032002" })}</p>
        </div>
      </div>
    );
  }
  return <Dashboard account={account} />;
}

// ---- Anmeldung (auch in den Einstellungen benutzt) --------------------------------

export function GitHubLogin({ compact }: { compact?: boolean }) {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [code, setCode] = useState<DeviceCode | null>(null);
  const [state, setState] = useState<"idle" | "waiting" | "expired" | "denied">("idle");
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
        if (r.status === "done" && r.account) {
          toast(t("Angemeldet als {login}.", { login: r.account.user.login }), "success");
          setState("idle");
          setCode(null);
          loggedIn(r.account);
        } else if (r.status === "pending") poll(c, interval);
        else if (r.status === "slow_down") poll(c, interval + 5);
        else {
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
    <div className={compact ? "gh-login compact" : "gh-login"}>
        {configured === false && (
          <div className="callout warn left">
            <AlertIcon size={18} />
            <div>
              <div className="callout-title">{t("GitHub-Login ist noch nicht eingerichtet")}</div>
              <div className="muted small">
                {t("Diese Version wurde ohne Client-ID der GitHub App gebaut.")}
              </div>
            </div>
          </div>
        )}

        {state === "waiting" && code ? (
          <div className="device">
            <div className="muted small">{t("Gib diesen Code auf GitHub ein:")}</div>
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
                  navigator.clipboard.writeText(code.userCode).then(() => toast(t("Code kopiert."), "success"));
                }}
              >
                <CopyIcon size={14} />{" "}{t("Code kopieren")}
              </button>
              <button className="btn small" onClick={() => openUrl(code.verificationUri)}>
                <GithubIcon size={14} />{" "}{t("GitHub öffnen")}
              </button>
            </div>
            <div className="waiting">
              <span className="spinner" />{" "}{t("Warte auf Bestätigung …")}
            </div>
          </div>
        ) : (
          <>
            {(state === "expired" || state === "denied") && (
              <div className="callout warn left">{state === "denied" ? t("Anmeldung abgelehnt.") : t("Der Code ist abgelaufen.")}{" "}{t("Versuch es noch einmal.")}</div>
            )}
            <button className={compact ? "btn primary" : "btn primary large"} disabled={!configured || busy} onClick={start}>
              <GithubIcon size={17} />{" "}{t("Mit GitHub anmelden")}
            </button>
          </>
        )}
    </div>
  );
}

// ---- Dashboard ------------------------------------------------------------------

type Tab = "overview" | "publish" | "releases" | "testers" | "builds";

function Dashboard({ account }: { account: AccountInfo }) {
  const user = account.user;
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
            <div className="eyebrow">{t("Entwicklerbereich")}</div>
            <h1>{t("Hallo")}{" "}{user.name ?? user.login}</h1>
          </div>
        </div>
        <div className="row">
          <button className="icon-btn" aria-label={t("Aktualisieren")} data-tip={t("Aktualisieren")} onClick={refresh} disabled={loading}>
            <span className={loading ? "spin-icon" : ""}>
              <RefreshIcon size={16} />
            </span>
          </button>
          <button className="btn ghost" onClick={() => logout().then(() => toast(t("Abgemeldet."), "info"))}>
            <LogoutIcon size={14} />{" "}{t("Abmelden")}
          </button>
        </div>
      </header>

      <Segmented
        label={t("Bereich")}
        value={tab}
        onChange={setTab}
        options={[
          { value: "overview", label: t("Übersicht") },
          { value: "publish", label: t("Veröffentlichen") },
          { value: "releases", label: t("Releases") },
          { value: "testers", label: t("Tester") },
          { value: "builds", label: t("Builds") },
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
          {tab === "testers" && <TestersTab />}
          {tab === "builds" && <BuildsTab runs={data.runs} onChanged={refresh} />}
        </div>
      )}
    </div>
  );
}

function runState(r?: RunRow) {
  if (!r) return { label: "–", cls: "" };
  if (r.status !== "completed") return { label: r.status === "queued" ? t("In Warteschlange") : t("Läuft"), cls: "running" };
  if (r.conclusion === "success") return { label: t("Erfolgreich"), cls: "ok" };
  if (r.conclusion === "cancelled") return { label: t("Abgebrochen"), cls: "muted" };
  return { label: t("Fehlgeschlagen"), cls: "fail" };
}

function OverviewTab({ data, onPublish }: { data: Overview; onPublish: () => void }) {
  const latest = data.releases.find((r) => !r.draft && r.channel === "stable");
  const total = data.releases.reduce((s, r) => s + r.downloads, 0);
  const lastRun = data.runs[0];
  const rs = runState(lastRun);

  return (
    <>
      <div className="stats">
        <Stat label={t("Version im Code")} value={data.repoVersion} />
        <Stat label={t("Neueste stabile Version")} value={latest ? latest.tag : "–"} sub={latest ? relTime(latest.publishedAt) : t("noch keins")} />
        <Stat label={t("Downloads gesamt")} value={total.toLocaleString("de-DE")} sub={t("{length} Releases", { length: data.releases.length })} />
        <Stat label={t("Letzter Build")} value={rs.label} cls={rs.cls} sub={lastRun ? relTime(lastRun.createdAt) : ""} />
      </div>

      <div className="panel">
        <div className="panel-head">
          <div>
            <div className="panel-title-lg">{t("Noch nicht veröffentlicht")}</div>
            <div className="muted small">{t("Commits seit dem letzten Release")}</div>
          </div>
          <button className="btn primary" onClick={onPublish}>
            <RocketIcon size={15} />{" "}{t("Neue Version")}
          </button>
        </div>
        {data.unreleased.length === 0 ? (
          <p className="muted small">{t("Alles veröffentlicht – keine neuen Änderungen.")}</p>
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
  const [kind, setKind] = useState<BumpKind>("patch");
  const [version, setVersion] = useState(() => bump(data.repoVersion, "patch"));
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => setVersion(bump(data.repoVersion, kind)), [kind, data.repoVersion]);

  if (publishing) {
    const run = data.runs.find((r) => r.headSha === publishing.sha);
    const release = data.releases.find((r) => r.tag === `v${publishing.version}`);
    const failed = run?.status === "completed" && run.conclusion !== "success";
    const steps = [
      { label: t("Commit auf main erstellt"), state: "done" },
      {
        label: run ? (run.status === "completed" ? (failed ? t("Build fehlgeschlagen") : t("Installer gebaut")) : t("Installer wird gebaut …")) : t("Warte auf GitHub Actions …"),
        state: failed ? "fail" : run?.status === "completed" ? "done" : "active",
      },
      { label: release ? t("Release ist online") : t("Release veröffentlichen"), state: release ? "done" : failed ? "idle" : run?.status === "completed" ? "active" : "idle" },
    ];
    return (
      <div className="panel publish-progress">
        <div className="panel-title-lg">{t("Version")}{" "}{publishing.version}</div>
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
              <div className="callout-title">{t("Fertig!")}</div>
              <div className="muted small">{t("Alle Installationen mit automatischen Updates bekommen {tag} beim nächsten Check.", { tag: release.tag })}</div>
            </div>
            <button className="btn small" onClick={() => openUrl(release.htmlUrl)}>
              <ExternalIcon size={14} />{" "}{t("Ansehen")}
            </button>
          </div>
        )}
        <div className="row">
          {run && (
            <button className="btn small" onClick={() => openUrl(run.htmlUrl)}>
              <ExternalIcon size={14} /> {t("Build-Log")}
            </button>
          )}
          {failed && run && (
            <button className="btn small" onClick={() => adminApi.rerun(run.id).then(() => toast(t("Build wird neu gestartet."), "info"))}>
              <RefreshIcon size={14} />{" "}{t("Erneut versuchen")}
            </button>
          )}
          {(release || failed) && (
            <button className="btn small ghost" onClick={onReset}>
              <RefreshIcon size={14} />{" "}{t("Neue Version vorbereiten")}
            </button>
          )}
        </div>
      </div>
    );
  }

  const suggested = data.unreleased.filter((c) => !/^Version \d/.test(c));

  async function publish() {
    const who = { stable: t("Alle Nutzer"), beta: t("Alle Beta-Nutzer"), dev: t("Alle Tester") }[channelOf(version)];
    if (!(await confirmDialog(t("Version {version} jetzt veröffentlichen?", { version: version }), t("{who} bekommen das Update.", { who: who }), t("Veröffentlichen"), t("Abbrechen")))) return;
    setBusy(true);
    try {
      const r = await adminApi.publish(version, notes);
      toast(t("Version {version} wird gebaut.", { version: version }), "success");
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
          <label>{t("Art der Änderung")}</label>
          <Segmented
            label={t("Art der Änderung")}
            value={kind}
            onChange={setKind}
            options={[
              { value: "patch", label: t("Fehlerbehebung") },
              { value: "minor", label: t("Neue Funktionen") },
              { value: "major", label: t("Großes Update") },
              { value: "beta", label: t("Beta") },
              { value: "dev", label: t("Dev") },
            ]}
          />
        </div>
        <div className={`channel-note ${channelOf(version)}`}>
          {channelOf(version) === "stable" && t("Stabile Version – alle Nutzer bekommen das Update.")}
          {channelOf(version) === "beta" && t("Beta – nur Nutzer mit Update-Kanal „Beta“ oder „Dev“ bekommen sie.")}
          {channelOf(version) === "dev" && t("Dev – landet im privaten Repo. Nur angemeldete Tester können sie laden.")}
        </div>
        <div className="version-row">
          <div className="version-from mono">{data.repoVersion}</div>
          <span className="version-arrow"><ArrowRightIcon size={14} /></span>
          <label htmlFor="ver" className="sr-only">
            {t("Neue Version")}
          </label>
          <input id="ver" className="input mono version-input" value={version} onChange={(e) => setVersion(e.target.value)} />
          <span className={`tag ch-${channelOf(version)}`}>{CHANNEL_LABEL[channelOf(version)]}</span>
        </div>
        <div className="field">
          <label htmlFor="notes">{t("Was ist neu? (erscheint im Release und in der App)")}</label>
          <textarea id="notes" className="input textarea" rows={6} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("- Neues Feature …\n- Fehler behoben …")} />
          {suggested.length > 0 && !notes && (
            <button className="link small" onClick={() => setNotes(suggested.map((c) => `- ${c}`).join("\n"))}>
              {t("Aus {n} Commits übernehmen", { n: suggested.length })}
            </button>
          )}
        </div>
        <div className="row end">
          <button className={busy ? "btn primary loading" : "btn primary"} disabled={busy || !version} onClick={publish}>
            <RocketIcon size={15} />{" "}{t("Version {version} veröffentlichen", { version })}
          </button>
        </div>
      </div>
      <div className="panel soft explain">
        <div className="panel-title-lg">{t("Was passiert dann?")}</div>
        <ol>
          <li>{t("Die Versionsnummer wird in allen Dateien gesetzt und als Commit auf {branch} gespeichert.", { branch: "main" })}</li>
          <li>{t("GitHub Actions baut den Windows-Installer (ca. 4–12 Minuten).")}</li>
          <li>{t("Stabil & Beta erscheinen im öffentlichen Repo, Dev im privaten Repo – passende Installationen finden das Update automatisch.")}</li>
        </ol>
      </div>
    </div>
  );
}

function ReleasesTab({ releases, onChanged }: { releases: ReleaseRow[]; onChanged: () => void }) {
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const max = useMemo(() => Math.max(1, ...releases.map((r) => r.downloads)), [releases]);

  if (releases.length === 0) return <p className="muted">{t("Noch keine Releases.")}</p>;

  return (
    <div className="list">
      {releases.map((r, i) => (
        <div key={r.id} className="list-row release" style={{ "--i": i } as React.CSSProperties}>
          <div className="release-main">
            <div className="row gap-6">
              <span className="release-tag mono">{r.tag}</span>
              <span className={`tag ch-${r.channel}`}>{CHANNEL_LABEL[r.channel]}</span>
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
            {r.channel !== "dev" && (
            <button
              className="btn small"
              onClick={() =>
                adminApi
                  .setPrerelease(r.repo, r.id, !r.prerelease)
                  .then(() => {
                    toast(r.prerelease ? t("{tag} ist jetzt stabil.", { tag: r.tag }) : t("{tag} ist jetzt Beta.", { tag: r.tag }), "success");
                    onChanged();
                  })
                  .catch((e) => toast(String(e), "error"))
              }
            >
              <TagIcon size={14} /> {r.prerelease ? t("Als stabil markieren") : t("Zur Beta machen")}
            </button>
            )}
            <button
              className="btn small"
              onClick={() => {
                setEditing(editing === r.id ? null : r.id);
                setDraft(r.body);
              }}
            >
              <PencilIcon size={14} />{" "}{t("Notizen")}
            </button>
            <button className="icon-btn" aria-label={t("Auf GitHub ansehen")} data-tip={t("Auf GitHub")} onClick={() => openUrl(r.htmlUrl)}>
              <GithubIcon size={15} />
            </button>
            <button
              className="icon-btn danger"
              aria-label={t("Release löschen")}
              data-tip={t("Löschen")}
              onClick={async () => {
                if (!(await confirmDialog(t("{tag} wirklich löschen?", { tag: r.tag }), t("Nutzer bekommen diese Version dann nicht mehr angeboten."), t("Löschen"), t("Abbrechen"), true))) return;
                adminApi
                  .deleteRelease(r.repo, r.id, r.tag)
                  .then(() => {
                    toast(t("{tag} gelöscht.", { tag: r.tag }), "success");
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
              <textarea className="input textarea mono" rows={8} value={draft} onChange={(e) => setDraft(e.target.value)} aria-label={t("Release-Notizen")} />
              <div className="row end">
                <button className="btn small ghost" onClick={() => setEditing(null)}>
                  <CloseIcon size={14} />{" "}{t("Abbrechen")}
                </button>
                <button
                  className="btn small primary"
                  onClick={() =>
                    adminApi
                      .updateNotes(r.repo, r.id, draft)
                      .then(() => {
                        toast(t("Notizen gespeichert."), "success");
                        setEditing(null);
                        onChanged();
                      })
                      .catch((e) => toast(String(e), "error"))
                  }
                >
                  <SaveIcon size={14} />{" "}{t("Speichern")}
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function TestersTab() {
  const [list, setList] = useState<Tester[] | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      setList(await adminApi.testers());
    } catch (e) {
      toast(String(e), "error");
      setList([]);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      await adminApi.addTester(name.trim());
      toast(t("{v0} wurde eingeladen.", { v0: name.trim() }), "success");
      setName("");
      load();
    } catch (err) {
      toast(String(err), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="panel">
        <div className="panel-title-lg">{t("Tester für Dev-Versionen")}</div>
        <p className="muted small" style={{ margin: "2px 0 14px" }}>
          {t("Tester bekommen Lesezugriff auf das private Repo {repo} – dort liegen nur die Dev-Installer, nicht dein Quellcode. GitHub schickt ihnen eine Einladung, die sie annehmen müssen.", { repo: "anvil-studio-dev" })}
        </p>
        <form className="row" onSubmit={add}>
          <label htmlFor="tester" className="sr-only">
            {t("GitHub-Name")}
          </label>
          <input id="tester" className="input" style={{ maxWidth: 280 }} placeholder={t("GitHub-Name, z. B. octocat")} value={name} onChange={(e) => setName(e.target.value)} />
          <button className={busy ? "btn primary loading" : "btn primary"} disabled={busy || !name.trim()}>
            <PlusIcon size={15} />{" "}{t("Einladen")}
          </button>
        </form>
      </div>
      {list === null ? (
        <div className="skeleton" style={{ height: 60 }} />
      ) : list.length === 0 ? (
        <p className="muted">{t("Noch keine Tester.")}</p>
      ) : (
        <div className="list">
          {list.map((tt, i) => (
            <div key={tt.login + (tt.invitationId ?? "")} className="list-row" style={{ "--i": i } as React.CSSProperties}>
              <img className="avatar small" src={tt.avatarUrl} alt="" />
              <div className="grow">
                <div>{tt.login}</div>
                <div className="muted small">{tt.pending ? t("Einladung noch nicht angenommen") : t("Hat Zugriff auf Dev-Versionen")}</div>
              </div>
              {tt.pending ? <span className="tag warn">{t("Eingeladen")}</span> : <span className="tag ch-dev">{t("Tester")}</span>}
              <button
                className="icon-btn danger"
                aria-label={`${tt.login} entfernen`}
                data-tip={t("Entfernen")}
                onClick={async () => {
                  if (!(await confirmDialog(t("{login} den Zugriff entziehen?", { login: tt.login }), t("Die Person kann danach keine Dev-Versionen mehr laden."), t("Zugriff entziehen"), t("Abbrechen"), true))) return;
                  adminApi
                    .removeTester(tt.login, tt.invitationId)
                    .then(() => {
                      toast(`${tt.login} entfernt.`, "success");
                      load();
                    })
                    .catch((e) => toast(String(e), "error"));
                }}
              >
                <TrashIcon size={15} />
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function BuildsTab({ runs, onChanged }: { runs: RunRow[]; onChanged: () => void }) {
  if (runs.length === 0) return <p className="muted">{t("Noch keine Builds.")}</p>;
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
                      toast(t("Build wird neu gestartet."), "info");
                      onChanged();
                    })
                    .catch((e) => toast(String(e), "error"))
                }
              >
                <RefreshIcon size={14} />{" "}{t("Neu starten")}
              </button>
            )}
            <button className="icon-btn" aria-label={t("Log öffnen")} data-tip={t("Log öffnen")} onClick={() => openUrl(r.htmlUrl)}>
              <GithubIcon size={15} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
