import { useEffect, useMemo, useRef, useState } from "react";
import { t, translateMessage } from "../../i18n";
import { api, CrashReport, Project, Task, TASK_LABELS } from "../../api";
import { MenuItem, openMenu } from "../../components/Overlay";
import { AlertIcon, ArrowRightIcon, BlueprintIcon, CheckIcon, ChevronIcon, CloseIcon, CopyIcon, DownloadIcon, FileIcon, FolderIcon, HammerIcon, InfoIcon, PackageIcon, PlayIcon, RefreshIcon, SearchIcon, SparkIcon, StopIcon, TerminalIcon, TrashIcon, UndoIcon } from "../../icons";
import { clearLogs, Log } from "../../store";
import { toast } from "../../state";

type Tab = "output" | "problems" | "blueprint" | "crash";
type LevelFilter = "all" | "error" | "warn" | "system" | "gradle" | "game";

/** Zerlegte Logzeile */
interface Parsed {
  time?: string;
  thread?: string;
  lvl?: string;
  source?: string;
  msg: string;
  kind: "mc" | "gradle" | "javac" | "plain";
  file?: string;
  lineNo?: string;
}

const MC = /^\[(\d{2}:\d{2}:\d{2})(?:\.\d+)?\] \[([^\]]+?)\/(\w+)\](?: \[([^\]]+)\])?: ?(.*)$/;
const GRADLE = /^> (Task|Configure) (\S+)(.*)$/;
const JAVAC = /^(.+\.java):(\d+): (error|warning): (.*)$/;

function parse(line: string): Parsed {
  let m = MC.exec(line);
  if (m) return { time: m[1], thread: m[2], lvl: m[3], source: m[4]?.split("/").pop(), msg: m[5], kind: "mc" };
  m = GRADLE.exec(line);
  if (m) return { msg: `${m[2]}${m[3]}`, source: m[1] === "Task" ? "gradle" : "config", kind: "gradle" };
  m = JAVAC.exec(line);
  if (m) return { msg: m[4], file: m[1].split(/[\\/]/).pop(), lineNo: m[2], lvl: m[3].toUpperCase(), kind: "javac" };
  return { msg: line, kind: "plain" };
}

/** Bekannte Fehler mit Erklärung */
const HINTS: [RegExp, string][] = [
  [/cannot find symbol|cannot be applied to|incompatible types/i, t("Der Java-Code passt nicht zur Minecraft-Version oder ein Name ist falsch geschrieben. Speichere im Inhalte-Tab neu, damit Anvil den Code neu erzeugt.")],
  [/Missing (model|texture|textures)|missing textures|Unable to load model/i, t("Eine Textur oder ein Modell fehlt. Male im Inhalte-Tab eine Textur und speichere.")],
  [/Could not resolve|Could not GET|UnknownHost|Connection timed out|Read timed out/i, t("Gradle erreicht die Download-Server nicht. Prüfe die Internetverbindung und starte erneut.")],
  [/Address already in use|BindException/i, t("Der Port ist belegt – läuft schon ein anderer Server? Beende ihn und starte neu.")],
  [/OutOfMemoryError|Java heap space/i, t("Zu wenig Arbeitsspeicher. Schließe andere Programme oder erhöhe den Speicher in den Einstellungen.")],
  [/Mixin/i, t("Ein Mixin konnte nicht angewendet werden – meist passt eine mitgeladene Mod nicht zur Version.")],
  [/Failed to load datapacks|Couldn't parse data file|Failed to parse/i, t("Eine JSON-Datei (Rezept, Tag, Welt …) ist fehlerhaft. Prüfe den zuletzt geänderten Inhalt.")],
  [/Unknown registry key|Unbound values in registry|Unknown element name/i, t("Eine ID verweist auf etwas, das es nicht gibt – z. B. ein Item in einem Rezept oder Tag.")],
  [/Could not find or load main class|Unsupported class file major version|UnsupportedClassVersion/i, t("Falsche Java-Version. Anvil braucht Java 21 – installiere es über die Statusleiste.")],
  [/BUILD FAILED|FAILURE:/i, t("Gradle ist fehlgeschlagen. Die eigentliche Ursache steht meist ein paar Zeilen darüber.")],
  [/Exception|Error/i, t("Ein Fehler im Code. Die erste Zeile mit „at …“ darunter zeigt, wo er passiert ist.")],
];
const clock = (ms: number) => {
  const d = new Date(ms);
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, "0")).join(":");
};
const hintFor = (msg: string) => HINTS.find(([re]) => re.test(msg))?.[1];

