import { t, LANG } from "../i18n";
import { Fragment, useEffect, useState } from "react";
import { PatchNotes, settingsApi } from "../api";
import { CloseIcon, SparkIcon } from "../icons";

/** Einfaches Markdown: Überschriften, Listen, Absätze, **fett**, `code`. */
function inline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((p, i) =>
    p.startsWith("**") && p.endsWith("**") ? <strong key={i}>{p.slice(2, -2)}</strong> : p.startsWith("`") && p.endsWith("`") ? <code key={i}>{p.slice(1, -1)}</code> : <Fragment key={i}>{p}</Fragment>,
  );
}

function Markdown({ text }: { text: string }) {
  const out: React.ReactNode[] = [];
  let list: string[] = [];
  let para: string[] = [];
  const flush = () => {
    if (list.length) out.push(<ul key={out.length}>{list.map((l, i) => <li key={i}>{inline(l)}</li>)}</ul>);
    if (para.length) out.push(<p key={out.length}>{inline(para.join(" "))}</p>);
    list = [];
    para = [];
  };
  for (const raw of text.replace(/\r/g, "").split("\n")) {
    const line = raw.trimEnd();
    if (/^\s*<sub>.*<\/sub>\s*$/.test(line) || /^(Co-Authored-By|Claude-Session|Signed-off-by):/i.test(line)) continue;
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    const li = line.match(/^\s*[-*]\s+(.*)$/);
    if (h) {
      flush();
      out.push(h[1].length <= 2 ? <h3 key={out.length}>{inline(h[2])}</h3> : <h4 key={out.length}>{inline(h[2])}</h4>);
    } else if (li) {
      if (para.length) flush();
      list.push(li[1]);
    } else if (!line.trim()) flush();
    else {
      if (list.length) flush();
      para.push(line.trim());
    }
  }
  flush();
  return <div className="notes-md">{out}</div>;
}

/** Zeigt nach jedem installierten Update einmalig die Patchnotes. */
export default function PatchNotesDialog() {
  const [notes, setNotes] = useState<PatchNotes | null>(null);
  useEffect(() => {
    const id = window.setTimeout(() => {
      settingsApi
        .patchNotesPending()
        .then((n) => n && setNotes(n))
        .catch(() => {});
    }, 1200);
    return () => window.clearTimeout(id);
  }, []);
  useEffect(() => {
    if (!notes) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  if (!notes) return null;
  function close() {
    if (notes) settingsApi.patchNotesSeen(notes.version).catch(() => {});
    setNotes(null);
  }
  const date = notes.date ? new Date(notes.date).toLocaleDateString(LANG, { day: "numeric", month: "long", year: "numeric" }) : "";
  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className="notes-dialog" role="dialog" aria-label={t("Neu in Version {version}", { version: notes.version })}>
        <div className="notes-head">
          <span className="notes-badge">
            <SparkIcon size={18} />
          </span>
          <div className="grow">
            <div className="panel-title-lg">{t("Neu in Version {version}", { version: notes.version })}</div>
            <div className="muted small">{date ? t("Update installiert · {date}", { date }) : t("Update installiert")}</div>
          </div>
          <button className="icon-btn" onClick={close} aria-label={t("Schließen")} data-tip={t("Schließen")}>
            <CloseIcon size={14} />
          </button>
        </div>
        <div className="notes-body">{notes.body.trim() ? <Markdown text={notes.body} /> : <p className="muted">{t("Für diese Version gibt es keine Beschreibung.")}</p>}</div>
        <div className="notes-foot">
          <button className="btn primary" onClick={close} autoFocus>
            {t("Los geht’s")}
          </button>
        </div>
      </div>
    </div>
  );
}
