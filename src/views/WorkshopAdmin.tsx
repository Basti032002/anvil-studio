import { locale, t } from "../i18n";
import { useEffect, useState } from "react";
import { Toggle } from "../components/Chrome";
import { confirmDialog } from "../components/Overlay";
import McLoginDialog from "../components/McLogin";
import { CheckIcon, CloseIcon, DownloadIcon, PlayIcon, RefreshIcon, SearchIcon, StarIcon, TrashIcon, UserIcon } from "../icons";
import { toast } from "../state";
import { categoryLabel, fmtSize, useWorkshop, WsItem, wsApi, WsSettings, WsStats, wsUrl, youtubeEmbed } from "../workshop";
import { PlayDialog, StatusBadge } from "./Workshop";
import { pickSaveFile } from "../api";

type Filter = "pending" | "reported" | "blocked" | "rejected" | "public" | "all";
const REASONS = [
  t("Fremde Inhalte ohne Erlaubnis"),
  t("Schadcode oder verdächtige Dateien"),
  t("Unangemessene Inhalte"),
  t("Funktioniert nicht / startet nicht"),
  t("Spam oder Doppelter Upload"),
];

/** Workshop verwalten: prüfen, bearbeiten, sperren, löschen. */
export default function WorkshopAdmin() {
  const ws = useWorkshop();
  const [login, setLogin] = useState(false);
  if (!ws.profile)
    return (
      <div className="empty">
        <div className="empty-icon">
          <UserIcon size={24} />
        </div>
        <h2>{t("Mit Minecraft-Konto anmelden")}</h2>
        <p className="muted">{t("Den Workshop verwalten nur Admins, die im Workshop-Server eingetragen sind.")}</p>
        <button className="btn primary" onClick={() => setLogin(true)}>
          {t("Anmelden")}
        </button>
        {login && <McLoginDialog onClose={() => setLogin(false)} onDone={() => setLogin(false)} />}
      </div>
    );
  if (ws.me && !ws.me.admin)
    return (
      <div className="callout warn">
        {t("Angemeldet als {name} – dieses Konto ist kein Workshop-Admin. Trage den Namen in ADMIN_NAMES des Workshop-Servers ein.", { name: ws.profile.name })}
      </div>
    );
  return <Panel />;
}

