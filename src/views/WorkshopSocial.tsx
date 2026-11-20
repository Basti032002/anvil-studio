import { locale, t } from "../i18n";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "../state";
import { useWorkshop, WsComment, WsItem, wsApi, WsNotification, wsUrl } from "../workshop";
import { ArrowLeftIcon, BellIcon, CheckIcon, ChatIcon, CloseIcon, DownloadIcon, PlusIcon, SearchIcon, StarFillIcon, TrashIcon } from "../icons";

// ---- Sterne ------------------------------------------------------------------------

export function Stars({ value, size = 13 }: { value: number; size?: number }) {
  return (
    <span className="ws-stars" aria-label={t("{n} von 5 Sternen", { n: value.toLocaleString(locale) })}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={value >= i - 0.25 ? "on" : value >= i - 0.75 ? "half" : ""}>
          <StarFillIcon size={size} />
        </span>
      ))}
    </span>
  );
}

export function RatingSummary({ item }: { item: WsItem }) {
  const r = item.rating;
  if (!r || r.count === 0) return <span className="muted small">{t("Noch keine Bewertung")}</span>;
  return (
    <span className="row gap-6 small">
      <Stars value={r.avg} />
      <span className="muted">
        {r.avg.toLocaleString(locale, { minimumFractionDigits: 1 })} · {t("{n} Bewertungen", { n: r.count })}
      </span>
    </span>
  );
}

/** Eigene Bewertung abgeben (1–5 Sterne, erneuter Klick auf denselben Stern entfernt sie) */
export function RateBox({ item, own, onChange, withLogin }: { item: WsItem; own: boolean; onChange: (i: WsItem) => void; withLogin: (reason: string, then: () => void) => void }) {
  const [hover, setHover] = useState(0);
  const [busy, setBusy] = useState(false);
  if (own || (item.status ?? "public") !== "public") return null;
  const mine = item.myRating ?? 0;
  const shown = hover || mine;
  const rate = (stars: number) =>
    withLogin(t("Zum Bewerten brauchst du dein Minecraft-Konto."), async () => {
      setBusy(true);
      try {
        onChange(await wsApi.rate(item.id, stars === mine ? 0 : stars));
      } catch (e) {
        toast(String(e), "error");
      } finally {
        setBusy(false);
      }
    });
  return (
    <div className="ws-rate">
      <span className="muted small">{mine ? t("Deine Bewertung") : t("Bewerten")}</span>
      <div className="ws-rate-stars" onMouseLeave={() => setHover(0)} role="radiogroup" aria-label={t("Bewertung")}>
        {[1, 2, 3, 4, 5].map((i) => (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={mine === i}
            disabled={busy}
            className={shown >= i ? "on" : ""}
            aria-label={t("{n} Sterne", { n: i })}
            onMouseEnter={() => setHover(i)}
            onClick={() => rate(i)}
          >
            <StarFillIcon size={18} />
          </button>
        ))}
      </div>
    </div>
  );
}

// ---- Abonnieren --------------------------------------------------------------------

export function SubscribeButton({ item, onChange, withLogin }: { item: WsItem; onChange: (i: WsItem) => void; withLogin: (reason: string, then: () => void) => void }) {
  const [busy, setBusy] = useState(false);
  if ((item.status ?? "public") !== "public") return null;
  const on = !!item.subscribed;
  const toggle = () =>
    withLogin(t("Zum Abonnieren brauchst du dein Minecraft-Konto."), async () => {
      setBusy(true);
      try {
        const r = await wsApi.subscribe(item.id, !on);
        onChange({ ...item, ...r });
        toast(on ? t("Abo beendet.") : t("Abonniert – neue Versionen werden automatisch geladen."), "success");
      } catch (e) {
        toast(String(e), "error");
      } finally {
        setBusy(false);
      }
    });
  return (
    <button className={on ? "btn full active-soft" : "btn full"} disabled={busy} onClick={toggle} aria-pressed={on}>
      {on ? <CheckIcon size={14} /> : <PlusIcon size={14} />} {on ? t("Abonniert") : t("Abonnieren")}
      {!!item.subscribers && <span className="muted small"> · {item.subscribers}</span>}
    </button>
  );
}

