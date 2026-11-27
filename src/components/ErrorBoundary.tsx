import { Component, ReactNode } from "react";
import { t } from "../i18n";
import { openReport } from "../report";

/** Fängt Abstürze der Oberfläche ab: statt eines schwarzen Fensters „Neu laden“ und „Problem melden“ */
export default class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    const e = this.state.error;
    if (!e) return this.props.children;
    const text = `${e.name}: ${e.message}\n\n${e.stack ?? ""}`;
    return (
      <div className="crash-screen">
        <div className="crash-card">
          <div className="panel-title-lg">{t("Etwas ist schiefgelaufen")}</div>
          <div className="muted">{t("Diese Ansicht ist abgestürzt. Deine gespeicherten Projekte sind sicher.")}</div>
          <pre className="report-pre">{text.slice(0, 2000)}</pre>
          <div className="row report-actions">
            <button className="btn" onClick={() => openReport({ kind: "app_crash", title: e.message.slice(0, 100), extraLogs: [{ name: t("Fehler in der Oberfläche"), text }] })}>
              {t("Problem melden")}
            </button>
            <span className="grow" />
            <button className="btn primary" onClick={() => location.reload()}>
              {t("Neu laden")}
            </button>
          </div>
        </div>
      </div>
    );
  }
}
