import { locale, t } from "../i18n";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, exportApi, ModSettings, modSettingsApi, pickSaveFile, Project } from "../api";
import { confirmDialog, openMenu } from "../components/Overlay";
import McLoginDialog from "../components/McLogin";
import Markdown from "../components/Markdown";
import { Comments, DependencyList, DependencyPicker, NotificationBell, RateBox, RatingSummary, SubscribeButton, Subscriptions, Stars, useSubscriptionSync } from "./WorkshopSocial";
import {
  AlertIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  BellIcon,
  StarIcon,
  CheckIcon,
  CloseIcon,
  CodeIcon,
  DownloadIcon,
  ExternalIcon,
  FolderOpenIcon,
  ImageIcon,
  LogoutIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  RefreshIcon,
  SearchIcon,
  TrashIcon,
  UploadIcon,
  UserIcon,
  WorkshopIcon,
} from "../icons";
import { toast, useSettings } from "../state";
import { CATEGORIES, categoryLabel, fmtSize, mcLogout, McProfile, refreshMe, useWorkshop, WsItem, wsApi, wsUrl, youtubeEmbed } from "../workshop";

type Pic = { key: string; old?: number; path?: string; src: string };
type Route = { page: "home" } | { page: "item"; id: string } | { page: "upload"; item?: WsItem } | { page: "mine" } | { page: "subs" };
const MC_VERSIONS = ["1.21.1", "1.21.4", "1.21.8", "1.21.10"];

export default function Workshop({ projects, onOpenProject }: { projects: Project[]; onOpenProject: (p: Project) => void }) {
  const [route, setRoute] = useState<Route>({ page: "home" });
  const [login, setLogin] = useState<{ reason: string; then: (p: McProfile) => void } | null>(null);
  const ws = useWorkshop();
  const settings = useSettings();
  useSubscriptionSync();
  // Angemeldet, aber Workshop-Konto fehlt (z. B. Server war beim Start nicht erreichbar) → nachholen
  useEffect(() => {
    if (ws.profile && !ws.me) refreshMe();
  }, [ws.profile, ws.me, route.page]);

  /** Aktion, die eine Anmeldung braucht */
  const withLogin = (reason: string, then: (p: McProfile) => void) => {
    if (ws.profile) then(ws.profile);
    else setLogin({ reason, then });
  };

  return (
    <div className="page workshop">
      {settings?.workshopEnabled === false && (
        <div className="callout warn ws-off-banner">
          <AlertIcon size={16} />
          <div className="grow small">{t("Der Workshop ist für Nutzer ausgeschaltet – du siehst ihn nur, weil du Admin bist. Einschalten im Entwicklerbereich → Workshop.")}</div>
        </div>
      )}
      {route.page === "subs" && <Subscriptions onBack={() => setRoute({ page: "home" })} onOpen={(id) => setRoute({ page: "item", id })} />}
      {route.page === "home" && <Home onSubs={() => withLogin(t("Melde dich an, um deine Abos zu sehen."), () => setRoute({ page: "subs" }))} onOpen={(id) => setRoute({ page: "item", id })} onUpload={() => withLogin(t("Zum Hochladen brauchst du dein Minecraft-Konto."), () => setRoute({ page: "upload" }))} onMine={() => withLogin(t("Melde dich an, um deine Uploads zu sehen."), () => setRoute({ page: "mine" }))} onLogin={() => setLogin({ reason: "", then: () => {} })} />}
      {route.page === "item" && (
        <ItemPage
          id={route.id}
          onBack={() => setRoute({ page: "home" })}
          onOpen={(id) => setRoute({ page: "item", id })}
          withLogin={withLogin}
          onOpenProject={onOpenProject}
          onEdit={(item) => setRoute({ page: "upload", item })}
        />
      )}
      {route.page === "upload" && <UploadPage projects={projects} item={route.item} onBack={() => setRoute(route.item ? { page: "mine" } : { page: "home" })} onDone={() => setRoute({ page: "mine" })} />}
      {route.page === "mine" && <MyUploads onBack={() => setRoute({ page: "home" })} onOpen={(id) => setRoute({ page: "item", id })} onEdit={(item) => setRoute({ page: "upload", item })} onUpload={() => setRoute({ page: "upload" })} />}
      {login && (
        <McLoginDialog
          reason={login.reason || undefined}
          onClose={() => setLogin(null)}
          onDone={(p) => {
            const then = login.then;
            setLogin(null);
            then(p);
          }}
        />
      )}
    </div>
  );
}

// ---- Bausteine -------------------------------------------------------------------

function Cover({ item, height }: { item: WsItem; height: number }) {
  const src = wsUrl(item.images[0] ?? item.icon);
  return (
    <div className="ws-cover" style={{ height }}>
      {src ? <img src={src} alt="" loading="lazy" /> : <span className="ws-cover-letter">{item.title.slice(0, 1).toUpperCase()}</span>}
    </div>
  );
}

function TypeBadges({ item }: { item: WsItem }) {
  return (
    <>
      {item.hasMod && <span className="ws-type mod">{t("Mod")}</span>}
      {item.hasSource && <span className="ws-type src">{t("Quellcode")}</span>}
    </>
  );
}

export function StatusBadge({ status }: { status?: string }) {
  if (!status) return null;
  const label = { pending: t("Wartet auf Prüfung"), public: t("Veröffentlicht"), rejected: t("Abgelehnt"), blocked: t("Gesperrt") }[status] ?? status;
  return <span className={`ws-status ${status}`}>{label}</span>;
}

function AccountChip({ onLogin }: { onLogin: () => void }) {
  const ws = useWorkshop();
  if (!ws.profile)
    return (
      <button className="btn" onClick={onLogin}>
        <UserIcon size={14} /> {t("Anmelden")}
      </button>
    );
  return (
    <button
      className="ws-account"
      onClick={(e) => openMenu(e, [{ label: t("Abmelden"), icon: <LogoutIcon size={15} />, onClick: () => mcLogout().then(() => toast(t("Abgemeldet."), "info")) }])}
      onContextMenu={(e) => openMenu(e, [{ label: t("Abmelden"), icon: <LogoutIcon size={15} />, onClick: () => mcLogout().then(() => toast(t("Abgemeldet."), "info")) }])}
      aria-label={t("Konto: {name}", { name: ws.profile.name })}
    >
      {ws.profile.kind !== "xbox" && <img src={`https://mc-heads.net/avatar/${ws.profile.uuid}/24`} alt="" onError={(e) => (e.currentTarget.style.visibility = "hidden")} />}
      <span>{ws.profile.name}</span>
      {ws.me?.admin && <span className="badge-mini">{t("Admin")}</span>}
    </button>
  );
}

