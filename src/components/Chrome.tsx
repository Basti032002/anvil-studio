import { t } from "../i18n";
// Fensterrahmen: eigene Titelleiste, Activity-Bar, Statusleiste und Toasts.
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useState } from "react";
import { JavaStatus } from "../api";
import {
  AlertIcon,
  AnvilLogo,
  CheckIcon,
  CloseIcon,
  CoffeeIcon,
  CubeIcon,
  DownloadIcon,
  GearIcon,
  GridIcon,
  MaximizeIcon,
  MinimizeIcon,
  PlusIcon,
  SearchIcon,
  ShieldIcon,
  SparkIcon,
  WorkshopIcon,
} from "../icons";
import { dismissToast, useAppVersion, useToasts, useUpdate } from "../state";
import { useAllRunning } from "../store";

export function TitleBar({ subtitle, onSearch }: { subtitle?: string; onSearch?: () => void }) {
  const win = getCurrentWindow();
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    win.isMaximized().then(setMaximized).catch(() => {});
    const un = win.onResized(() => win.isMaximized().then(setMaximized).catch(() => {}));
    return () => {
      un.then((f) => f());
    };
  }, []);

  return (
    <header className="titlebar" data-tauri-drag-region>
      <div className="titlebar-brand" data-tauri-drag-region>
        <span className="titlebar-logo">
          <AnvilLogo size={13} />
        </span>
        <span data-tauri-drag-region>{t("Anvil Studio")}</span>
        <ChannelBadge />
        {subtitle && (
          <span className="titlebar-sub" data-tauri-drag-region>
            — {subtitle}
          </span>
        )}
      </div>
      {onSearch ? (
        <button className="command-center" data-tour="search" onClick={onSearch} aria-label={t("Befehlspalette öffnen")}>
          <SearchIcon size={13} />
          <span>{t("Befehl oder Projekt suchen")}</span>
          <kbd>{t("Strg K")}</kbd>
        </button>
      ) : (
        <span className="grow" data-tauri-drag-region />
      )}
      <div className="window-controls">
        <button aria-label={t("Minimieren")} onClick={() => win.minimize()}>
          <MinimizeIcon />
        </button>
        <button aria-label={maximized ? t("Wiederherstellen") : t("Maximieren")} onClick={() => win.toggleMaximize()}>
          <MaximizeIcon />
        </button>
        <button aria-label={t("Schließen")} className="close" onClick={() => win.close()}>
          <CloseIcon />
        </button>
      </div>
    </header>
  );
}

export type NavKey = "workshop" | "projects" | "workspace" | "new" | "settings" | "admin";

export function ActivityBar({
  active,
  hasWorkspace,
  onNavigate,
  settingsBadge,
  showAdmin,
  showWorkshop = true,
}: {
  active: NavKey;
  hasWorkspace: boolean;
  onNavigate: (k: NavKey) => void;
  settingsBadge: boolean;
  showAdmin: boolean;
  showWorkshop?: boolean;
}) {
  const top: { key: NavKey; label: string; icon: React.ReactNode; disabled?: boolean }[] = [
    ...(showWorkshop ? [{ key: "workshop" as NavKey, label: t("Workshop"), icon: <WorkshopIcon size={19} /> }] : []),
    { key: "projects", label: t("Projekte  ·  Strg 1"), icon: <GridIcon size={19} /> },
    { key: "workspace", label: t("Arbeitsbereich"), icon: <CubeIcon size={19} />, disabled: !hasWorkspace },
    { key: "new", label: t("Neues Projekt  ·  Strg N"), icon: <PlusIcon size={19} /> },
  ];
  const topIndex = top.findIndex((t) => t.key === active);
  const bottom: { key: NavKey; label: string; icon: React.ReactNode }[] = [
    ...(showAdmin ? [{ key: "admin" as NavKey, label: t("Entwicklerbereich"), icon: <ShieldIcon size={19} /> }] : []),
    { key: "settings", label: t("Einstellungen  ·  Strg ,"), icon: <GearIcon size={19} /> },
  ];

  return (
    <nav className="activitybar" aria-label={t("Hauptnavigation")} data-tour="activitybar">
      <div className="activity-group">
        {topIndex >= 0 && <span className="activity-indicator" style={{ transform: `translateY(${topIndex * 48}px)` }} />}
        {top.map((t) => (
          <button
            key={t.key}
            className={active === t.key ? "activity-item active" : "activity-item"}
            data-tour={`nav-${t.key}`}
            aria-label={t.label}
            data-tip={t.label}
            disabled={t.disabled}
            onClick={() => onNavigate(t.key)}
          >
            {t.icon}
          </button>
        ))}
      </div>
      <div className="activity-group bottom">
        {bottom.findIndex((b) => b.key === active) >= 0 && (
          <span className="activity-indicator" style={{ transform: `translateY(${bottom.findIndex((b) => b.key === active) * 48}px)` }} />
        )}
        {bottom.map((b) => (
          <button
            key={b.key}
            className={active === b.key ? "activity-item active" : "activity-item"}
            data-tour={`nav-${b.key}`}
            aria-label={b.label}
            data-tip={b.label}
            onClick={() => onNavigate(b.key)}
          >
            {b.icon}
            {b.key === "settings" && settingsBadge && <span className="activity-badge" />}
          </button>
        ))}
      </div>
    </nav>
  );
}