// ---- Abhängigkeiten ----------------------------------------------------------------

export function DependencyList({ item, onOpen }: { item: WsItem; onOpen: (id: string) => void }) {
  const deps = item.dependencies ?? [];
  if (deps.length === 0) return null;
  return (
    <div className="ws-deps">
      <div className="ws-deps-title">{t("Benötigt")}</div>
      {deps.map((d) => (
        <button key={d.id} type="button" className="ws-dep" onClick={() => onOpen(d.id)}>
          <span className="grow">{d.title}</span>
          {d.available ? <span className="muted small">{t("wird mitgeladen")}</span> : <span className="ws-status blocked">{t("nicht verfügbar")}</span>}
        </button>
      ))}
    </div>
  );
}

/** Beim Hochladen: andere Workshop-Mods als Abhängigkeit wählen */
export function DependencyPicker({ value, onChange, selfId }: { value: { id: string; title: string }[]; onChange: (v: { id: string; title: string }[]) => void; selfId?: string }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<WsItem[]>([]);
  useEffect(() => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    const h = window.setTimeout(() => {
      wsApi
        .list("mod", q.trim())
        .then((r) => setResults(r.items.filter((i) => i.id !== selfId && !value.some((v) => v.id === i.id)).slice(0, 6)))
        .catch(() => setResults([]));
    }, 250);
    return () => window.clearTimeout(h);
  }, [q, selfId, value]);
  return (
    <div className="ws-dep-picker">
      {value.map((d) => (
        <span key={d.id} className="chip">
          {d.title}
          <button type="button" aria-label={t("Entfernen")} onClick={() => onChange(value.filter((x) => x.id !== d.id))}>
            <CloseIcon size={10} />
          </button>
        </span>
      ))}
      <div className="search">
        <SearchIcon size={13} />
        <input placeholder={t("Workshop-Mod suchen …")} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t("Abhängigkeit suchen")} />
      </div>
      {results.length > 0 && (
        <div className="ws-dep-results">
          {results.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => {
                onChange([...value, { id: r.id, title: r.title }].slice(0, 10));
                setQ("");
              }}
            >
              <PlusIcon size={12} /> {r.title} <span className="muted small">· {r.owner.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- Kommentare --------------------------------------------------------------------

const ago = (s: number) => {
  const d = Math.max(0, Date.now() / 1000 - s);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (d < 60) return rtf.format(0, "second");
  if (d < 3600) return rtf.format(-Math.floor(d / 60), "minute");
  if (d < 86400) return rtf.format(-Math.floor(d / 3600), "hour");
  if (d < 86400 * 30) return rtf.format(-Math.floor(d / 86400), "day");
  return new Date(s * 1000).toLocaleDateString(locale);
};

export function Comments({ item, withLogin }: { item: WsItem; withLogin: (reason: string, then: () => void) => void }) {
  const ws = useWorkshop();
  const [list, setList] = useState<WsComment[] | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    wsApi
      .comments(item.id)
      .then((r) => setList(r.comments))
      .catch(() => setList([]));
  }, [item.id, ws.me?.uuid]);
  if ((item.status ?? "public") !== "public") return null;

  const send = () =>
    withLogin(t("Zum Kommentieren brauchst du dein Minecraft-Konto."), async () => {
      if (!text.trim()) return;
      setBusy(true);
      try {
        const c = await wsApi.addComment(item.id, text.trim());
        setList((l) => [c, ...(l ?? [])]);
        setText("");
      } catch (e) {
        toast(String(e), "error");
      } finally {
        setBusy(false);
      }
    });

  return (
    <section className="panel ws-comments">
      <h2>
        <ChatIcon size={16} /> {t("Kommentare")} {list && list.length > 0 && <span className="muted">({list.length})</span>}
      </h2>
      <div className="ws-comment-form">
        <textarea
          className="input"
          rows={2}
          maxLength={1000}
          placeholder={ws.profile ? t("Was meinst du zu dieser Mod?") : t("Melde dich an, um zu kommentieren.")}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) send();
          }}
        />
        <button className={busy ? "btn primary loading" : "btn primary"} disabled={busy || (!!ws.profile && !text.trim())} onClick={send}>
          {t("Senden")}
        </button>
      </div>
      {list === null ? (
        <div className="skeleton" style={{ height: 60 }} />
      ) : list.length === 0 ? (
        <div className="muted small">{t("Noch keine Kommentare – schreib den ersten.")}</div>
      ) : (
        <ul className="ws-comment-list">
          {list.map((c) => (
            <li key={c.id}>
              <div className="row gap-6">
                <b>{c.author.name}</b>
                {c.author.uuid === item.owner.uuid && <span className="badge-mini">{t("Ersteller")}</span>}
                <span className="muted small">{ago(c.createdAt)}</span>
                <span className="grow" />
                {c.canDelete && (
                  <button
                    className="icon-btn"
                    aria-label={t("Kommentar löschen")}
                    data-tip={t("Kommentar löschen")}
                    onClick={() =>
                      wsApi
                        .deleteComment(c.id)
                        .then(() => setList((l) => (l ?? []).filter((x) => x.id !== c.id)))
                        .catch((e) => toast(String(e), "error"))
                    }
                  >
                    <TrashIcon size={13} />
                  </button>
                )}
              </div>
              <div className="ws-comment-text">{c.text}</div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---- Benachrichtigungen ------------------------------------------------------------

function notificationText(n: WsNotification): { title: string; body: string; tone: "ok" | "warn" | "info" } {
  switch (n.kind) {
    case "approved":
      return { title: t("„{name}“ wurde freigegeben", { name: n.title }), body: t("Dein Upload ist jetzt für alle sichtbar."), tone: "ok" };
    case "rejected":
      return { title: t("„{name}“ wurde abgelehnt", { name: n.title }), body: n.text, tone: "warn" };
    case "blocked":
      return { title: t("„{name}“ wurde gesperrt", { name: n.title }), body: n.text, tone: "warn" };
    case "unblocked":
      return { title: t("„{name}“ ist wieder freigegeben", { name: n.title }), body: "", tone: "ok" };
    case "featured":
      return { title: t("„{name}“ wird jetzt empfohlen", { name: n.title }), body: t("Dein Upload steht oben auf der Workshop-Startseite."), tone: "ok" };
    case "deleted":
      return { title: t("„{name}“ wurde vom Team gelöscht", { name: n.title }), body: n.text, tone: "warn" };
    case "comment":
      return { title: t("Neuer Kommentar zu „{name}“", { name: n.title }), body: n.text, tone: "info" };
    case "update":
      return { title: t("Neue Version von „{name}“", { name: n.title }), body: n.text ? t("Version {v} – wird beim nächsten Spielen automatisch geladen.", { v: n.text }) : t("Wird beim nächsten Spielen automatisch geladen."), tone: "info" };
    default:
      return { title: n.title, body: n.text, tone: "info" };
  }
}

export function NotificationBell({ onOpen }: { onOpen: (itemId: string) => void }) {
  const ws = useWorkshop();
  const [data, setData] = useState<{ unread: number; items: WsNotification[] } | null>(null);
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const load = () =>
    wsApi
      .notifications()
      .then(setData)
      .catch(() => {});
  useEffect(() => {
    if (!ws.me) return;
    load();
    const h = window.setInterval(load, 120_000);
    return () => window.clearInterval(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ws.me?.uuid]);
  if (!ws.me) return null;

  const toggle = () => {
    setOpen((o) => !o);
    if (!open && data?.unread) wsApi.readNotifications().catch(() => {});
  };
  const rect = btn.current?.getBoundingClientRect();
  return (
    <>
      <button ref={btn} className="icon-btn ws-bell" aria-label={t("Benachrichtigungen")} data-tip={t("Benachrichtigungen")} onClick={toggle} aria-expanded={open}>
        <BellIcon size={16} />
        {!!data?.unread && <span className="ws-bell-count">{data.unread > 9 ? "9+" : data.unread}</span>}
      </button>
      {open &&
        rect &&
        createPortal(
          <div
            className="ws-notify-overlay"
            onMouseDown={() => {
              setOpen(false);
              if (data) setData({ ...data, unread: 0, items: data.items.map((i) => ({ ...i, read: true })) });
            }}
          >
            <div className="ws-notify" style={{ top: rect.bottom + 6, right: Math.max(8, window.innerWidth - rect.right) }} onMouseDown={(e) => e.stopPropagation()}>
              <div className="ws-notify-head">{t("Benachrichtigungen")}</div>
              {!data || data.items.length === 0 ? (
                <div className="muted small" style={{ padding: 16 }}>
                  {t("Noch nichts Neues.")}
                </div>
              ) : (
                <ul>
                  {data.items.map((n) => {
                    const v = notificationText(n);
                    return (
                      <li key={n.id} className={n.read ? "" : "unread"}>
                        <button
                          type="button"
                          disabled={n.kind === "deleted" || !n.itemId}
                          onClick={() => {
                            setOpen(false);
                            onOpen(n.itemId);
                          }}
                        >
                          <span className={`ws-notify-dot ${v.tone}`} />
                          <span className="grow">
                            <span className="ws-notify-title">{v.title}</span>
                            {v.body && <span className="ws-notify-body">{v.body}</span>}
                            <span className="muted small">{ago(n.createdAt)}</span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

// ---- Abonniert ---------------------------------------------------------------------

export function Subscriptions({ onBack, onOpen }: { onBack: () => void; onOpen: (id: string) => void }) {
  const [items, setItems] = useState<WsItem[] | null>(null);
  const [error, setError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const load = () =>
    wsApi
      .subscriptions()
      .then((r) => setItems(r.items))
      .catch((e) => setError(String(e)));
  useEffect(() => {
    load();
  }, []);
  const outdated = items?.filter((i) => i.hasMod && !i.installed).length ?? 0;
  const sync = async () => {
    setSyncing(true);
    try {
      const n = await wsApi.syncSubscriptions();
      toast(n ? t("{n} Mods aktualisiert.", { n }) : t("Alles ist auf dem neuesten Stand."), "success");
      await load();
    } catch (e) {
      toast(String(e), "error");
    } finally {
      setSyncing(false);
    }
  };
  return (
    <>
      <button className="btn ghost back" onClick={onBack}>
        <ArrowLeftIcon size={14} /> {t("Workshop")}
      </button>
      <header className="page-header">
        <div>
          <h1>{t("Abonniert")}</h1>
          <p className="muted">{t("Neue Versionen deiner abonnierten Mods lädt Anvil Studio automatisch – beim Start und vor dem Spielen.")}</p>
        </div>
        {outdated > 0 && (
          <button className={syncing ? "btn primary loading" : "btn primary"} disabled={syncing} onClick={sync}>
            <DownloadIcon size={14} /> {t("{n} Updates laden", { n: outdated })}
          </button>
        )}
      </header>
      {error && <div className="callout error">{error}</div>}
      {items === null ? (
        <div className="skeleton" style={{ height: 160 }} />
      ) : items.length === 0 ? (
        <div className="empty">
          <h2>{t("Noch keine Abos")}</h2>
          <p className="muted">{t("Öffne eine Mod im Workshop und klicke auf „Abonnieren“.")}</p>
        </div>
      ) : (
        <div className="ws-mine">
          {items.map((it) => (
            <button key={it.id} className="panel ws-sub-row" onClick={() => onOpen(it.id)}>
              {it.icon ? <img className="ws-icon" src={wsUrl(it.icon)} alt="" /> : <span className="ws-icon letter">{it.title.slice(0, 1)}</span>}
              <span className="grow">
                <b>{it.title}</b>
                <span className="muted small">
                  {" "}
                  · {t("von {name}", { name: it.owner.name })} · {it.modVersion || "–"} · {t("aktualisiert {when}", { when: ago(it.updatedAt) })}
                </span>
              </span>
              {it.hasMod && (it.installed ? <span className="ws-status public">{t("Aktuell")}</span> : <span className="ws-status pending">{t("Update verfügbar")}</span>)}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

/** Einmal pro App-Start: abonnierte Mods im Hintergrund aktualisieren */
let synced = false;
export function useSubscriptionSync() {
  const ws = useWorkshop();
  useEffect(() => {
    if (!ws.me || synced) return;
    synced = true;
    wsApi
      .syncSubscriptions()
      .then((n) => n > 0 && toast(t("{n} abonnierte Mods aktualisiert.", { n }), "info"))
      .catch(() => {});
  }, [ws.me]);
}
