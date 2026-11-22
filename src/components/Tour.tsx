import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { t } from "../i18n";

/**
 * Willkommens-Tour beim ersten Start: führt durch das ganze Studio.
 * Der Nutzer legt dabei selbst ein Projekt und einen ersten Block an.
 * Neu starten: window.dispatchEvent(new Event("anvil:tour-start"))
 */

const DONE_KEY = "anvil.tourDone";

type Step = {
  title: string;
  body: string;
  /** CSS-Selektor des hervorgehobenen Elements (fehlt = Mitte) */
  target?: string;
  /** statt des Elements selbst dessen umgebendes Feld hervorheben */
  closest?: string;
  /** vorher: Bereich/Tab wechseln */
  nav?: string;
  tab?: string;
  /** Mitmach-Schritt: geht weiter, sobald das erfüllt ist */
  waitFor?: () => boolean;
  /** Was der Nutzer jetzt tun soll */
  todo?: string;
};

const has = (sel: string) => !!document.querySelector(sel);

function steps(): Step[] {
  return [
    {
      title: t("Willkommen bei Anvil Studio!"),
      body: t("Mit Anvil Studio baust du eigene Minecraft-Mods – ohne programmieren zu müssen. In ein paar Minuten zeigen wir dir alles Wichtige: Du legst dein erstes eigenes Projekt an, erstellst einen Block und lernst jeden Bereich kennen."),
    },
    {
      target: '[data-tour="activitybar"]',
      title: t("Die Leiste links"),
      body: t("Hier wechselst du zwischen den großen Bereichen: deine Projekte, der Arbeitsbereich des geöffneten Projekts und unten die Einstellungen."),
    },
    {
      nav: "projects",
      target: '[data-tour="nav-projects"]',
      title: t("Deine Projekte"),
      body: t("Jede Mod ist ein Projekt. In dieser Übersicht siehst du alle, kannst sie öffnen, direkt im Spiel testen, importieren oder löschen."),
    },
    {
      nav: "projects",
      target: '[data-tour="new-project"]',
      title: t("Leg dein erstes Projekt an"),
      body: t("Fangen wir mit deiner eigenen Mod an."),
      todo: t("Klicke auf „Neues Projekt“."),
      waitFor: () => has('[data-tour="np-form"]'),
    },
    {
      target: "#name",
      closest: ".field",
      title: t("Name deiner Mod"),
      body: t("So heißt deine Mod im Spiel. Die Mod-ID daneben wird automatisch daraus gebildet – das ist der technische Name, den du später nicht mehr ändern solltest."),
    },
    {
      target: "#mcver",
      closest: ".field",
      title: t("Minecraft-Version"),
      body: t("1.21.1 ist empfohlen und am besten getestet. Die anderen Versionen sind experimentell."),
    },
    {
      target: '[data-tour="np-create"]',
      title: t("Projekt erstellen"),
      body: t("Autor und Beschreibung sind freiwillig. Beim ersten Projekt kann das Anlegen einen Moment dauern, weil die Mod-Vorlage heruntergeladen wird."),
      todo: t("Gib einen Namen ein und klicke auf „Projekt erstellen“."),
      waitFor: () => has(".view-tabs"),
    },
    {
      target: ".undo-group",
      title: t("Dein Arbeitsbereich"),
      body: t("Geschafft – das ist dein Projekt! Oben siehst du, wo du gerade bist. Mit den Pfeilen machst du Änderungen rückgängig oder wiederholst sie, auch mit Strg Z und Strg Y."),
    },
    {
      target: '[data-tour="run"]',
      title: t("Im Spiel testen"),
      body: t("Der grüne Knopf startet Minecraft mit deiner Mod. Links wählst du, wie: selbst spielen (Client), direkt in eine Testwelt oder als Server. Läuft das Spiel, lädst du Texturen, Namen und Rezepte ohne Neustart nach."),
    },
    {
      tab: "content",
      target: '[data-tour="tab-content"]',
      title: t("Inhalte"),
      body: t("Hier entsteht deine Mod: Blöcke, Items, Kreaturen, Welten und Logik. Links ist die Liste, rechts der Editor."),
    },
    {
      tab: "content",
      target: '[data-tour="create"]',
      title: t("Etwas Neues erstellen"),
      body: t("Über diesen Knopf (oder Strg N) legst du alles an, was deine Mod enthalten soll."),
      todo: t("Klicke auf „+“ bzw. „Neu erstellen“."),
      waitFor: () => has(".create-menu"),
    },
    {
      target: '[data-tour="create-block-normal"]',
      title: t("Dein erster Block"),
      body: t("Im Menü findest du alles, was du bauen kannst – nach Art sortiert und mit Suche. Für den Anfang nehmen wir einen einfachen Block."),
      todo: t("Wähle „Block“."),
      waitFor: () => has(".editor-grid"),
    },
    {
      target: ".editor-head",
      title: t("Der Editor"),
      body: t("Name, Textur, Härte, Drops und Rezepte – alles per Formular. Gib deinem Block einen Namen; die Textur malst du rechts oder im Tab „Texturen“."),
    },
    {
      target: ".content-save",
      title: t("Speichern"),
      body: t("Hier siehst du, ob alles gespeichert ist. Mit Strg S speicherst du – dabei wird der Code deiner Mod automatisch erzeugt."),
    },
    {
      tab: "textures",
      target: '[data-tour="tab-textures"]',
      title: t("Texturen"),
      body: t("Ein Malprogramm für Pixel-Texturen mit Ebenen, Formen und Animationen. Fertige Texturen weist du Blöcken und Items zu – bei Blöcken auch jeder Seite einzeln."),
    },
    {
      tab: "vars",
      target: '[data-tour="tab-vars"]',
      title: t("Variablen"),
      body: t("Werte, die sich deine Mod merkt – zum Beispiel Punkte, Mana oder ob ein Spieler etwas schon erledigt hat. Blueprints können sie lesen und ändern."),
    },
    {
      tab: "tags",
      target: '[data-tour="tab-tags"]',
      title: t("Tags"),
      body: t("Gruppen von Blöcken und Items, zum Beispiel „alle Erze“. Damit arbeiten deine Inhalte mit Minecraft und anderen Mods zusammen."),
    },
    {
      tab: "code",
      target: '[data-tour="tab-code"]',
      title: t("Code"),
      body: t("Für Fortgeschrittene: der erzeugte Java-Code und eigene Dateien, auch in VS Code. Für den Anfang brauchst du das nicht."),
    },
    {
      tab: "loc",
      target: '[data-tour="tab-loc"]',
      title: t("Sprachen"),
      body: t("Die Namen deiner Inhalte in weiteren Sprachen. Standard ist Englisch – Deutsch und andere fügst du hier hinzu."),
    },
    {
      tab: "mods",
      target: '[data-tour="tab-mods"]',
      title: t("Mods"),
      body: t("Andere Mods, die beim Testen mitgeladen werden – zum Beispiel JEI, um deine Rezepte im Spiel anzusehen."),
    },
    {
      tab: "settings",
      target: '[data-tour="tab-settings"]',
      title: t("Mod-Einstellungen"),
      body: t("Name, Version, Beschreibung und Logo deiner Mod – und die Minecraft-Version, für die sie gebaut wird."),
    },
    {
      tab: "export",
      target: '[data-tour="tab-export"]',
      title: t("Export"),
      body: t("Ist deine Mod fertig, baust du hier die .jar-Datei. Die können andere einfach in ihren mods-Ordner legen."),
    },
    {
      tab: "console",
      target: '[data-tour="tab-console"]',
      title: t("Konsole"),
      body: t("Zeigt, was beim Bauen, Starten und im Spiel passiert. Fehler und Warnungen findest du gesammelt unter „Probleme“."),
    },
    {
      tab: "content",
      target: '[data-tour="search"]',
      title: t("Suchen & Befehle"),
      body: t("Mit Strg K findest du alles an einem Ort: Projekte, Inhalte und Befehle wie „Im Spiel testen“."),
    },
    {
      nav: "settings",
      target: '[data-tour="nav-settings"]',
      title: t("Einstellungen"),
      body: t("Sprache, Aussehen, Updates und Java. Hier kannst du diese Tour auch jederzeit noch einmal starten."),
    },
    {
      nav: "workspace",
      title: t("Fertig – viel Spaß beim Bauen!"),
      body: t("Du kennst jetzt alle Bereiche. Tipp: Speichere deinen Block, starte das Spiel mit dem grünen Knopf und such ihn im Kreativ-Inventar."),
    },
  ];
}