function Unreachable({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="callout warn">
      <AlertIcon size={18} />
      <div className="grow">
        <div className="callout-title">{t("Workshop nicht erreichbar")}</div>
        <div className="muted small" style={{ userSelect: "text" }}>
          {error}
        </div>
      </div>
      <button className="btn small" onClick={onRetry}>
        <RefreshIcon size={13} /> {t("Erneut versuchen")}
      </button>
    </div>
  );
}

// ---- Startseite ------------------------------------------------------------------

/** Karte für einen Workshop-Eintrag */
export function WsCard({ item: it, onOpen, compact }: { item: WsItem; onOpen: (id: string) => void; compact?: boolean }) {
  return (
    <button className={compact ? "ws-card compact" : "ws-card"} onClick={() => onOpen(it.id)}>
      <div className="ws-card-media">
        <Cover item={it} height={compact ? 112 : 150} />
        <div className="ws-card-badges">
          <TypeBadges item={it} />
        </div>
        {it.icon && <img className="ws-card-icon" src={wsUrl(it.icon)} alt="" />}
      </div>
      <div className="ws-card-body">
        <div className="ws-card-title">{it.title}</div>
        <div className="ws-card-author">
          <img src={`https://mc-heads.net/avatar/${it.owner.uuid}/16`} alt="" loading="lazy" />
          <span className="muted small">{it.owner.name}</span>
        </div>
        {!compact && <div className="ws-card-summary">{it.summary || t("Keine Kurzbeschreibung.")}</div>}
        <div className="ws-card-foot">
          <span className="row gap-4">
            <DownloadIcon size={12} /> {it.downloads.toLocaleString(locale)}
          </span>
          {!!it.rating?.count && (
            <span className="row gap-4">
              <Stars value={it.rating.avg} size={11} /> <span>{it.rating.avg.toFixed(1)}</span>
            </span>
          )}
          <span className="grow" />
          {it.mcVersion && <span className="ws-ver">{it.mcVersion}</span>}
        </div>
      </div>
    </button>
  );
}

function Shelf({ title, desc, items, onOpen, onMore }: { title: string; desc?: string; items: WsItem[]; onOpen: (id: string) => void; onMore?: () => void }) {
  if (!items.length) return null;
  return (
    <section className="ws-shelf">
      <div className="ws-shelf-head">
        <div>
          <h2>{title}</h2>
          {desc && <div className="muted small">{desc}</div>}
        </div>
        <span className="grow" />
        {onMore && (
          <button className="link-btn" onClick={onMore}>
            {t("Alle anzeigen")} <ArrowRightIcon size={12} />
          </button>
        )}
      </div>
      <div className="ws-shelf-row">
        {items.map((it) => (
          <WsCard key={it.id} item={it} onOpen={onOpen} />
        ))}
      </div>
    </section>
  );
}

function Spotlight({ items, onOpen }: { items: WsItem[]; onOpen: (id: string) => void }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (items.length < 2) return;
    const h = window.setInterval(() => setI((x) => (x + 1) % items.length), 7000);
    return () => window.clearInterval(h);
  }, [items.length]);
  const it = items[i % items.length];
  if (!it) return null;
  return (
    <div className="ws-spot">
      <button className="ws-spot-main" onClick={() => onOpen(it.id)}>
        <div className="ws-spot-media">
          <Cover item={it} height={300} />
          <div className="ws-spot-shade" />
        </div>
        <div className="ws-spot-body">
          <span className="ws-featured-tag">{t("Empfohlen")}</span>
          <div className="row">
            {it.icon && <img className="ws-icon lg" src={wsUrl(it.icon)} alt="" />}
            <div>
              <div className="ws-spot-title">{it.title}</div>
              <div className="ws-spot-sub">
                {t("von {name}", { name: it.owner.name })} · Minecraft {it.mcVersion}
              </div>
            </div>
          </div>
          <p className="ws-spot-summary">{it.summary}</p>
          <div className="row gap-6 wrap">
            {it.categories.map((c) => (
              <span key={c} className="ws-chip-dark">
                {categoryLabel(c)}
              </span>
            ))}
            <span className="ws-chip-dark">
              <DownloadIcon size={11} /> {it.downloads.toLocaleString(locale)}
            </span>
            {!!it.rating?.count && (
              <span className="ws-chip-dark">
                <StarIcon size={11} /> {it.rating.avg.toFixed(1)}
              </span>
            )}
          </div>
        </div>
      </button>
      {items.length > 1 && (
        <div className="ws-spot-dots">
          {items.map((x, j) => (
            <button key={x.id} className={j === i % items.length ? "on" : ""} onClick={() => setI(j)} aria-label={x.title} />
          ))}
        </div>
      )}
    </div>
  );
}

