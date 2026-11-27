import { useEffect, useState } from "react";
import { t } from "../i18n";
import { AlertIcon, CloseIcon } from "../icons";
import { Collected, closeReport, ReportKind, reportApi, useReportRequest } from "../report";
import { toast } from "../state";
import { logText } from "../store";

const TITLES: Record<ReportKind, string> = {
  manual: t("Problem melden"),
  problem: t("Problem melden"),
  app_crash: t("Anvil Studio ist abgestürzt"),
  mc_crash: t("Minecraft ist abgestürzt"),
  build: t("Bauen oder Starten ist fehlgeschlagen"),
};

/** Formular „Problem melden“ – zeigt vor dem Senden genau, was mitgeschickt wird */
export default function ReportDialog() {
  const req = useReportRequest();
  const [asking, setAsking] = useState(true);
  const [data, setData] = useState<Collected | null>(null);
  const [include, setInclude] = useState<Record<string, boolean>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    if (!req) return;
    setAsking(!!req.ask);
    setTitle(req.title ?? "");
    setDesc(req.description ?? "");
    setDone(null);
    setData(null);
    reportApi
      .collect(req.projectId ?? null, !!req.minecraft, req.since ?? null)
      .then((c) => {
        const logs = [...(req.extraLogs ?? []), ...c.logs];
        if (req.projectId) {
          const con = logText(req.projectId);
          if (con.trim()) logs.push({ name: t("Konsole"), text: con });
        }
        setData({ system: c.system, logs });
        setInclude(Object.fromEntries(logs.map((l) => [l.name, true])));
      })
      .catch(() => setData({ system: [], logs: req.extraLogs ?? [] }));
  }, [req]);

  if (!req) return null;
  const close = () => {
    if (req.kind === "app_crash" && !done) reportApi.dismissCrash().catch(() => {});
    closeReport();
  };

  if (asking)
    return (
      <div className="modal-backdrop">
        <div className="dialog report-ask" role="dialog" aria-label={TITLES[req.kind]}>
          <div className="row">
            <span className="report-icon">
              <AlertIcon size={18} />
            </span>
            <div className="grow">
              <div className="panel-title-lg">{TITLES[req.kind]}</div>
              <div className="muted small">{t("Möchtest du das Problem melden? Wir sehen uns die Logs an und beheben den Fehler im nächsten Update.")}</div>
            </div>
          </div>
          <div className="row report-actions">
            <span className="grow" />
            <button className="btn" onClick={close}>
              {t("Nein, danke")}
            </button>
            <button className="btn primary" onClick={() => setAsking(false)} autoFocus>
              {t("Problem melden")}
            </button>
          </div>
        </div>
      </div>
    );

  async function send() {
    if (!req || !data) return;
    setBusy(true);
    try {
      const r = await reportApi.send(
        req.kind,
        title.trim() || TITLES[req.kind],
        desc,
        data.system,
        data.logs.filter((l) => include[l.name]),
      );
      setDone(r.issue ? t("Danke! Deine Meldung ist als #{n} eingegangen.", { n: r.issue }) : t("Danke! Deine Meldung ist eingegangen."));
    } catch (e) {
      toast(String(e), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className="dialog report-dialog" role="dialog" aria-label={TITLES[req.kind]}>
        <div className="row">
          <span className="report-icon">
            <AlertIcon size={18} />
          </span>
          <div className="grow">
            <div className="panel-title-lg">{TITLES[req.kind]}</div>
            <div className="muted small">{t("Die Meldung geht an das Anvil-Studio-Team. Dein Windows-Benutzername wird aus den Logs entfernt.")}</div>
          </div>
          <button className="icon-btn" onClick={close} aria-label={t("Schließen")}>
            <CloseIcon size={14} />
          </button>
        </div>

        {done ? (
          <>
            <div className="callout">{done}</div>
            <div className="row report-actions">
              <span className="grow" />
              <button className="btn primary" onClick={close}>
                {t("Schließen")}
              </button>
            </div>
          </>
        ) : (
          <>
            <label className="field">
              <span className="field-label">{t("Kurz: Was ist passiert?")}</span>
              <input className="input" value={title} maxLength={120} placeholder={TITLES[req.kind]} onChange={(e) => setTitle(e.target.value)} autoFocus />
            </label>
            <label className="field">
              <span className="field-label">{t("Was hast du gemacht, als es passiert ist? (freiwillig)")}</span>
              <textarea className="input report-desc" value={desc} maxLength={8000} onChange={(e) => setDesc(e.target.value)} />
            </label>
            <div className="report-attach">
              <div className="field-label">{t("Wird mitgeschickt")}</div>
              {!data ? (
                <div className="muted small">{t("Sammle Infos …")}</div>
              ) : (
                <>
                  <div className="report-system">
                    {data.system.map(([k, v]) => (
                      <span key={k}>
                        <b>{k}:</b> {v}
                      </span>
                    ))}
                  </div>
                  {data.logs.map((l) => (
                    <div key={l.name} className="report-log">
                      <label className="row">
                        <input type="checkbox" checked={!!include[l.name]} onChange={(e) => setInclude((s) => ({ ...s, [l.name]: e.target.checked }))} />
                        <span className="grow">{l.name}</span>
                        <span className="muted small">{Math.max(1, Math.round(l.text.length / 1024))} KB</span>
                        <button type="button" className="btn small ghost" onClick={() => setOpen(open === l.name ? null : l.name)}>
                          {open === l.name ? t("Ausblenden") : t("Ansehen")}
                        </button>
                      </label>
                      {open === l.name && <pre className="report-pre">{l.text.slice(-20000)}</pre>}
                    </div>
                  ))}
                  {!data.logs.length && <div className="muted small">{t("Keine Logs – nur die Systeminfos.")}</div>}
                </>
              )}
            </div>
            <div className="row report-actions">
              <span className="grow" />
              <button className="btn" onClick={close}>
                {t("Abbrechen")}
              </button>
              <button className="btn primary" disabled={busy || !data} onClick={send}>
                {busy ? t("Sende …") : t("Senden")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
