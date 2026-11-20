import { locale, t } from "../i18n";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, exportApi, ModSettings, modSettingsApi, pickSaveFile, Project } from "../api";
import { confirmDialog, openMenu } from "../components/Overlay";
import McLoginDialog from "../components/McLogin";
import { Comments, DependencyList, DependencyPicker, NotificationBell, RateBox, RatingSummary, SubscribeButton, Subscriptions, Stars, useSubscriptionSync } from "./WorkshopSocial";
import {
  AlertIcon,
  ArrowLeftIcon,
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
import { toast } from "../state";
import { CATEGORIES, categoryLabel, fmtSize, mcLogout, McProfile, refreshMe, useWorkshop, WsItem, wsApi, wsUrl, youtubeEmbed } from "../workshop";

type Route = { page: "home" } | { page: "item"; id: string } | { page: "upload"; item?: WsItem } | { page: "mine" } | { page: "subs" };
const MC_VERSIONS = ["1.21.1", "1.21.4", "1.21.8", "1.21.10"];

export default function Workshop({ projects, onOpenProject }: { projects: Project[]; onOpenProject: (p: Project) => void }) {
  const [route, setRoute] = useState<Route>({ page: "home" });
  const [login, setLogin] = useState<{ reason: string; then: (p: McProfile) => void } | null>(null);
  const ws = useWorkshop();
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

function Home({ onOpen, onUpload, onMine, onLogin, onSubs }: { onOpen: (id: string) => void; onUpload: () => void; onMine: () => void; onLogin: () => void; onSubs: () => void }) {
  const [kind, setKind] = useState<"mod" | "source">(() => (localStorage.getItem("anvil.ws.kind") === "source" ? "source" : "mod"));
  const [q, setQ] = useState("");
  const [mc, setMc] = useState("");
  const [cat, setCat] = useState("");
  const [sort, setSort] = useState("");
  const [items, setItems] = useState<WsItem[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const req = useRef(0);

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

  const featured = !q && !cat && items?.find((i) => i.featured);
  const rest = items?.filter((i) => i !== featured) ?? [];

  return (
    <>
      <header className="page-header">
        <div>
          <div className="eyebrow">{t("Community")}</div>
          <h1>{t("Workshop")}</h1>
          <p className="muted">{t("Mods aus der Community spielen – oder den Quellcode holen und selbst weiterbauen.")}</p>
        </div>
        <div className="row gap-6">
          <NotificationBell onOpen={onOpen} />
          <AccountChip onLogin={onLogin} />
          <button className="btn" onClick={onSubs}>
            {t("Abonniert")}
          </button>
          <button className="btn" onClick={onMine}>
            {t("Meine Uploads")}
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
        <div className="search grow">
          <SearchIcon size={13} />
          <label htmlFor="wsq" className="sr-only">
            {t("Workshop durchsuchen")}
          </label>
          <input id="wsq" placeholder={t("Workshop durchsuchen …")} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="input" value={mc} onChange={(e) => setMc(e.target.value)} aria-label={t("Minecraft-Version")}>
          <option value="">{t("Alle Versionen")}</option>
          {MC_VERSIONS.map((v) => (
            <option key={v} value={v}>
              Minecraft {v}
            </option>
          ))}
        </select>
        <select className="input" value={cat} onChange={(e) => setCat(e.target.value)} aria-label={t("Kategorie")}>
          <option value="">{t("Alle Kategorien")}</option>
          {CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
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

      {error && <Unreachable error={error} onRetry={load} />}

      {featured && (
        <button className="ws-featured" onClick={() => onOpen(featured.id)}>
          <div className="ws-featured-media">
            <Cover item={featured} height={260} />
            <span className="ws-featured-tag">{t("Empfohlen")}</span>
          </div>
          <div className="ws-featured-body">
            <div className="row">
              {featured.icon && <img className="ws-icon" src={wsUrl(featured.icon)} alt="" />}
              <div>
                <div className="ws-featured-title">{featured.title}</div>
                <div className="muted">
                  {t("von {name}", { name: featured.owner.name })} · Minecraft {featured.mcVersion}
                </div>
              </div>
            </div>
            <p className="muted">{featured.summary}</p>
            <div className="row gap-6 wrap">
              {featured.categories.map((c) => (
                <span key={c} className="badge-mini">
                  {categoryLabel(c)}
                </span>
              ))}
            </div>
            <span className="grow" />
            <div className="muted small">{t("{n} Downloads", { n: featured.downloads.toLocaleString(locale) })}</div>
          </div>
        </button>
      )}

      <div className="ws-list-head">
        <h2>{kind === "mod" ? t("Mods") : t("Quellcode-Projekte")}</h2>
        <span className="muted">{kind === "mod" ? t("Herunterladen und direkt spielen") : t("Herunterladen, in Anvil Studio öffnen und selbst weiterbauen")}</span>
        <span className="grow" />
        {items && <span className="muted small">{t("{n} Einträge", { n: total })}</span>}
      </div>

      {items === null ? (
        <div className="ws-grid">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div key={i} className="skeleton" style={{ height: 240 }} />
          ))}
        </div>
      ) : rest.length === 0 && !featured && !error ? (
        <div className="empty">
          <div className="empty-icon">
            <WorkshopIcon size={24} />
          </div>
          <h2>{q || cat || mc ? t("Nichts gefunden") : t("Noch leer")}</h2>
          <p className="muted">{q || cat || mc ? t("Versuche einen anderen Suchbegriff oder Filter.") : t("Sei der Erste und lade deine Mod hoch.")}</p>
        </div>
      ) : (
        <div className="ws-grid">
          {rest.map((it) => (
            <button key={it.id} className="ws-card" onClick={() => onOpen(it.id)}>
              <Cover item={it} height={140} />
              <div className="ws-card-badges">
                <TypeBadges item={it} />
              </div>
              <div className="ws-card-body">
                <div className="ws-card-title">{it.title}</div>
                <div className="muted small">
                  {t("von {name}", { name: it.owner.name })} · {it.mcVersion}
                </div>
                <div className="ws-card-summary">{it.summary}</div>
                <div className="muted small row gap-6">
                  <DownloadIcon size={12} /> {it.downloads.toLocaleString(locale)}
                  {!!it.rating?.count && (
                    <>
                      <span className="grow" />
                      <Stars value={it.rating.avg} size={11} />
                    </>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
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
  const ws = useWorkshop();

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

  const embed = youtubeEmbed(item.trailerUrl);
  const slides: ({ kind: "video"; src: string } | { kind: "image"; src: string })[] = [
    ...(embed ? [{ kind: "video" as const, src: embed }] : []),
    ...item.images.map((p) => ({ kind: "image" as const, src: wsUrl(p) })),
  ];
  const slide = slides[Math.min(media, slides.length - 1)];
  const own = ws.profile && ws.profile.uuid.replace(/-/g, "") === item.owner.uuid;

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
                <iframe src={slide.src} title={t("Trailer")} allow="encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
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
                <button key={i} className={i === media ? "ws-thumb active" : "ws-thumb"} onClick={() => setMedia(i)} aria-label={s.kind === "video" ? t("Trailer") : t("Bild {n}", { n: i + 1 })}>
                  {s.kind === "video" ? (
                    <span className="ws-thumb-video">
                      <PlayIcon size={16} /> {t("Trailer")}
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
            <div className="ws-description">{item.description || item.summary || t("Keine Beschreibung.")}</div>
          </section>
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

function PlayDialog({ item, onClose }: { item: WsItem; onClose: () => void }) {
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
  const [trailer, setTrailer] = useState(item?.trailerUrl ?? "");
  const [deps, setDeps] = useState<{ id: string; title: string }[]>(() => (item?.dependencies ?? []).map((d) => ({ id: d.id, title: d.title })));
  const [images, setImages] = useState<string[]>([]);
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
    const list = Array.isArray(r) ? r : r ? [r] : [];
    setImages((old) => [...old, ...list.map(String)].slice(0, 8));
  }

  async function submit() {
    if (!project) return;
    setBusy(true);
    setProgress({ step: "prepare", sent: 0, total: 0 });
    const un = await listen<{ step: string; sent: number; total: number }>("ws-upload-progress", (e) => setProgress(e.payload));
    try {
      const r = await wsApi.upload({ projectId: project.id, itemId: item?.id ?? null, includeMod, includeSource, title, summary, description, categories, trailerUrl: trailer.trim(), images, dependencies: includeMod ? deps.map((d) => d.id) : [] });
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

  const fileName = (p: string) => p.split(/[\\/]/).pop();
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
                  {t("Bilder")} <span className="muted">· {item && !images.length ? t("leer lassen = bisherige Bilder behalten") : t("bis zu 8, das erste ist das Titelbild")}</span>
                </span>
                <div className="ws-images">
                  {images.map((p, i) => (
                    <div key={p + i} className="ws-image-chip">
                      <ImageIcon size={14} />
                      <span className="ellipsis">{fileName(p)}</span>
                      <button className="icon-btn" onClick={() => setImages(images.filter((_, j) => j !== i))} aria-label={t("Entfernen")}>
                        <CloseIcon size={11} />
                      </button>
                    </div>
                  ))}
                  {images.length < 8 && (
                    <button className="btn small" onClick={addImages}>
                      <PlusIcon size={13} /> {t("Bilder hinzufügen")}
                    </button>
                  )}
                </div>
              </div>
              <label className="field">
                <span className="field-label">
                  {t("Trailer")} <span className="muted">· {t("YouTube-Link, optional")}</span>
                </span>
                <input className="input" placeholder="https://youtu.be/…" value={trailer} onChange={(e) => setTrailer(e.target.value)} />
              </label>
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