function Home({ onOpen, onUpload, onMine, onLogin, onSubs }: { onOpen: (id: string) => void; onUpload: () => void; onMine: () => void; onLogin: () => void; onSubs: () => void }) {
  const [kind, setKind] = useState<"mod" | "source">(() => (localStorage.getItem("anvil.ws.kind") === "source" ? "source" : "mod"));
  const [q, setQ] = useState("");
  const [mc, setMc] = useState("");
  const [cat, setCat] = useState("");
  const [sort, setSort] = useState("");
  const [items, setItems] = useState<WsItem[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const [shelves, setShelves] = useState<{ fresh: WsItem[]; top: WsItem[] } | null>(null);
  const [stats, setStats] = useState<{ mods: number; sources: number; downloads: number; creators: number } | null>(null);
  const req = useRef(0);
  const browsing = !!(q.trim() || cat || mc || sort);

  async function load() {
    const n = ++req.current;
    setError("");
    try {
      const r = await wsApi.list(kind, q.trim(), mc, cat, sort);
      if (n !== req.current) return;
      setItems(r.items);
      setTotal(r.total);
    } catch (e) {
      if (n !== req.current) return;
      setError(String(e));
      setItems([]);
    }
  }
  useEffect(() => {
    localStorage.setItem("anvil.ws.kind", kind);
    const id = window.setTimeout(load, q ? 250 : 0);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, q, mc, cat, sort]);
  useEffect(() => {
    setShelves(null);
    Promise.all([wsApi.list(kind, "", "", "", "new", 0, { limit: 4 }), wsApi.list(kind, "", "", "", "rating", 0, { limit: 8 })])
      .then(([a, b]) => setShelves({ fresh: a.items, top: b.items.filter((x) => (x.rating?.count ?? 0) > 0).slice(0, 4) }))
      .catch(() => setShelves({ fresh: [], top: [] }));
    wsApi.publicStats().then(setStats).catch(() => {});
  }, [kind]);

  const featured = (items ?? []).filter((i) => i.featured);
  const popular = (items ?? []).filter((i) => !i.featured).slice(0, 4);
  const big = (n: number) => (n >= 10000 ? `${(n / 1000).toFixed(n >= 100000 ? 0 : 1)}k` : n.toLocaleString(locale));

  return (
    <>
      <header className="ws-hero">
        <div className="ws-hero-bg" />
        <div className="ws-hero-top">
          <div className="eyebrow">{t("Community")}</div>
          <span className="grow" />
          <NotificationBell onOpen={onOpen} />
          <AccountChip onLogin={onLogin} />
        </div>
        <h1>{t("Workshop")}</h1>
        <p className="ws-hero-text">{t("Mods aus der Community spielen – oder den Quellcode holen und selbst weiterbauen.")}</p>
        <div className="ws-hero-search">
          <SearchIcon size={16} />
          <label htmlFor="wsq" className="sr-only">
            {t("Workshop durchsuchen")}
          </label>
          <input id="wsq" placeholder={t("Mods, Ersteller oder Stichworte suchen …")} value={q} onChange={(e) => setQ(e.target.value)} />
          {q && (
            <button className="icon-btn" onClick={() => setQ("")} aria-label={t("Suche leeren")}>
              <CloseIcon size={12} />
            </button>
          )}
        </div>
        <div className="ws-hero-foot">
          {stats && (
            <div className="ws-stats">
              <span>
                <b>{big(stats.mods)}</b> {t("Mods")}
              </span>
              <span>
                <b>{big(stats.sources)}</b> {t("Quellcode-Projekte")}
              </span>
              <span>
                <b>{big(stats.downloads)}</b> {t("Downloads")}
              </span>
              <span>
                <b>{big(stats.creators)}</b> {t("Ersteller")}
              </span>
            </div>
          )}
          <span className="grow" />
          <button className="btn" onClick={onSubs}>
            <BellIcon size={13} /> {t("Abonniert")}
          </button>
          <button className="btn" onClick={onMine}>
            <UserIcon size={13} /> {t("Meine Uploads")}
          </button>
          <button className="btn primary" onClick={onUpload}>
            <UploadIcon size={14} /> {t("Hochladen")}
          </button>
        </div>
      </header>

      <div className="ws-toolbar">
        <div className="ws-kind" role="tablist" aria-label={t("Art")}>
          <button role="tab" aria-selected={kind === "mod"} className={kind === "mod" ? "active" : ""} onClick={() => setKind("mod")}>
            <PlayIcon size={13} /> {t("Mods zum Spielen")}
          </button>
          <button role="tab" aria-selected={kind === "source"} className={kind === "source" ? "active" : ""} onClick={() => setKind("source")}>
            <CodeIcon size={14} /> {t("Quellcode zum Bearbeiten")}
          </button>
        </div>
        <span className="grow" />
        <select className="input" value={mc} onChange={(e) => setMc(e.target.value)} aria-label={t("Minecraft-Version")}>
          <option value="">{t("Alle Versionen")}</option>
          {MC_VERSIONS.map((v) => (
            <option key={v} value={v}>
              Minecraft {v}
            </option>
          ))}
        </select>
        <select className="input" value={sort} onChange={(e) => setSort(e.target.value)} aria-label={t("Sortierung")}>
          <option value="">{t("Beliebt")}</option>
          <option value="new">{t("Neu")}</option>
          <option value="rating">{t("Beste Bewertung")}</option>
          <option value="updated">{t("Zuletzt aktualisiert")}</option>
          <option value="name">{t("Name")}</option>
        </select>
      </div>
      <div className="ws-cats" role="tablist" aria-label={t("Kategorie")}>
        <button className={!cat ? "ws-cat on" : "ws-cat"} onClick={() => setCat("")}>
          {t("Alle")}
        </button>
        {CATEGORIES.map((c) => (
          <button key={c.id} className={cat === c.id ? "ws-cat on" : "ws-cat"} onClick={() => setCat(cat === c.id ? "" : c.id)}>
            {c.label}
          </button>
        ))}
      </div>

      {error && <Unreachable error={error} onRetry={load} />}

      {items === null ? (
        <div className="ws-grid">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div key={i} className="skeleton" style={{ height: 260 }} />
          ))}
        </div>
      ) : items.length === 0 && !error ? (
        <div className="empty">
          <div className="empty-icon">
            <WorkshopIcon size={24} />
          </div>
          <h2>{browsing ? t("Nichts gefunden") : t("Noch leer")}</h2>
          <p className="muted">{browsing ? t("Versuche einen anderen Suchbegriff oder Filter.") : t("Sei der Erste und lade deine Mod hoch.")}</p>
          {!browsing && (
            <button className="btn primary" onClick={onUpload}>
              <UploadIcon size={14} /> {t("Hochladen")}
            </button>
          )}
        </div>
      ) : browsing ? (
        <>
          <div className="ws-list-head">
            <h2>{q.trim() ? t("Ergebnisse für „{q}“", { q: q.trim() }) : cat ? categoryLabel(cat) : kind === "mod" ? t("Mods") : t("Quellcode-Projekte")}</h2>
            <span className="grow" />
            <span className="muted small">{t("{n} Einträge", { n: total })}</span>
            <button
              className="btn small ghost"
              onClick={() => {
                setQ("");
                setCat("");
                setMc("");
                setSort("");
              }}
            >
              {t("Filter zurücksetzen")}
            </button>
          </div>
          <div className="ws-grid">
            {items.map((it) => (
              <WsCard key={it.id} item={it} onOpen={onOpen} />
            ))}
          </div>
        </>
      ) : (
        <>
          {featured.length > 0 && <Spotlight items={featured} onOpen={onOpen} />}
          <Shelf title={t("Beliebt")} desc={t("Am meisten heruntergeladen")} items={popular} onOpen={onOpen} onMore={() => document.querySelector(".ws-all")?.scrollIntoView({ behavior: "smooth" })} />
          <Shelf title={t("Neu im Workshop")} desc={t("Gerade erst hochgeladen")} items={shelves?.fresh ?? []} onOpen={onOpen} onMore={() => setSort("new")} />
          <Shelf title={t("Bestbewertet")} desc={t("Von der Community am besten bewertet")} items={shelves?.top ?? []} onOpen={onOpen} onMore={() => setSort("rating")} />
          <section className="ws-shelf ws-all">
            <div className="ws-shelf-head">
              <div>
                <h2>{kind === "mod" ? t("Alle Mods") : t("Alle Quellcode-Projekte")}</h2>
                <div className="muted small">{kind === "mod" ? t("Herunterladen und direkt spielen") : t("Herunterladen, in Anvil Studio öffnen und selbst weiterbauen")}</div>
              </div>
              <span className="grow" />
              <span className="muted small">{t("{n} Einträge", { n: total })}</span>
            </div>
            <div className="ws-grid">
              {items.map((it) => (
                <WsCard key={it.id} item={it} onOpen={onOpen} />
              ))}
            </div>
          </section>
        </>
      )}
    </>
  );
}