type Rect = { x: number; y: number; w: number; h: number };

export function Tour() {
  const [idx, setIdx] = useState<number | null>(() => {
    try {
      return localStorage.getItem(DONE_KEY) ? null : 0;
    } catch {
      return null;
    }
  });
  const [rect, setRect] = useState<Rect | null>(null);
  const [, tick] = useState(0);
  const bubble = useRef<HTMLDivElement>(null);
  const [bsize, setBsize] = useState({ w: 360, h: 180 });
  const list = steps();
  const step = idx !== null ? list[idx] : null;

  useEffect(() => {
    const start = () => setIdx(0);
    window.addEventListener("anvil:tour-start", start);
    return () => window.removeEventListener("anvil:tour-start", start);
  }, []);

  // Bereich / Tab passend zum Schritt öffnen
  useEffect(() => {
    if (!step) return;
    if (step.nav) window.dispatchEvent(new CustomEvent("anvil:nav", { detail: step.nav }));
    if (step.tab) {
      const go = () => window.dispatchEvent(new CustomEvent("anvil:open-tab", { detail: step.tab }));
      go();
      const h = window.setTimeout(go, 250);
      return () => window.clearTimeout(h);
    }
  }, [idx]);

  // Ziel verfolgen und Mitmach-Schritte prüfen
  useEffect(() => {
    if (!step) return;
    const h = window.setInterval(() => {
      if (step.waitFor?.()) {
        setIdx((i) => (i === null ? null : Math.min(i + 1, list.length - 1)));
        return;
      }
      let el = step.target ? (document.querySelector(step.target) as HTMLElement | null) : null;
      if (el && step.closest) el = (el.closest(step.closest) as HTMLElement | null) ?? el;
      if (el) {
        const r = el.getBoundingClientRect();
        setRect((old) => (old && old.x === r.x && old.y === r.y && old.w === r.width && old.h === r.height ? old : { x: r.x, y: r.y, w: r.width, h: r.height }));
      } else setRect(null);
      tick((n) => n + 1);
    }, 200);
    return () => window.clearInterval(h);
  }, [idx]);

  useLayoutEffect(() => {
    if (bubble.current) {
      const b = bubble.current.getBoundingClientRect();
      if (Math.abs(b.width - bsize.w) > 1 || Math.abs(b.height - bsize.h) > 1) setBsize({ w: b.width, h: b.height });
    }
  });

  if (!step || idx === null) return null;

  const finish = () => {
    try {
      localStorage.setItem(DONE_KEY, "1");
    } catch {}
    setIdx(null);
  };
  const last = idx === list.length - 1;
  const blocked = !!step.waitFor && !step.waitFor();
  const missing = !!step.target && !rect;

  // Sprechblase neben das Ziel setzen, im Fenster halten
  const pad = 8;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let pos: { left: number; top: number };
  if (!rect || missing) pos = { left: (vw - bsize.w) / 2, top: (vh - bsize.h) / 2 };
  else {
    const right = rect.x + rect.w + 16;
    const below = rect.y + rect.h + 16;
    if (right + bsize.w < vw - 12 && rect.w < vw / 2) pos = { left: right, top: rect.y + rect.h / 2 - bsize.h / 2 };
    else if (below + bsize.h < vh - 12) pos = { left: rect.x + rect.w / 2 - bsize.w / 2, top: below };
    else if (rect.y - 16 - bsize.h > 12) pos = { left: rect.x + rect.w / 2 - bsize.w / 2, top: rect.y - 16 - bsize.h };
    else pos = { left: rect.x - 16 - bsize.w, top: rect.y + rect.h / 2 - bsize.h / 2 };
  }
  pos.left = Math.max(12, Math.min(vw - bsize.w - 12, pos.left));
  pos.top = Math.max(12, Math.min(vh - bsize.h - 12, pos.top));

  return (
    <div className="tour" aria-live="polite">
      {rect && !missing ? (
        <div className="tour-spot" style={{ left: rect.x - pad, top: rect.y - pad, width: rect.w + pad * 2, height: rect.h + pad * 2 }} />
      ) : (
        <div className="tour-dim" />
      )}
      <div ref={bubble} className={idx === 0 || last ? "tour-bubble big" : "tour-bubble"} role="dialog" aria-label={step.title} style={pos}>
        <div className="tour-top">
          <span className="tour-count">
            {idx + 1} / {list.length}
          </span>
          <span className="grow" />
          {!last && (
            <button className="tour-skip" onClick={finish}>
              {idx === 0 ? t("Später") : t("Tour beenden")}
            </button>
          )}
        </div>
        <div className="tour-title">{step.title}</div>
        <div className="tour-body">{step.body}</div>
        {step.todo && (
          <div className={blocked ? "tour-todo" : "tour-todo done"}>
            <span className="tour-todo-dot" />
            {step.todo}
          </div>
        )}
        {missing && !step.todo && <div className="tour-todo">{t("Dieser Teil ist gerade nicht zu sehen – klicke auf „Weiter“.")}</div>}
        <div className="tour-progress">
          <span style={{ width: `${((idx + 1) / list.length) * 100}%` }} />
        </div>
        <div className="tour-actions">
          {idx > 0 && !last && (
            <button className="btn small" onClick={() => setIdx(idx - 1)}>
              {t("Zurück")}
            </button>
          )}
          <span className="grow" />
          {last ? (
            <button className="btn small primary" onClick={finish}>
              {t("Los geht’s")}
            </button>
          ) : blocked ? (
            <span className="muted small">{t("Mach den Schritt – dann geht es weiter.")}</span>
          ) : (
            <button className="btn small primary" onClick={() => setIdx(idx + 1)}>
              {idx === 0 ? t("Tour starten") : t("Weiter")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