/** Fortschritt des Testlaufs aus der Ausgabe lesen */
function phases(task: Task | undefined, lines: Log[]): { steps: string[]; at: number } {
  const text = (re: RegExp) => lines.some((l) => re.test(l.line));
  if (task === "build") {
    const steps = [t("Vorbereiten"), t("Kompilieren"), t("Packen"), t("Fertig")];
    const at = text(/BUILD SUCCESSFUL/) ? 3 : text(/:jar\b|:reobfJar|:build\b/) ? 2 : text(/compileJava|processResources/) ? 1 : 0;
    return { steps, at };
  }
  if (task === "runServer") {
    const steps = [t("Vorbereiten"), t("Kompilieren"), t("Server startet"), t("Welt wird erzeugt"), t("Bereit")];
    const at = text(/Done \(\d/) ? 4 : text(/Preparing (level|spawn area)/) ? 3 : text(/ModLauncher|Launching target|Starting minecraft server/i) ? 2 : text(/compileJava|processResources/) ? 1 : 0;
    return { steps, at };
  }
  if (task === "runClient") {
    const steps = [t("Vorbereiten"), t("Kompilieren"), t("Minecraft startet"), t("Hauptmenü"), t("In der Welt")];
    const at = text(/joined the game|logged in with entity id|Started \d+ worker threads|Loaded \d+ advancements/) ? 4 : text(/Sound engine started|OpenAL initialized/) ? 3 : text(/ModLauncher|Launching target|Setting user/i) ? 2 : text(/compileJava|processResources/) ? 1 : 0;
    return { steps, at };
  }
  return { steps: [t("Läuft")], at: 0 };
}

export interface ConsoleProps {
  project: Project;
  logs: Log[];
  running: { task: string; startedAt: number } | undefined | null;
  lastExit: { task: string; success: boolean; at: number } | undefined | null;
  elapsed: number;
  crash: CrashReport | null;
  jars: string[];
  fontSize: number;
  world: string;
  onWorld: (w: string) => void;
  onStart: (task: Task) => void;
  onRun: () => void;
  onStop: () => void;
  onRestart: () => void;
  onReload: () => void;
  onBuildJar: () => void;
  javaReady: boolean;
}

export default function ConsoleView(p: ConsoleProps) {
  const { project, logs, running, lastExit, crash, jars } = p;
  const [tab, setTab] = useState<Tab>("output");
  const [level, setLevel] = useState<LevelFilter>("all");
  const [q, setQ] = useState("");
  const [showTime, setShowTime] = useState(() => localStorage.getItem("anvil.console.time") !== "0");
  const [wrap, setWrap] = useState(() => localStorage.getItem("anvil.console.wrap") !== "0");
  const [follow, setFollow] = useState(true);
  const [side, setSide] = useState(true);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem("anvil.console.time", showTime ? "1" : "0");
      localStorage.setItem("anvil.console.wrap", wrap ? "1" : "0");
    } catch {
      /* egal */
    }
  }, [showTime, wrap]);

  // Zeilen seit dem letzten Start (für Fortschritt und Statistik)
  const runStart = useMemo(() => {
    for (let i = logs.length - 1; i >= 0; i--) if (logs[i].level === "system" && /^gradlew/.test(logs[i].line)) return i;
    return 0;
  }, [logs]);
  const current = logs.slice(runStart);
  const task = (running?.task ?? lastExit?.task) as Task | undefined;
  const prog = phases(task, current);
  const errors = useMemo(() => logs.filter((l) => l.level === "error"), [logs]);
  const warns = useMemo(() => logs.filter((l) => l.level === "warn"), [logs]);
  const bpLines = useMemo(() => logs.filter((l) => l.line.includes("[Blueprint]")), [logs]);
  const modHits = useMemo(() => logs.filter((l) => l.line.includes(project.modId)).length, [logs, project.modId]);

  const isGradle = (l: Log) => GRADLE.test(l.line) || /^(BUILD|FAILURE|> |\d+ actionable task|Deprecated Gradle|Starting a Gradle|Daemon)/.test(l.line);
  const shown = useMemo(() => {
    const query = q.trim().toLowerCase();
    return logs.filter((l) => {
      if (level === "error" && l.level !== "error") return false;
      if (level === "warn" && l.level !== "warn") return false;
      if (level === "system" && l.level !== "system" && l.level !== "success") return false;
      if (level === "gradle" && !isGradle(l)) return false;
      if (level === "game" && !MC.test(l.line)) return false;
      return !query || l.line.toLowerCase().includes(query);
    });
  }, [logs, level, q]);

  // Probleme gruppieren (gleiche Meldung nur einmal, mit Anzahl)
  const groups = useMemo(() => {
    const map = new Map<string, { level: "error" | "warn"; msg: string; source?: string; count: number; first: Log; hint?: string }>();
    for (const l of logs) {
      if (l.level !== "error" && l.level !== "warn") continue;
      const pp = parse(l.line);
      const key = `${l.level}|${pp.msg.replace(/\d+/g, "#").slice(0, 200)}`;
      const g = map.get(key);
      if (g) g.count++;
      else map.set(key, { level: l.level, msg: pp.msg, source: pp.file ? `${pp.file}:${pp.lineNo}` : pp.source, count: 1, first: l, hint: hintFor(l.line) });
    }
    return [...map.values()].sort((a, b) => (a.level === b.level ? b.count - a.count : a.level === "error" ? -1 : 1));
  }, [logs]);

  useEffect(() => {
    const el = ref.current;
    if (el && follow) el.scrollTop = el.scrollHeight;
  }, [shown.length, tab, follow]);

  const time = `${Math.floor(p.elapsed / 60)}:${String(p.elapsed % 60).padStart(2, "0")}`;
  const state = running ? "live" : lastExit ? (lastExit.success ? "ok" : "fail") : "idle";
  const copyAll = () => navigator.clipboard.writeText(shown.map((l) => l.line).join("\n")).then(() => toast(t("Kopiert."), "success"));
  const jump = (l: Log) => {
    setTab("output");
    setLevel("all");
    setQ("");
    setFollow(false);
    requestAnimationFrame(() => document.getElementById(`log-${l.id}`)?.scrollIntoView({ block: "center" }));
    requestAnimationFrame(() => {
      const el = document.getElementById(`log-${l.id}`);
      el?.classList.add("flash");
      setTimeout(() => el?.classList.remove("flash"), 1400);
    });
  };

  return (
    <div className="cx">
      {/* Kopf: Zustand, Fortschritt, Zahlen, Aktionen */}
      <header className={`cx-head ${state}`}>
        <div className="cx-state">
          <span className={`cx-state-icon ${state}`}>{running ? <span className="pulse-dot" /> : state === "ok" ? <CheckIcon size={16} /> : state === "fail" ? <CloseIcon size={16} /> : <TerminalIcon size={16} />}</span>
          <div>
            <div className="cx-state-title">
              {running
                ? TASK_LABELS[running.task as Task] ?? running.task
                : lastExit
                  ? `${TASK_LABELS[lastExit.task as Task] ?? lastExit.task} · ${lastExit.success ? t("beendet") : t("fehlgeschlagen")}`
                  : t("Bereit")}
            </div>
            <div className="cx-state-sub muted small">
              {running ? (
                <>
                  {prog.steps[prog.at]} · <span className="mono">{time}</span>
                </>
              ) : lastExit ? (
                new Date(lastExit.at).toLocaleTimeString()
              ) : p.javaReady ? (
                t("Drücke Start oder F5, um Minecraft mit deiner Mod zu testen.")
              ) : (
                t("Java 21 fehlt noch – installiere es über die Statusleiste unten.")
              )}
            </div>
          </div>
        </div>

        {(running || lastExit) && prog.steps.length > 1 && (
          <ol className="cx-steps" aria-label={t("Fortschritt")}>
            {prog.steps.map((s, i) => {
              const done = i < prog.at || (!running && lastExit?.success && i <= prog.at);
              const now = i === prog.at && !!running;
              const failed = !running && lastExit && !lastExit.success && i === prog.at;
              return (
                <li key={s} className={done ? "done" : now ? "now" : failed ? "fail" : ""}>
                  <span className="cx-step-dot">{done ? <CheckIcon size={10} /> : failed ? <CloseIcon size={10} /> : i + 1}</span>
                  {s}
                </li>
              );
            })}
          </ol>
        )}

        <div className="cx-stats">
          <button className={errors.length ? "cx-stat err" : "cx-stat"} onClick={() => setTab("problems")} data-tip={t("Fehler")}>
            <CloseIcon size={12} /> {errors.length}
          </button>
          <button className={warns.length ? "cx-stat warn" : "cx-stat"} onClick={() => setTab("problems")} data-tip={t("Warnungen")}>
            <AlertIcon size={12} /> {warns.length}
          </button>
          <span className="cx-stat" data-tip={t("Zeilen")}>
            <TerminalIcon size={12} /> {logs.length}
          </span>
          <span className="cx-stat" data-tip={t("Zeilen mit deiner Mod-ID")}>
            <PackageIcon size={12} /> {modHits}
          </span>
        </div>

        <div className="cx-actions">
          {running ? (
            <>
              {(running.task === "runClient" || running.task === "runServer") && (
                <>
                  <button className="btn small" onClick={p.onReload} data-tip={t("Texturen, Namen und Rezepte neu laden · ohne Neustart")}>
                    <RefreshIcon size={14} /> {t("Neu laden")}
                  </button>
                  <button className="btn small" onClick={p.onRestart} data-tip={t("Spiel neu starten · Strg R")}>
                    <UndoIcon size={14} /> {t("Neu starten")}
                  </button>
                </>
              )}
              <button className="btn small danger" onClick={p.onStop}>
                <StopIcon size={12} /> {t("Stoppen")}
              </button>
            </>
          ) : (
            <button className="btn primary" onClick={p.onRun} disabled={!p.javaReady}>
              <PlayIcon size={12} /> {t("Starten")}
            </button>
          )}
          <button className="icon-btn" onClick={() => setSide((s) => !s)} data-tip={side ? t("Seitenleiste ausblenden") : t("Seitenleiste einblenden")} aria-label={t("Seitenleiste")}>
            <ChevronIcon size={14} />
          </button>
        </div>
        {running && <div className="cx-bar" style={{ width: `${((prog.at + 0.5) / prog.steps.length) * 100}%` }} />}
      </header>

      <div className="cx-body">
        <section className="cx-main">
          <div className="cx-tabs">
            <button className={tab === "output" ? "tab active" : "tab"} onClick={() => setTab("output")}>
              <TerminalIcon size={13} /> {t("Ausgabe")}
            </button>
            <button className={tab === "problems" ? "tab active" : "tab"} onClick={() => setTab("problems")}>
              <AlertIcon size={13} /> {t("Probleme")} {groups.length > 0 && <span className={errors.length ? "count err" : "count"}>{groups.length}</span>}
            </button>
            <button className={tab === "blueprint" ? "tab active" : "tab"} onClick={() => setTab("blueprint")}>
              <BlueprintIcon size={13} /> {t("Blueprint-Ausgabe")} {bpLines.length > 0 && <span className="count">{bpLines.length}</span>}
            </button>
            {crash && (
              <button className={tab === "crash" ? "tab active crash" : "tab crash"} onClick={() => setTab("crash")}>
                <AlertIcon size={13} /> {t("Absturz")}
              </button>
            )}
          </div>

          {tab === "output" && (
            <div className="cx-tools">
              <div className="cx-chips" role="radiogroup" aria-label={t("Filter")}>
                {(
                  [
                    ["all", t("Alle"), logs.length],
                    ["error", t("Fehler"), errors.length],
                    ["warn", t("Warnungen"), warns.length],
                    ["game", t("Spiel"), null],
                    ["gradle", t("Gradle"), null],
                    ["system", t("Anvil"), null],
                  ] as [LevelFilter, string, number | null][]
                ).map(([id, label, n]) => (
                  <button key={id} role="radio" aria-checked={level === id} className={level === id ? `cx-chip active ${id}` : `cx-chip ${id}`} onClick={() => setLevel(id)}>
                    {label}
                    {n !== null && n > 0 && <span>{n}</span>}
                  </button>
                ))}
              </div>
              <span className="grow" />
              <div className="search small">
                <SearchIcon size={13} />
                <input placeholder={t("Suchen …")} aria-label={t("Ausgabe filtern")} value={q} onChange={(e) => setQ(e.target.value)} />
                {q && <span className="muted tiny">{shown.length}</span>}
              </div>
              <button className={showTime ? "cx-toggle on" : "cx-toggle"} onClick={() => setShowTime((v) => !v)} data-tip={t("Uhrzeit und Quelle anzeigen")}>
                {t("Zeit")}
              </button>
              <button className={wrap ? "cx-toggle on" : "cx-toggle"} onClick={() => setWrap((v) => !v)} data-tip={t("Lange Zeilen umbrechen")}>
                {t("Umbruch")}
              </button>
              <button className={follow ? "cx-toggle on" : "cx-toggle"} onClick={() => setFollow((v) => !v)} data-tip={t("Automatisch nach unten scrollen")}>
                {t("Live")}
              </button>
              <button className="icon-btn" onClick={copyAll} aria-label={t("Alles kopieren")} data-tip={t("Alles kopieren")}>
                <CopyIcon size={14} />
              </button>
              <button className="icon-btn" onClick={() => clearLogs(project.id)} aria-label={t("Ausgabe leeren")} data-tip={t("Leeren")}>
                <TrashIcon size={14} />
              </button>
            </div>
          )}

          {tab === "output" && (
            <div
              className={wrap ? "cx-log wrap" : "cx-log"}
              ref={ref}
              style={{ fontSize: p.fontSize }}
              onScroll={(e) => {
                const el = e.currentTarget;
                const atEnd = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
                if (atEnd !== follow) setFollow(atEnd);
              }}
              onContextMenu={(e) => {
                const line = (e.target as HTMLElement).closest(".cx-line")?.getAttribute("data-line") ?? "";
                const sel = window.getSelection()?.toString() ?? "";
                openMenu(e, [
                  ...(sel ? [{ label: t("Auswahl kopieren"), icon: <CopyIcon size={15} />, onClick: () => navigator.clipboard.writeText(sel) } as MenuItem] : []),
                  ...(line ? [{ label: t("Zeile kopieren"), icon: <CopyIcon size={15} />, onClick: () => navigator.clipboard.writeText(line) } as MenuItem] : []),
                  { label: t("Alles kopieren"), icon: <CopyIcon size={15} />, onClick: copyAll },
                  "separator",
                  { label: t("Ausgabe leeren"), icon: <TrashIcon size={15} />, onClick: () => clearLogs(project.id) },
                ]);
              }}
            >
              {shown.length === 0 ? (
                <Empty filtered={logs.length > 0} />
              ) : (
                shown.map((l, i) => <Line key={l.id} l={l} showTime={showTime} modId={project.modId} q={q} prev={shown[i - 1]} />)
              )}
              {!follow && shown.length > 0 && (
                <button className="cx-jump" onClick={() => setFollow(true)}>
                  <ArrowRightIcon size={12} /> {t("Zum Ende")}
                </button>
              )}
            </div>
          )}

          {tab === "problems" && (
            <div className="cx-problems">
              {groups.length === 0 ? (
                <div className="console-empty">
                  <SparkIcon size={22} />
                  <div>{t("Keine Probleme – sauber!")}</div>
                </div>
              ) : (
                <>
                  <div className="cx-prob-sum muted small">
                    {t("{e} Fehler und {w} Warnungen, zusammengefasst zu {n} Meldungen.", { e: String(errors.length), w: String(warns.length), n: String(groups.length) })}
                  </div>
                  {groups.map((g, i) => (
                    <div key={i} className={`cx-prob ${g.level}`}>
                      <span className="cx-prob-icon">{g.level === "error" ? <CloseIcon size={12} /> : <AlertIcon size={12} />}</span>
                      <div className="cx-prob-text">
                        <div className="cx-prob-msg">{g.msg}</div>
                        <div className="cx-prob-meta muted tiny">
                          {g.source && <span className="mono">{g.source}</span>}
                          {g.count > 1 && <span>{t("{n}× aufgetreten", { n: String(g.count) })}</span>}
                        </div>
                        {g.hint && (
                          <div className="cx-prob-hint">
                            <InfoIcon size={12} /> {g.hint}
                          </div>
                        )}
                      </div>
                      <button className="btn small ghost" onClick={() => jump(g.first)}>
                        {t("Zeigen")}
                      </button>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}

          {tab === "blueprint" && (
            <div className="cx-log wrap" style={{ fontSize: p.fontSize }}>
              {bpLines.length === 0 ? (
                <div className="console-empty">
                  <BlueprintIcon size={22} />
                  <div>
                    {t("Hier erscheint alles, was deine Blueprints mit „In Konsole schreiben“ ausgeben.")}
                    <br />
                    <span className="muted">{t("Praktisch zum Testen von Variablen und Bedingungen.")}</span>
                  </div>
                </div>
              ) : (
                bpLines.map((l) => {
                  const pp = parse(l.line);
                  return (
                    <div key={l.id} className="cx-line bp">
                      <span className="cx-time">{pp.time ?? clock(l.at)}</span>
                      <span className="cx-badge bp">BP</span>
                      <span className="cx-msg">{pp.msg.replace(/^.*\[Blueprint\]\s*/, "")}</span>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {tab === "crash" && crash && (
            <div className="crash">
              <div className="crash-head">
                <div>
                  <div className="callout-title">{t("Letzter Absturz")}</div>
                  <div className="muted small">{new Date(crash.modified * 1000).toLocaleString()}</div>
                  {(() => {
                    const m = /Description: (.*)/.exec(crash.content);
                    const ex = /^([\w.$]+(?:Exception|Error)[^\n]*)/m.exec(crash.content);
                    return (
                      <div className="crash-sum">
                        {m && <strong>{m[1]}</strong>}
                        {ex && <div className="mono small">{ex[1]}</div>}
                        {crash.content.includes(project.package) && <div className="warn small">{t("Der Absturz kommt aus deiner Mod.")}</div>}
                      </div>
                    );
                  })()}
                </div>
                <button className="btn small" onClick={() => api.openPath(crash.path)}>
                  <FileIcon size={14} /> {t("Datei öffnen")}
                </button>
              </div>
              <pre className="crash-body" style={{ fontSize: p.fontSize }}>
                {crash.content.slice(0, 20000)}
              </pre>
            </div>
          )}
        </section>

        {side && (
          <aside className="cx-side">
            <div className="cx-card">
              <div className="cx-card-title">{t("Schnellstart")}</div>
              <div className="cx-quick">
                {(
                  [
                    ["runClient", t("Client"), <PlayIcon size={12} />, t("Minecraft mit deiner Mod")],
                    ["runServer", t("Server"), <TerminalIcon size={13} />, t("Dedizierter Server")],
                    ["runData", t("Datagen"), <SparkIcon size={13} />, t("Daten erzeugen")],
                    ["clean", t("Aufräumen"), <TrashIcon size={13} />, t("Build-Cache leeren")],
                  ] as [Task, string, React.ReactNode, string][]
                ).map(([task, label, icon, desc]) => (
                  <button key={task} className="cx-quick-btn" disabled={!!running} onClick={() => p.onStart(task)}>
                    <span className="cx-quick-icon">{icon}</span>
                    <span>
                      <strong>{label}</strong>
                      <span className="muted tiny">{desc}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="cx-card">
              <div className="cx-card-title">{t("Testwelt")}</div>
              <input className="input" value={p.world} onChange={(e) => p.onWorld(e.target.value)} aria-label={t("Weltname")} />
              <p className="muted tiny">{t("Wird bei „Client · Direkt in Welt“ sofort geladen. Existiert sie noch nicht, starte einmal über das Hauptmenü und lege sie mit genau diesem Namen an.")}</p>
            </div>

            <div className="cx-card">
              <div className="cx-card-title">{t("Projekt")}</div>
              <dl className="cx-meta">
                <dt>{t("Mod-ID")}</dt>
                <dd className="mono">{project.modId}</dd>
                <dt>{t("Minecraft")}</dt>
                <dd>{project.mcVersion} · NeoForge</dd>
                <dt>{t("Paket")}</dt>
                <dd className="mono">{project.package}</dd>
              </dl>
              <button className="btn small ghost" onClick={() => api.openIn(project.id, "folder").catch((e) => toast(String(e), "error"))}>
                <FolderIcon size={13} /> {t("Ordner öffnen")}
              </button>
            </div>

            <div className="cx-card">
              <div className="cx-card-title">{t("Mod-Datei")}</div>
              <button className="btn small full" disabled={!!running} onClick={p.onBuildJar}>
                <HammerIcon size={13} /> {t("Mod-Datei (.jar) bauen")}
              </button>
              {jars.length > 0 ? (
                <ul className="cx-jars">
                  {jars.map((j) => (
                    <li key={j}>
                      <button onClick={() => api.openPath(j)}>
                        <DownloadIcon size={12} />
                        <span className="mono">{j.split(/[\\/]/).pop()}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted tiny">{t("Noch keine Mod-Datei gebaut.")}</p>
              )}
            </div>

            <div className="cx-card cx-keys">
              <div className="cx-card-title">{t("Tastenkürzel")}</div>
              <div>
                <kbd>F5</kbd> {t("Starten")}
              </div>
              <div>
                <kbd>⇧ F5</kbd> {t("Stoppen")}
              </div>
              <div>
                <kbd>Strg R</kbd> {t("Neu starten")}
              </div>
              <div>
                <kbd>Strg B</kbd> {t("Bauen")}
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

function Empty({ filtered }: { filtered: boolean }) {
  return (
    <div className="console-empty">
      <SparkIcon size={22} />
      <div>
        {filtered ? (
          t("Keine Zeilen passen zum Filter.")
        ) : (
          <>
            <kbd className="kbd-icon">
              <PlayIcon size={10} />
            </kbd>{" "}
            {t("Starte Minecraft mit deiner Mod.")}
            <br />
            <span className="muted">{t("Der erste Start dauert einige Minuten, weil Gradle Minecraft und NeoForge lädt.")}</span>
          </>
        )}
      </div>
    </div>
  );
}

function highlight(text: string, modId: string, q: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const terms = [modId, q.trim()].filter((x) => x.length > 1).map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!terms.length) return text;
  const re = new RegExp(`(${terms.join("|")})`, "gi");
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > last) parts.push(text.slice(last, m.index));
    parts.push(
      <mark key={m.index} className={m[0].toLowerCase() === modId.toLowerCase() ? "mod" : "hit"}>
        {m[0]}
      </mark>,
    );
    last = m.index! + m[0].length;
  }
  parts.push(text.slice(last));
  return parts;
}

function Line({ l, showTime, modId, q, prev }: { l: Log; showTime: boolean; modId: string; q: string; prev?: Log }) {
  const pp = parse(l.line);
  const sys = l.level === "system" || l.level === "success";
  // neuer Lauf: Trennlinie
  const sep = l.level === "system" && /^gradlew/.test(l.line) && !!prev;
  const badge = sys ? "ANVIL" : pp.kind === "gradle" ? "GRADLE" : pp.kind === "javac" ? (pp.lvl === "ERROR" ? "JAVAC" : "WARN") : pp.lvl === "ERROR" || pp.lvl === "FATAL" ? "ERROR" : pp.lvl === "WARN" ? "WARN" : pp.lvl === "DEBUG" ? "DEBUG" : pp.kind === "mc" ? "INFO" : l.level === "error" ? "ERROR" : l.level === "warn" ? "WARN" : "";
  const isTrace = /^\s+at |^\s*\.\.\. \d+ more|^Caused by:/.test(l.line);
  return (
    <>
      {sep && <div className="cx-sep">{translateMessage(l.line)}</div>}
      {!sep && (
        <div id={`log-${l.id}`} className={`cx-line ${l.level}${isTrace ? " trace" : ""}`} data-line={l.line}>
          {showTime && !isTrace && <span className="cx-time">{pp.time ?? clock(l.at)}</span>}
          {badge && !isTrace && <span className={`cx-badge ${badge.toLowerCase()}`}>{badge}</span>}
          {showTime && !isTrace && pp.source && <span className="cx-src" title={pp.thread}>{pp.source}</span>}
          <span className="cx-msg">
            {pp.kind === "javac" && (
              <span className="cx-file">
                {pp.file}:{pp.lineNo}{" "}
              </span>
            )}
            {sys ? translateMessage(l.line) : highlight(pp.kind === "mc" || pp.kind === "javac" ? pp.msg : l.line, modId, q)}
          </span>
        </div>
      )}
    </>
  );
}