export function StatusBar({
  java,
  javaProgress,
  onInstallJava,
  onOpenSettings,
}: {
  java: JavaStatus | null;
  javaProgress: string | null;
  onInstallJava: () => void;
  onOpenSettings: () => void;
}) {
  const running = Object.values(useAllRunning());
  const update = useUpdate();
  const version = useAppVersion();

  return (
    <footer className="statusbar">
      <div className="status-left">
        {java?.installed ? (
          <span className="status-item">
            <CoffeeIcon size={13} />{" "}{t("Java")}{" "}{java.version}
          </span>
        ) : (
          <button className="status-item warn" onClick={onInstallJava} disabled={!!javaProgress}>
            <AlertIcon size={13} /> {javaProgress ?? (java?.broken ? t("Java beschädigt – reparieren") : t("Java fehlt – jetzt installieren"))}
          </button>
        )}
        {running.length > 0 && (
          <span className="status-item live">
            <span className="pulse-dot" /> {running.length === 1 ? t("{task} läuft", { task: running[0].task }) : t("{length} Prozesse laufen", { length: running.length })}
          </span>
        )}
      </div>
      <div className="status-right">
        {update.phase === "available" && (
          <button className="status-item accent" onClick={onOpenSettings}>
            <DownloadIcon size={13} />{" "}{t("Update")}{" "}{update.info?.version}
            {update.waitingForIdle ? t(" · wartet bis nichts mehr läuft") : ""}
          </button>
        )}
        {update.phase === "downloading" && (
          <span className="status-item accent">
            <DownloadIcon size={13} />{" "}{t("Update wird geladen")}{" "}{update.progress !== undefined ? `${Math.round(update.progress * 100)} %` : "…"}
          </span>
        )}
        {update.phase === "installing" && <span className="status-item accent">{t("Wird installiert – Neustart …")}</span>}
        {update.phase === "checking" && <span className="status-item">{t("Suche nach Updates …")}</span>}
        <span className="status-item">{t("NeoForge")}</span>
        <span className="status-item">v{version}</span>
      </div>
    </footer>
  );
}

export function Toasts() {
  const toasts = useToasts();
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((x) => (
        <div key={x.id} className={`toast ${x.kind} ${x.leaving ? "leaving" : ""}`}>
          <span className="toast-icon">{x.kind === "error" ? <AlertIcon size={15} /> : x.kind === "success" ? <CheckIcon size={15} /> : <SparkIcon size={15} />}</span>
          <span className="toast-text">{x.text}</span>
          <button aria-label={t("Schließen")} className="toast-close" onClick={() => dismissToast(x.id)}>
            <CloseIcon size={11} />
          </button>
        </div>
      ))}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  id,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  id?: string;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={checked ? "toggle on" : "toggle"}
      onClick={() => onChange(!checked)}
    >
      <span className="toggle-knob" />
    </button>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string; disabled?: boolean; title?: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <div className="segmented" role="radiogroup" aria-label={label} style={{ "--count": options.length } as React.CSSProperties}>
      <span className="segmented-thumb" style={{ transform: `translateX(${index * 100}%)` }} />
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={o.value === value ? "segmented-item active" : "segmented-item"}
          disabled={o.disabled}
          title={o.title}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Zeigt BETA/DEV in der Titelleiste, wenn eine Vorabversion läuft. */
function ChannelBadge() {
  const v = useAppVersion();
  if (v.includes("-dev")) return <span className="build-badge dev">DEV</span>;
  if (v.includes("-")) return <span className="build-badge beta">BETA</span>;
  return null;
}