function Panel() {
  const [filter, setFilter] = useState<Filter>("pending");
  const [q, setQ] = useState("");
  const [items, setItems] = useState<WsItem[] | null>(null);
  const [stats, setStats] = useState<WsStats | null>(null);
  const [settings, setSettings] = useState<WsSettings | null>(null);
  const [selId, setSelId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function load() {
    setError("");
    try {
      const [r, s] = await Promise.all([wsApi.adminItems(filter, q.trim()), wsApi.adminStats()]);
      setItems(r.items);
      setStats(s);
    } catch (e) {
      setError(String(e));
      setItems([]);
    }
  }
  useEffect(() => {
    const id = window.setTimeout(load, q ? 250 : 0);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, q]);
  useEffect(() => {
    wsApi.adminSettings().then(setSettings).catch(() => {});
  }, []);

  const saveSettings = (patch: Partial<WsSettings>) => {
    if (!settings) return;
    const next = { ...settings, ...patch };
    setSettings(next);
    wsApi
      .adminSettings(next)
      .then(setSettings)
      .catch((e) => toast(String(e), "error"));
  };

  const sel = items?.find((i) => i.id === selId) ?? null;
  const replace = (it: WsItem) => {
    setItems((list) => (list ? list.map((x) => (x.id === it.id ? it : x)) : list));
    wsApi.adminStats().then(setStats).catch(() => {});
  };

  const tabs: { id: Filter; label: string; n?: number }[] = [
    { id: "pending", label: t("Zu prüfen"), n: stats?.pending },
    { id: "reported", label: t("Gemeldet"), n: stats?.reported },
    { id: "blocked", label: t("Gesperrt"), n: stats?.blocked },
    { id: "rejected", label: t("Abgelehnt"), n: stats?.rejected },
    { id: "public", label: t("Öffentlich"), n: stats?.public },
    { id: "all", label: t("Alle") },
  ];

  return (
    <div className="wsa">
      <div className="wsa-stats">
        <div className="panel wsa-stat">
          <span className="muted">{t("Zu prüfen")}</span>
          <b style={{ color: "var(--warn)" }}>{stats?.pending ?? "–"}</b>
        </div>
        <div className="panel wsa-stat">
          <span className="muted">{t("Öffentlich")}</span>
          <b>{stats?.public ?? "–"}</b>
        </div>
        <div className="panel wsa-stat">
          <span className="muted">{t("Gesperrt")}</span>
          <b>{stats?.blocked ?? "–"}</b>
        </div>
        <div className="panel wsa-stat">
          <span className="muted">{t("Downloads (30 Tage)")}</span>
          <b>{stats ? stats.downloads30.toLocaleString(locale) : "–"}</b>
        </div>
      </div>

      {settings && (
        <div className="panel wsa-settings">
          <label className="row">
            <Toggle label={t("Neue Mods erst nach Freigabe sichtbar")} checked={settings.reviewMods} onChange={(v) => saveSettings({ reviewMods: v })} />
            <span>{t("Neue Mods erst nach Freigabe sichtbar")}</span>
          </label>
          <label className="row">
            <Toggle label={t("Neuer Quellcode erst nach Freigabe sichtbar")} checked={settings.reviewSource} onChange={(v) => saveSettings({ reviewSource: v })} />
            <span>{t("Neuer Quellcode erst nach Freigabe sichtbar")}</span>
          </label>
          <label className="row">
            <Toggle label={t("Auch neue Dateien bei Updates prüfen")} checked={settings.reviewUpdates} onChange={(v) => saveSettings({ reviewUpdates: v })} />
            <span>{t("Auch neue Dateien bei Updates prüfen")}</span>
          </label>
        </div>
      )}

      <div className="row wrap">
        <div className="ws-kind">
          {tabs.map((tb) => (
            <button key={tb.id} className={filter === tb.id ? "active" : ""} onClick={() => setFilter(tb.id)}>
              {tb.label}
              {tb.n !== undefined && tb.n > 0 && <span className="count">{tb.n}</span>}
            </button>
          ))}
        </div>
        <span className="grow" />
        <div className="search">
          <SearchIcon size={13} />
          <input placeholder={t("Name oder Autor …")} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t("Suchen")} />
        </div>
        <button className="icon-btn" onClick={load} aria-label={t("Aktualisieren")} data-tip={t("Aktualisieren")}>
          <RefreshIcon size={15} />
        </button>
      </div>

      {error && <div className="callout error">{error}</div>}

      <div className="ws-detail">
        <div className="ws-detail-main">
          <div className="panel wsa-table">
            {items === null ? (
              <div className="skeleton" />
            ) : items.length === 0 ? (
              <p className="muted pad">{filter === "pending" ? t("Nichts zu prüfen – alles erledigt.") : t("Keine Einträge.")}</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>{t("Projekt")}</th>
                    <th>{t("Art")}</th>
                    <th>{t("Status")}</th>
                    <th>{t("Datum")}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr key={it.id} className={it.id === selId ? "sel" : ""} onClick={() => setSelId(it.id)}>
                      <td>
                        <div className="row">
                          <span className="wsa-thumb">{it.images[0] || it.icon ? <img src={wsUrl(it.images[0] ?? it.icon)} alt="" /> : it.title.slice(0, 1)}</span>
                          <div>
                            <div style={{ fontWeight: 600 }}>
                              {it.title} {it.featured && <StarIcon size={12} />}
                            </div>
                            <div className="muted small">{it.owner.name}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="row gap-6">
                          {it.hasMod && <span className="ws-type mod">{t("Mod")}</span>}
                          {it.hasSource && <span className="ws-type src">{t("Quellcode")}</span>}
                        </span>
                      </td>
                      <td>
                        <span className="row gap-6">
                          <StatusBadge status={it.status} />
                          {!!it.reports && <span className="badge-mini">{t("{n} Meldungen", { n: it.reports })}</span>}
                        </span>
                      </td>
                      <td className="muted">{new Date(it.updatedAt * 1000).toLocaleDateString(locale)}</td>
                      <td>
                        {it.status === "pending" && (
                          <span className="row gap-6" style={{ justifyContent: "flex-end" }}>
                            <button
                              className="btn small primary"
                              onClick={(e) => {
                                e.stopPropagation();
                                wsApi
                                  .adminAction(it.id, "approve")
                                  .then((r) => {
                                    replace(r);
                                    toast(t("„{name}“ freigegeben.", { name: it.title }), "success");
                                  })
                                  .catch((er) => toast(String(er), "error"));
                              }}
                            >
                              <CheckIcon size={13} /> {t("Freigeben")}
                            </button>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
        <aside className="ws-detail-side">{sel ? <Editor key={sel.id} item={sel} onChanged={replace} onDeleted={() => (setSelId(null), load())} /> : <p className="muted small">{t("Wähle links einen Eintrag aus.")}</p>}</aside>
      </div>
    </div>
  );
}

/** Prüfung: alles sehen, was Nutzer sehen werden – und die Mod selbst spielen */
function Review({ item }: { item: WsItem }) {
  const [playing, setPlaying] = useState(false);
  const [zoom, setZoom] = useState<string | null>(null);
  const videos = (item.videos?.length ? item.videos : item.trailerUrl ? [item.trailerUrl] : []).map(youtubeEmbed).filter((x): x is string => !!x);
  const when = (s: number) => new Date(s * 1000).toLocaleString(locale);
  return (
    <div className="wsa-review">
      <div className="row gap-6 wrap">
        <button className="btn small primary" disabled={!item.hasMod} onClick={() => setPlaying(true)} data-tip={item.hasMod ? undefined : t("Nur Quellcode – nichts zum Spielen")}>
          <PlayIcon size={13} /> {t("Im Spiel testen")}
        </button>
        {item.hasSource && (
          <button
            className="btn small"
            onClick={async () => {
              const dest = await pickSaveFile(t("Quellcode speichern"), `${item.modId || "mod"}-quellcode.zip`, "zip", t("ZIP-Archiv"));
              if (!dest) return;
              wsApi
                .download(item.id, "source", dest)
                .then(() => toast(t("Quellcode gespeichert."), "success"))
                .catch((e) => toast(String(e), "error"));
            }}
          >
            <DownloadIcon size={13} /> {t("Quellcode herunterladen")}
          </button>
        )}
      </div>
      <div className="muted small">{t("„Im Spiel testen“ startet Minecraft mit genau dieser Fassung und allen Abhängigkeiten in einer eigenen Test-Instanz.")}</div>
      <div className="wsa-facts">
        <div className="wsa-fact">
          {t("Mod-Version")}
          <b>{item.modVersion || "–"}</b>
        </div>
        <div className="wsa-fact">
          Minecraft
          <b>{item.mcVersion || "–"}</b>
        </div>
        <div className="wsa-fact">
          {t("Mod-Datei")}
          <b>{item.hasMod ? fmtSize(item.modSize) : "–"}</b>
        </div>
        <div className="wsa-fact">
          {t("Quellcode")}
          <b>{item.hasSource ? fmtSize(item.sourceSize) : "–"}</b>
        </div>
        <div className="wsa-fact">
          {t("Lizenz")}
          <b>{item.license || "–"}</b>
        </div>
        <div className="wsa-fact">
          {t("Zuletzt geändert")}
          <b>{when(item.updatedAt)}</b>
        </div>
      </div>
      {(item.dependencies ?? []).length > 0 && (
        <div className="small">
          <span className="muted">{t("Braucht:")}</span> {item.dependencies!.map((d) => `${d.title}${d.available ? "" : ` (${t("nicht verfügbar")})`}`).join(", ")}
        </div>
      )}
      <div className="field-label">
        {t("Bilder")} <span className="muted">· {item.images.length ? t("das erste ist das Vorschaubild") : t("keine")}</span>
      </div>
      {item.images.length > 0 && (
        <div className="wsa-gallery">
          {item.images.map((p, i) => (
            <button key={p} onClick={() => setZoom(wsUrl(p))} aria-label={t("Bild {n} vergrößern", { n: i + 1 })}>
              <img src={wsUrl(p)} alt="" />
              {i === 0 && <span className="ws-pic-badge">{t("Vorschau")}</span>}
            </button>
          ))}
        </div>
      )}
      {videos.length > 0 && (
        <>
          <div className="field-label">{t("Videos")}</div>
          {videos.map((v) => (
            <div key={v} className="wsa-video">
              <iframe src={v} title={t("Video")} allow="encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
            </div>
          ))}
        </>
      )}
      <div className="field-label">{t("Kurzbeschreibung")}</div>
      <div className="small">{item.summary || <span className="muted">–</span>}</div>
      <div className="field-label">{t("Beschreibung")}</div>
      <div className="wsa-desc">{item.description || t("Keine Beschreibung.")}</div>
      {zoom && (
        <div className="wsa-lightbox" onClick={() => setZoom(null)}>
          <img src={zoom} alt="" />
        </div>
      )}
      {playing && <PlayDialog item={item} onClose={() => setPlaying(false)} />}
    </div>
  );
}

function Editor({ item, onChanged, onDeleted }: { item: WsItem; onChanged: (it: WsItem) => void; onDeleted: () => void }) {
  const [title, setTitle] = useState(item.title);
  const [summary, setSummary] = useState(item.summary);
  const [description, setDescription] = useState(item.description);
  const [reason, setReason] = useState(item.reason ?? "");
  const [allow, setAllow] = useState(item.allowResubmit !== false);
  const [busy, setBusy] = useState(false);
  const [reports, setReports] = useState<{ reporter: string; reason: string; createdAt: number; resolved: number }[]>([]);

  useEffect(() => {
    if (item.reports) wsApi.adminReports(item.id).then((r) => setReports(r.reports)).catch(() => {});
  }, [item.id, item.reports]);

  const run = async (fn: () => Promise<WsItem>, ok: string) => {
    setBusy(true);
    try {
      onChanged(await fn());
      toast(ok, "success");
    } catch (e) {
      toast(String(e), "error");
    } finally {
      setBusy(false);
    }
  };
  const dirty = title !== item.title || summary !== item.summary || description !== item.description;

  return (
    <div className="panel wsa-editor">
      <div className="row">
        <span className="wsa-thumb lg">{item.images[0] || item.icon ? <img src={wsUrl(item.images[0] ?? item.icon)} alt="" /> : item.title.slice(0, 1)}</span>
        <div className="grow">
          <div style={{ fontWeight: 700, fontSize: 15 }}>{item.title}</div>
          <div className="muted small">
            {item.owner.name} · {item.modVersion || "–"} · Minecraft {item.mcVersion || "–"}
          </div>
        </div>
        <StatusBadge status={item.status} />
      </div>
      {item.categories.length > 0 && <div className="muted small">{item.categories.map(categoryLabel).join(" · ")}</div>}
      <Review item={item} />
      <div className="field-label">{t("Texte bearbeiten")}</div>
      <label className="field">
        <span className="field-label">{t("Titel")}</span>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label className="field">
        <span className="field-label">{t("Kurzbeschreibung")}</span>
        <input className="input" value={summary} onChange={(e) => setSummary(e.target.value)} />
      </label>
      <label className="field">
        <span className="field-label">{t("Beschreibung")}</span>
        <textarea className="input textarea" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>
      {dirty && (
        <button className="btn small" disabled={busy} onClick={() => run(() => wsApi.adminPatch(item.id, { title, summary, description }), t("Gespeichert."))}>
          {t("Änderungen speichern")}
        </button>
      )}

      {reports.length > 0 && (
        <div className="wsa-reports">
          <div className="field-label">{t("Meldungen")}</div>
          {reports.map((r, i) => (
            <div key={i} className={r.resolved ? "wsa-report done" : "wsa-report"}>
              <b>{r.reporter}</b>: {r.reason}
            </div>
          ))}
          <button className="btn small ghost" onClick={() => run(() => wsApi.adminAction(item.id, "dismiss-reports"), t("Meldungen erledigt."))}>
            {t("Meldungen als erledigt markieren")}
          </button>
        </div>
      )}

      <div className="wsa-block">
        <div className="field-label">{t("Begründung – sieht der Ersteller in „Meine Uploads“")}</div>
        <div className="row gap-6 wrap">
          {REASONS.map((r) => (
            <button key={r} className="ws-cat" onClick={() => setReason(reason ? `${reason}\n${r}` : r)}>
              {r}
            </button>
          ))}
        </div>
        <textarea className="input textarea" rows={3} value={reason} placeholder={t("Was muss der Ersteller ändern?")} onChange={(e) => setReason(e.target.value)} />
        <label className="row gap-6">
          <input type="checkbox" checked={allow} onChange={(e) => setAllow(e.target.checked)} />
          <span className="small">{t("Erneutes Einreichen erlauben")}</span>
        </label>
      </div>

      <div className="row gap-6 wrap">
        {item.status !== "public" && (
          <button className="btn small primary" disabled={busy} onClick={() => run(() => wsApi.adminAction(item.id, "approve"), t("Freigegeben."))}>
            <CheckIcon size={13} /> {t("Freigeben")}
          </button>
        )}
        {item.status === "pending" && (
          <button className="btn small" disabled={busy || !reason.trim()} onClick={() => run(() => wsApi.adminAction(item.id, "reject", reason, true), t("Abgelehnt."))}>
            <CloseIcon size={12} /> {t("Ablehnen")}
          </button>
        )}
        {item.status === "blocked" ? (
          <button className="btn small" disabled={busy} onClick={() => run(() => wsApi.adminAction(item.id, "unblock"), t("Entsperrt."))}>
            {t("Entsperren")}
          </button>
        ) : (
          <button className="btn small danger" disabled={busy || !reason.trim()} onClick={() => run(() => wsApi.adminAction(item.id, "block", reason, allow), t("Gesperrt."))}>
            {t("Sperren")}
          </button>
        )}
        {item.status === "blocked" && reason !== (item.reason ?? "") && (
          <button className="btn small" disabled={busy} onClick={() => run(() => wsApi.adminPatch(item.id, { reason, allowResubmit: allow }), t("Begründung gespeichert."))}>
            {t("Begründung speichern")}
          </button>
        )}
        <button className="btn small ghost" disabled={busy} onClick={() => run(() => wsApi.adminAction(item.id, "feature", "", true, !item.featured), item.featured ? t("Nicht mehr empfohlen.") : t("Wird jetzt empfohlen."))}>
          <StarIcon size={13} /> {item.featured ? t("Nicht mehr empfehlen") : t("Empfehlen")}
        </button>
      </div>
      <button
        className="btn small danger ghost"
        disabled={busy}
        onClick={async () => {
          if (!(await confirmDialog(t("„{name}“ endgültig löschen?", { name: item.title }), t("Alle Dateien werden vom Server gelöscht. Das lässt sich nicht rückgängig machen."), t("Löschen"), t("Abbrechen"), true))) return;
          wsApi
            .remove(item.id)
            .then(() => {
              toast(t("Gelöscht."), "success");
              onDeleted();
            })
            .catch((e) => toast(String(e), "error"));
        }}
      >
        <TrashIcon size={13} /> {t("Endgültig löschen")}
      </button>
    </div>
  );
}