// ---- Mod-Seite -------------------------------------------------------------------

function ItemPage({
  id,
  onBack,
  onOpen,
  withLogin,
  onOpenProject,
  onEdit,
}: {
  id: string;
  onBack: () => void;
  onOpen: (id: string) => void;
  withLogin: (reason: string, then: (p: McProfile) => void) => void;
  onOpenProject: (p: Project) => void;
  onEdit: (item: WsItem) => void;
}) {
  const [item, setItem] = useState<WsItem | null>(null);
  const [error, setError] = useState("");
  const [media, setMedia] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [opening, setOpening] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [more, setMore] = useState<WsItem[]>([]);
  const [similar, setSimilar] = useState<WsItem[]>([]);
  const ws = useWorkshop();
  // Mehr vom gleichen Ersteller und Ähnliches aus der ersten Kategorie
  useEffect(() => {
    if (!item) return;
    const kind = item.hasMod ? "mod" : "source";
    wsApi
      .list(kind, "", "", "", "", 0, { owner: item.owner.uuid, exclude: item.id, limit: 4 })
      .then((r) => setMore(r.items.filter((x) => x.owner.uuid === item.owner.uuid && x.id !== item.id).slice(0, 4)))
      .catch(() => setMore([]));
    if (item.categories[0])
      wsApi
        .list(kind, "", "", item.categories[0], "", 0, { exclude: item.id, limit: 8 })
        .then((r) => setSimilar(r.items.filter((x) => x.id !== item.id && x.owner.uuid !== item.owner.uuid).slice(0, 4)))
        .catch(() => setSimilar([]));
    else setSimilar([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id]);

  const load = () => {
    setError("");
    wsApi
      .item(id)
      .then(setItem)
      .catch((e) => setError(String(e)));
  };
  useEffect(load, [id]);

  if (error)
    return (
      <>
        <button className="btn ghost back" onClick={onBack}>
          <ArrowLeftIcon size={14} /> {t("Workshop")}
        </button>
        <Unreachable error={error} onRetry={load} />
      </>
    );
  if (!item) return <div className="skeleton" style={{ height: 420 }} />;

  const embeds = (item.videos?.length ? item.videos : [item.trailerUrl]).map(youtubeEmbed).filter((x): x is string => !!x);
  const slides: ({ kind: "video"; src: string } | { kind: "image"; src: string })[] = [
    ...item.images.slice(0, 1).map((p) => ({ kind: "image" as const, src: wsUrl(p) })),
    ...embeds.map((src) => ({ kind: "video" as const, src })),
    ...item.images.slice(1).map((p) => ({ kind: "image" as const, src: wsUrl(p) })),
  ];
  const slide = slides[Math.min(media, slides.length - 1)];
  const own = ws.profile && ws.profile.uuid.replace(/-/g, "") === item.owner.uuid;
  const longDesc = (item.description || "").length > 1400 || (item.description || "").split("\n").length > 22;

  async function download() {
    const dest = await pickSaveFile(t("Mod-Datei speichern"), `${item!.modId || "mod"}-${item!.modVersion || "1.0"}.jar`, "jar", t("Mod-Datei"));
    if (!dest) return;
    try {
      await wsApi.download(item!.id, "mod", dest);
      toast(t("Mod-Datei gespeichert."), "success");
      api.openPath(dest).catch(() => {});
    } catch (e) {
      toast(String(e), "error");
    }
  }

  async function openSource() {
    setOpening(true);
    try {
      const p = await wsApi.openSource(item!.id);
      toast(t("„{name}“ liegt jetzt in deinen Projekten.", { name: p.name }), "success");
      onOpenProject(p);
    } catch (e) {
      toast(String(e), "error");
    } finally {
      setOpening(false);
    }
  }

  async function report() {
    const reason = window.prompt(t("Was stimmt mit diesem Eintrag nicht?"));
    if (!reason?.trim()) return;
    wsApi
      .report(item!.id, reason)
      .then(() => toast(t("Danke – das Team schaut es sich an."), "success"))
      .catch((e) => toast(String(e), "error"));
  }

  return (
    <>
      <button className="btn ghost back" onClick={onBack}>
        <ArrowLeftIcon size={14} /> {t("Workshop")}
      </button>
      {item.status && item.status !== "public" && (
        <div className={item.status === "pending" ? "callout warn" : "callout error"}>
          <AlertIcon size={16} />
          <div className="grow">
            <StatusBadge status={item.status} /> {item.reason}
          </div>
        </div>
      )}
      <div className="ws-detail">
        <div className="ws-detail-main">
          {slide ? (
            <div className="ws-stage">
              {slide.kind === "video" ? (
                <iframe src={slide.src} title={t("Video")} allow="encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
              ) : (
                <img src={slide.src} alt="" />
              )}
            </div>
          ) : (
            <Cover item={item} height={380} />
          )}
          {slides.length > 1 && (
            <div className="ws-thumbs">
              {slides.map((s, i) => (
                <button key={i} className={i === media ? "ws-thumb active" : "ws-thumb"} onClick={() => setMedia(i)} aria-label={s.kind === "video" ? t("Video") : t("Bild {n}", { n: i + 1 })}>
                  {s.kind === "video" ? (
                    <span className="ws-thumb-video">
                      <img src={`https://i.ytimg.com/vi/${s.src.match(/embed\/([^?]+)/)?.[1] ?? ""}/mqdefault.jpg`} alt="" />
                      <span className="ws-thumb-play">
                        <PlayIcon size={14} />
                      </span>
                    </span>
                  ) : (
                    <img src={s.src} alt="" />
                  )}
                </button>
              ))}
            </div>
          )}
          <section className="panel ws-about">
            <h2>{t("Über diese Mod")}</h2>
            {item.summary && item.description && <p className="ws-lead">{item.summary}</p>}
            <div className={longDesc && !showAll ? "ws-description clamped" : "ws-description"}>
              <Markdown text={item.description || item.summary || t("Keine Beschreibung.")} />
            </div>
            {longDesc && (
              <button className="link-btn" onClick={() => setShowAll(!showAll)}>
                {showAll ? t("Weniger anzeigen") : t("Mehr anzeigen")}
              </button>
            )}
          </section>
          <Shelf title={t("Mehr von {name}", { name: item.owner.name })} items={more} onOpen={onOpen} />
          <Shelf title={t("Ähnliche Mods")} desc={item.categories[0] ? categoryLabel(item.categories[0]) : undefined} items={similar} onOpen={onOpen} />
          <Comments item={item} withLogin={(r, then) => withLogin(r, () => then())} />
        </div>

        <aside className="ws-detail-side">
          <div className="panel ws-side-card">
            <div className="row">
              {item.icon && <img className="ws-icon lg" src={wsUrl(item.icon)} alt="" />}
              <div>
                <h1 className="ws-title">{item.title}</h1>
                <div className="muted">{t("von {name}", { name: item.owner.name })}</div>
                <RatingSummary item={item} />
              </div>
            </div>
            <div className="row gap-6 wrap">
              <TypeBadges item={item} />
              {item.categories.map((c) => (
                <span key={c} className="badge-mini">
                  {categoryLabel(c)}
                </span>
              ))}
            </div>
            {item.hasMod && (
              <>
                <button className="btn primary lg full" disabled={!item.mcVersion} onClick={() => withLogin(t("Zum Spielen meldest du dich mit deinem Minecraft-Konto an."), () => setPlaying(true))}>
                  <PlayIcon size={15} /> {t("Spielen")}
                </button>
                <div className="muted small center">{t("Installiert die Mod und startet Minecraft – mit deinem Minecraft-Konto")}</div>
                <button className="btn full" onClick={download}>
                  <DownloadIcon size={14} /> {t("Herunterladen (.jar, {size})", { size: fmtSize(item.modSize) })}
                </button>
                <SubscribeButton item={item} onChange={setItem} withLogin={(r, then) => withLogin(r, () => then())} />
              </>
            )}
            <DependencyList item={item} onOpen={onOpen} />
            <RateBox item={item} own={!!own} onChange={setItem} withLogin={(r, then) => withLogin(r, () => then())} />
            <dl className="ws-facts">
              <dt>{t("Version")}</dt>
              <dd>{item.modVersion || "–"}</dd>
              <dt>{t("Minecraft")}</dt>
              <dd>{item.mcVersion || "–"} · NeoForge</dd>
              <dt>{t("Downloads")}</dt>
              <dd>{item.downloads.toLocaleString(locale)}</dd>
              <dt>{t("Lizenz")}</dt>
              <dd>{item.license || "–"}</dd>
              <dt>{t("Aktualisiert")}</dt>
              <dd>{new Date(item.updatedAt * 1000).toLocaleDateString(locale)}</dd>
            </dl>
          </div>
          {item.hasSource && (
            <div className="ws-source-card">
              <div className="row gap-6" style={{ fontWeight: 600 }}>
                <CodeIcon size={15} /> {t("Quellcode verfügbar")}
              </div>
              <div className="muted small">{t("Hol dir das Projekt in Anvil Studio und baue deine eigene Version davon.")}</div>
              <button className={opening ? "btn full loading" : "btn full"} disabled={opening} onClick={openSource}>
                <FolderOpenIcon size={14} /> {t("In Anvil Studio öffnen")}
              </button>
            </div>
          )}
          {own ? (
            <button className="btn ghost" onClick={() => onEdit(item)}>
              <PencilIcon size={13} /> {t("Bearbeiten")}
            </button>
          ) : (
            <button className="btn ghost small" onClick={() => withLogin(t("Zum Melden brauchst du dein Minecraft-Konto."), report)}>
              {t("Melden")}
            </button>
          )}
        </aside>
      </div>
      {playing && <PlayDialog item={item} onClose={() => setPlaying(false)} />}
    </>
  );
}

// ---- Spielen ---------------------------------------------------------------------

export function PlayDialog({ item, onClose }: { item: WsItem; onClose: () => void }) {
  const ws = useWorkshop();
  const [step, setStep] = useState<{ step: string; done: number; total: number }>({ step: t("Vorbereiten …"), done: 0, total: 0 });
  const [state, setState] = useState<"running" | "started" | "error">("running");
  const [error, setError] = useState("");

  useEffect(() => {
    const a = listen<{ step: string; done: number; total: number }>("play-progress", (e) => setStep(e.payload));
    const b = listen<{ success: boolean }>("play-exit", () => onClose());
    wsApi
      .play(item)
      .then(() => setState("started"))
      .catch((e) => {
        setError(String(e));
        setState("error");
      });
    return () => {
      a.then((f) => f());
      b.then((f) => f());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pct = step.total ? Math.round((step.done / step.total) * 100) : null;
  const stepIdx = state === "started" ? 3 : /Konto/.test(step.step) ? 1 : 2;
  const depMatch = step.step.match(/^Abhängigkeit wird geladen: (.*)$/);
  const translatedStep = depMatch ? t("Abhängigkeit wird geladen: {name}", { name: depMatch[1] }) : t(step.step);
  return (
    <div className="modal-backdrop">
      <div className="ws-play" role="dialog" aria-label={t("{name} spielen", { name: item.title })}>
        <div className="ws-play-steps">
          <div>
            <div className="panel-title-lg">{t("{name} spielen", { name: item.title })}</div>
            <div className="muted small">Minecraft {item.mcVersion} · NeoForge</div>
          </div>
          {[
            [t("Mit Minecraft-Konto anmelden"), t("Über Microsoft – nur einmal nötig")],
            [t("Spiel und Mod vorbereiten"), t("Minecraft, NeoForge und die Mod werden in einen eigenen Ordner geladen")],
            [t("Minecraft starten"), t("Direkt mit der Mod, dein normales Minecraft bleibt unverändert")],
          ].map(([title, sub], i) => (
            <div key={i} className={i + 1 < stepIdx ? "ws-step done" : i + 1 === stepIdx ? "ws-step active" : "ws-step"}>
              <span className="ws-step-dot">{i + 1 < stepIdx ? <CheckIcon size={13} /> : i + 1}</span>
              <div>
                <div className="ws-step-title">{title}</div>
                <div className="muted small">{sub}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="ws-play-body">
          {ws.profile && (
            <div className="ws-account-card">
              {ws.profile.kind !== "xbox" && <img src={`https://mc-heads.net/avatar/${ws.profile.uuid}/40`} alt="" />}
              <div className="grow">
                <div style={{ fontWeight: 600 }}>{ws.profile.name}</div>
                <div className="small" style={{ color: "var(--accent)" }}>
                  {ws.profile.kind === "xbox" ? t("Xbox-Konto · Spielen erst nach Freischaltung") : t("Minecraft: Java Edition · angemeldet")}
                </div>
              </div>
            </div>
          )}
          {state === "error" ? (
            <div className="callout error" style={{ whiteSpace: "pre-wrap" }}>
              {error}
            </div>
          ) : state === "started" ? (
            <div className="callout ok">
              <CheckIcon size={16} /> {t("Minecraft startet – das Fenster öffnet sich gleich.")}
            </div>
          ) : (
            <div className="ws-progress">
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span>{translatedStep}</span>
                <span className="mono muted small">{pct !== null ? `${pct} %` : ""}</span>
              </div>
              <div className="ws-bar">
                <div style={{ width: pct !== null ? `${pct}%` : "35%" }} className={pct === null ? "indeterminate" : ""} />
              </div>
              <div className="muted small">{t("Beim ersten Mal dauert es ein paar Minuten, danach startet es sofort.")}</div>
            </div>
          )}
          <span className="grow" />
          <div className="row gap-6" style={{ justifyContent: "flex-end" }}>
            <button className="btn" onClick={onClose}>
              {state === "running" ? t("Im Hintergrund weiter") : t("Schließen")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- Hochladen -------------------------------------------------------------------

function UploadPage({ projects, item, onBack, onDone }: { projects: Project[]; item?: WsItem; onBack: () => void; onDone: () => void }) {
  const ws = useWorkshop();
  const guess = useMemo(() => (item ? projects.find((p) => p.modId === item.modId) : projects[0]), [item, projects]);
  const [projectId, setProjectId] = useState(guess?.id ?? "");
  const [settings, setSettings] = useState<ModSettings | null>(null);
  const [includeMod, setIncludeMod] = useState(item ? item.hasMod : true);
  const [includeSource, setIncludeSource] = useState(item ? item.hasSource : false);
  const [title, setTitle] = useState(item?.title ?? "");
  const [summary, setSummary] = useState(item?.summary ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [categories, setCategories] = useState<string[]>(item?.categories ?? []);
  const [videos, setVideos] = useState<string[]>(() => (item?.videos?.length ? item.videos : item?.trailerUrl ? [item.trailerUrl] : []));
  const [deps, setDeps] = useState<{ id: string; title: string }[]>(() => (item?.dependencies ?? []).map((d) => ({ id: d.id, title: d.title })));
  const [pics, setPics] = useState<Pic[]>(() => (item?.images ?? []).map((p, i) => ({ key: `old${i}`, old: i, src: wsUrl(p) })));
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [agree, setAgree] = useState(!!item);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ step: string; sent: number; total: number } | null>(null);
  const [jars, setJars] = useState<number | null>(null);
  const project = projects.find((p) => p.id === projectId);

  useEffect(() => {
    if (!projectId) return;
    modSettingsApi
      .get(projectId)
      .then((s) => {
        setSettings(s);
        if (!item) {
          setTitle(s.name);
          setDescription(s.description);
          setSummary(s.description.split(/[.\n]/)[0]?.slice(0, 120) ?? "");
        }
      })
      .catch(() => setSettings(null));
    exportApi
      .jars(projectId)
      .then((j) => setJars(j.length))
      .catch(() => setJars(0));
  }, [projectId, item]);

  async function addImages() {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const r = await open({ multiple: true, title: t("Bilder auswählen"), filters: [{ name: t("Bilder"), extensions: ["png", "jpg", "jpeg", "webp"] }] });
    const list = (Array.isArray(r) ? r : r ? [r] : []).map(String);
    const added: Pic[] = [];
    for (const path of list) {
      const src = await wsApi.imagePreview(path).catch(() => "");
      added.push({ key: `new${Date.now()}${Math.random()}`, path, src });
    }
    setPics((old) => [...old, ...added].slice(0, 8));
  }
  // Ziehen mit der Maus (ohne HTML-Drag&Drop, das im Fenster für Dateien reserviert ist)
  useEffect(() => {
    if (!dragKey) return;
    const move = (e: PointerEvent) => {
      const el = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest("[data-pic]") as HTMLElement | null;
      if (el?.dataset.pic) moveTo(el.dataset.pic);
    };
    const up = () => setDragKey(null);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragKey]);
  /** Bild beim Ziehen an die Stelle eines anderen schieben */
  function moveTo(target: string) {
    if (!dragKey || dragKey === target) return;
    setPics((old) => {
      const from = old.findIndex((p) => p.key === dragKey);
      const to = old.findIndex((p) => p.key === target);
      if (from < 0 || to < 0) return old;
      const next = [...old];
      const [m] = next.splice(from, 1);
      next.splice(to, 0, m);
      return next;
    });
  }

  async function submit() {
    if (!project) return;
    setBusy(true);
    setProgress({ step: "prepare", sent: 0, total: 0 });
    const un = await listen<{ step: string; sent: number; total: number }>("ws-upload-progress", (e) => setProgress(e.payload));
    try {
      const fresh = pics.filter((p) => p.path);
      const imageOrder = pics.map((p) => (p.old !== undefined ? `old:${p.old}` : `new:${fresh.indexOf(p)}`));
      const vids = videos.map((v) => v.trim()).filter(Boolean);
      const r = await wsApi.upload({
        projectId: project.id,
        itemId: item?.id ?? null,
        includeMod,
        includeSource,
        title,
        summary,
        description,
        categories,
        trailerUrl: vids[0] ?? "",
        videos: vids,
        images: fresh.map((p) => p.path!),
        imageOrder,
        dependencies: includeMod ? deps.map((d) => d.id) : [],
      });
      toast(r.status === "public" ? t("Veröffentlicht!") : t("Eingereicht – du siehst den Stand unter „Meine Uploads“."), "success");
      onDone();
    } catch (e) {
      toast(String(e), "error");
    } finally {
      un();
      setBusy(false);
      setProgress(null);
      refreshMe();
    }
  }
  const progressPct = progress && progress.step === "upload" && progress.total > 0 ? Math.min(100, Math.round((progress.sent / progress.total) * 100)) : null;
  const progressLabel = !progress
    ? ""
    : progress.step === "mod"
      ? t("Mod-Datei wird vorbereitet …")
      : progress.step === "source"
        ? t("Quellcode wird gepackt …")
        : progress.step === "upload"
          ? progressPct !== null && progressPct >= 100
            ? t("Server verarbeitet den Upload …")
            : t("Wird hochgeladen … {sent} von {total}", { sent: fmtSize(progress.sent), total: fmtSize(progress.total) })
          : progress.step === "done"
            ? t("Server verarbeitet den Upload …")
            : t("Wird vorbereitet …");

  const canSubmit = !!project && (includeMod || includeSource) && title.trim() && agree && !busy && !(includeMod && jars === 0);

  return (
    <>
      <button className="btn ghost back" onClick={onBack}>
        <ArrowLeftIcon size={14} /> {item ? t("Meine Uploads") : t("Workshop")}
      </button>
      <header className="page-header">
        <div>
          <h1>{item ? t("„{name}“ aktualisieren", { name: item.title }) : t("Im Workshop veröffentlichen")}</h1>
          <p className="muted">{t("Name, Beschreibung und Logo kommen aus den Mod-Einstellungen deines Projekts.")}</p>
        </div>
      </header>
      {projects.length === 0 ? (
        <div className="empty">
          <h2>{t("Noch kein Projekt")}</h2>
          <p className="muted">{t("Erstelle zuerst eine Mod in Anvil Studio – dann kannst du sie hier teilen.")}</p>
        </div>
      ) : (
        <div className="ws-detail">
          <div className="ws-detail-main">
            <section className="panel ws-form">
              <label className="field">
                <span className="field-label">{t("Projekt")}</span>
                <select className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · Minecraft {p.mcVersion}
                    </option>
                  ))}
                </select>
              </label>
              <div className="field">
                <span className="field-label">{t("Was soll hochgeladen werden?")}</span>
                <div className="ws-type-cards">
                  <button type="button" className={includeMod ? "ws-type-card on" : "ws-type-card"} aria-pressed={includeMod} onClick={() => setIncludeMod(!includeMod)}>
                    <span className="ws-type-icon mod">
                      <PlayIcon size={15} />
                    </span>
                    <span className="grow">
                      <span className="ws-type-title">{t("Fertige Mod")}</span>
                      <span className="muted small">{t("Die gebaute .jar – andere können sie herunterladen und direkt spielen.")}</span>
                    </span>
                    <span className="ws-check">{includeMod && <CheckIcon size={13} />}</span>
                  </button>
                  <button type="button" className={includeSource ? "ws-type-card on" : "ws-type-card"} aria-pressed={includeSource} onClick={() => setIncludeSource(!includeSource)}>
                    <span className="ws-type-icon src">
                      <CodeIcon size={15} />
                    </span>
                    <span className="grow">
                      <span className="ws-type-title">{t("Quellcode")}</span>
                      <span className="muted small">{t("Das Projekt als ZIP – andere öffnen es in Anvil Studio und bauen weiter.")}</span>
                    </span>
                    <span className="ws-check">{includeSource && <CheckIcon size={13} />}</span>
                  </button>
                </div>
                {includeMod && jars === 0 && <div className="callout warn small">{t("Für dieses Projekt gibt es noch keine Mod-Datei. Baue sie zuerst im Bereich „Export“.")}</div>}
              </div>
              <div className="form-grid">
                <label className="field">
                  <span className="field-label">{t("Titel")}</span>
                  <input className="input" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} />
                </label>
                <label className="field">
                  <span className="field-label">{t("Kurzbeschreibung")}</span>
                  <input className="input" value={summary} maxLength={200} onChange={(e) => setSummary(e.target.value)} />
                </label>
              </div>
              <label className="field">
                <span className="field-label">{t("Beschreibung")}</span>
                <textarea className="input textarea" rows={6} value={description} onChange={(e) => setDescription(e.target.value)} />
              </label>
              <div className="field">
                <span className="field-label">
                  {t("Bilder")} <span className="muted">· {t("bis zu 8 – ziehe sie in die richtige Reihenfolge, das erste ist das Vorschaubild")}</span>
                </span>
                <div className="ws-pics">
                  {pics.map((p, i) => (
                    <div
                      key={p.key}
                      data-pic={p.key}
                      className={dragKey === p.key ? "ws-pic dragging" : "ws-pic"}
                      onPointerDown={(e) => {
                        if ((e.target as HTMLElement).closest("button")) return;
                        e.preventDefault();
                        setDragKey(p.key);
                      }}
                    >
                      {p.src ? <img src={p.src} alt="" draggable={false} /> : <ImageIcon size={20} />}
                      {i === 0 && <span className="ws-pic-badge">{t("Vorschau")}</span>}
                      <span className="ws-pic-num">{i + 1}</span>
                      <button className="ws-pic-x" onClick={() => setPics(pics.filter((x) => x.key !== p.key))} aria-label={t("Entfernen")}>
                        <CloseIcon size={11} />
                      </button>
                    </div>
                  ))}
                  {pics.length < 8 && (
                    <button className="ws-pic add" onClick={addImages}>
                      <PlusIcon size={18} />
                      <span>{t("Bilder hinzufügen")}</span>
                    </button>
                  )}
                </div>
              </div>
              <div className="field">
                <span className="field-label">
                  {t("Videos")} <span className="muted">· {t("YouTube-Links, optional, bis zu 6")}</span>
                </span>
                <div className="ws-videos">
                  {videos.map((v, i) => (
                    <div key={i} className="row gap-6">
                      <input className="input grow" placeholder="https://youtu.be/…" value={v} onChange={(e) => setVideos(videos.map((x, j) => (j === i ? e.target.value : x)))} />
                      {v.trim() && !youtubeEmbed(v) && <span className="small error-text">{t("Kein YouTube-Link")}</span>}
                      <button className="icon-btn" onClick={() => setVideos(videos.filter((_, j) => j !== i))} aria-label={t("Entfernen")}>
                        <CloseIcon size={12} />
                      </button>
                    </div>
                  ))}
                  {videos.length < 6 && (
                    <button className="btn small" onClick={() => setVideos([...videos, ""])}>
                      <PlusIcon size={13} /> {t("Video hinzufügen")}
                    </button>
                  )}
                </div>
              </div>
              {includeMod && (
                <div className="field">
                  <span className="field-label">
                    {t("Benötigte Mods")} <span className="muted">· {t("aus dem Workshop, werden beim Spielen mitgeladen")}</span>
                  </span>
                  <DependencyPicker value={deps} onChange={setDeps} selfId={item?.id} />
                </div>
              )}
              <div className="field">
                <span className="field-label">
                  {t("Kategorien")} <span className="muted">· {t("bis zu 5")}</span>
                </span>
                <div className="row gap-6 wrap">
                  {CATEGORIES.map((c) => {
                    const on = categories.includes(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        className={on ? "ws-cat on" : "ws-cat"}
                        aria-pressed={on}
                        onClick={() => setCategories(on ? categories.filter((x) => x !== c.id) : [...categories, c.id].slice(0, 5))}
                      >
                        {c.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>
          </div>
          <aside className="ws-detail-side">
            <div className="eyebrow">{t("Vorschau")}</div>
            <div className="ws-card static">
              <div className="ws-cover" style={{ height: 140 }}>
                {settings?.logo ? <img src={`data:image/png;base64,${settings.logo}`} alt="" className="pixel" /> : <span className="ws-cover-letter">{(title || "?").slice(0, 1).toUpperCase()}</span>}
              </div>
              <div className="ws-card-body">
                <div className="ws-card-title">{title || t("Titel")}</div>
                <div className="muted small">
                  {t("von {name}", { name: ws.profile?.name ?? "…" })} · {project?.mcVersion}
                </div>
                <div className="ws-card-summary">{summary}</div>
              </div>
            </div>
            <div className="callout warn">
              <AlertIcon size={16} />
              <div className="small">{t("Neue Uploads sieht man meist erst, wenn das Team sie freigegeben hat. Den Stand siehst du unter „Meine Uploads“.")}</div>
            </div>
            <label className="row gap-6" style={{ alignItems: "flex-start" }}>
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} style={{ marginTop: 3 }} />
              <span className="small">{t("Die Inhalte sind von mir oder ich darf sie teilen. Ich halte mich an die Workshop-Regeln.")}</span>
            </label>
            <div className="muted small">{ws.profile?.kind === "xbox" ? t("Hochladen als {name} (Xbox-Konto)", { name: ws.profile.name }) : t("Hochladen als {name} (Minecraft-Konto)", { name: ws.profile?.name ?? "…" })}</div>
            {busy && progress ? (
              <div className="ws-progress">
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <span className="small">{progressLabel}</span>
                  <span className="mono muted small">{progressPct !== null && progressPct < 100 ? `${progressPct} %` : ""}</span>
                </div>
                <div className="ws-bar">
                  {progressPct !== null && progressPct < 100 ? <div style={{ width: `${progressPct}%` }} /> : <div className="indeterminate" />}
                </div>
              </div>
            ) : (
              <button className="btn primary lg full" disabled={!canSubmit} onClick={submit}>
                <UploadIcon size={15} /> {item ? t("Aktualisieren") : t("Hochladen")}
              </button>
            )}
          </aside>
        </div>
      )}
    </>
  );
}

// ---- Meine Uploads ---------------------------------------------------------------

function MyUploads({ onBack, onOpen, onEdit, onUpload }: { onBack: () => void; onOpen: (id: string) => void; onEdit: (item: WsItem) => void; onUpload: () => void }) {
  const [items, setItems] = useState<WsItem[] | null>(null);
  const [error, setError] = useState("");
  const ws = useWorkshop();
  const load = () => {
    setError("");
    wsApi
      .myItems()
      .then((r) => setItems(r.items))
      .catch((e) => {
        setError(String(e));
        setItems([]);
      });
  };
  useEffect(load, []);

  async function remove(it: WsItem) {
    if (!(await confirmDialog(t("„{name}“ entfernen?", { name: it.title }), t("Der Eintrag wird mit allen Dateien aus dem Workshop gelöscht."), t("Entfernen"), t("Abbrechen"), true))) return;
    wsApi
      .remove(it.id)
      .then(() => {
        toast(t("Entfernt."), "success");
        load();
      })
      .catch((e) => toast(String(e), "error"));
  }

  const total = items?.reduce((s, i) => s + i.downloads, 0) ?? 0;
  return (
    <>
      <button className="btn ghost back" onClick={onBack}>
        <ArrowLeftIcon size={14} /> {t("Workshop")}
      </button>
      <header className="page-header">
        <div>
          <h1>{t("Meine Uploads")}</h1>
          <p className="muted">
            {t("Angemeldet als {name}", { name: ws.profile?.name ?? "…" })}
            {items ? ` · ${t("{n} Uploads · {d} Downloads insgesamt", { n: items.length, d: total.toLocaleString(locale) })}` : ""}
          </p>
        </div>
        <button className="btn primary" onClick={onUpload}>
          <UploadIcon size={14} /> {t("Neu hochladen")}
        </button>
      </header>
      {error && <Unreachable error={error} onRetry={load} />}
      {items === null ? (
        <div className="skeleton" />
      ) : items.length === 0 && !error ? (
        <div className="empty">
          <h2>{t("Noch nichts hochgeladen")}</h2>
          <p className="muted">{t("Teile deine Mod oder ihren Quellcode mit der Community.")}</p>
          <button className="btn primary" onClick={onUpload}>
            <UploadIcon size={14} /> {t("Hochladen")}
          </button>
        </div>
      ) : (
        <div className="ws-mine">
          {items.map((it) => (
            <div key={it.id} className={it.status === "blocked" || it.status === "rejected" ? "panel ws-mine-row bad" : "panel ws-mine-row"}>
              <div className="ws-mine-top">
                <button className="ws-mine-cover" onClick={() => onOpen(it.id)} aria-label={it.title}>
                  <Cover item={it} height={68} />
                </button>
                <div className="grow">
                  <div className="row gap-6 wrap">
                    <span className="ws-card-title">{it.title}</span>
                    <TypeBadges item={it} />
                  </div>
                  <div className="muted small">
                    {it.status === "pending"
                      ? t("Eingereicht am {date} · wird geprüft", { date: new Date(it.updatedAt * 1000).toLocaleDateString(locale) })
                      : t("Version {v} · {n} Downloads", { v: it.modVersion || "–", n: it.downloads.toLocaleString(locale) })}
                  </div>
                </div>
                <StatusBadge status={it.status} />
                <button className="btn small" onClick={() => onEdit(it)} disabled={it.status === "blocked" && !it.allowResubmit}>
                  <PencilIcon size={13} /> {t("Bearbeiten")}
                </button>
                <button className="icon-btn danger" onClick={() => remove(it)} aria-label={t("Entfernen")} data-tip={t("Entfernen")}>
                  <TrashIcon size={15} />
                </button>
              </div>
              {(it.status === "blocked" || it.status === "rejected") && it.reason && (
                <div className="ws-reason">
                  <AlertIcon size={16} />
                  <div className="grow">
                    <div className="ws-reason-title">{it.status === "blocked" ? t("Grund der Sperre") : t("Grund der Ablehnung")}</div>
                    <div>{it.reason}</div>
                  </div>
                  {it.allowResubmit !== false && (
                    <button className="btn small primary" onClick={() => onEdit(it)}>
                      {t("Erneut einreichen")}
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <span className="muted small center">
        <ExternalIcon size={11} /> {ws.base}
      </span>
    </>
  );
}

