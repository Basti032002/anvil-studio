import { useEffect, useReducer } from "react";
import { t } from "../i18n";
import { RedoIcon, UndoIcon } from "../icons";
import { redo, undo, useUndoState } from "../undo";

/** Rückgängig / Wiederholen oben in der Werkzeugleiste – wirkt auf den gerade offenen Bereich */
export function UndoButtons() {
  const { canUndo, canRedo } = useUndoState();
  // Editoren mit eigenem Verlauf melden nicht jeden Strich – nach Eingaben einmal neu prüfen
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    const f = () => window.setTimeout(force, 0);
    window.addEventListener("pointerup", f);
    window.addEventListener("keyup", f);
    return () => {
      window.removeEventListener("pointerup", f);
      window.removeEventListener("keyup", f);
    };
  }, []);
  return (
    <div className="undo-group" role="group" aria-label={t("Verlauf")}>
      <button className="icon-btn" disabled={!canUndo} onClick={undo} aria-label={t("Rückgängig")} data-tip={t("Rückgängig · Strg Z")}>
        <UndoIcon size={15} />
      </button>
      <button className="icon-btn" disabled={!canRedo} onClick={redo} aria-label={t("Wiederholen")} data-tip={t("Wiederholen · Strg Y")}>
        <RedoIcon size={15} />
      </button>
    </div>
  );
}
