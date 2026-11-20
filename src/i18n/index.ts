// Übersetzungen: Schlüssel ist der deutsche Text. Die Sprache wird beim Start
// gelesen; ein Wechsel lädt die Oberfläche neu (so stimmen auch Texte in
// Konstanten außerhalb von Komponenten).
import en from "./en.json";
import es from "./es.json";
import fr from "./fr.json";
import nl from "./nl.json";
import pl from "./pl.json";
import ru from "./ru.json";
import tr from "./tr.json";

export type Lang = "de" | "en" | "fr" | "es" | "pl" | "nl" | "tr" | "ru";

export const LANGUAGES: { id: Lang; name: string }[] = [
  { id: "de", name: "Deutsch" },
  { id: "en", name: "English" },
  { id: "fr", name: "Français" },
  { id: "es", name: "Español" },
  { id: "pl", name: "Polski" },
  { id: "nl", name: "Nederlands" },
  { id: "tr", name: "Türkçe" },
  { id: "ru", name: "Русский" },
];

const DICTS: Record<string, Record<string, string>> = { en, es, fr, nl, pl, ru, tr };

function detect(): Lang {
  try {
    const saved = localStorage.getItem("anvil.lang") as Lang | null;
    if (saved && LANGUAGES.some((l) => l.id === saved)) return saved;
  } catch {
    /* ignorieren */
  }
  const nav = (navigator.language || "de").slice(0, 2) as Lang;
  return LANGUAGES.some((l) => l.id === nav) ? nav : "en";
}

export const LANG: Lang = detect();
const dict = DICTS[LANG];
document.documentElement.lang = LANG;

/** Übersetzt einen deutschen Text; {name} wird durch vars.name ersetzt. */
export function t(text: string, vars?: Record<string, unknown>): string {
  let s = (dict && dict[text]) || text;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

/** Sprache wechseln: speichern und Oberfläche neu laden (aktuelle Seite bleibt). */
export function setLanguage(lang: Lang, returnTo?: string) {
  try {
    localStorage.setItem("anvil.lang", lang);
    if (returnTo) sessionStorage.setItem("anvil.nav", returnTo);
  } catch {
    /* ignorieren */
  }
  window.location.reload();
}

/** Gespeicherte Seite nach einem Sprachwechsel (einmalig). */
export function takeReturnNav(): string | null {
  try {
    const v = sessionStorage.getItem("anvil.nav");
    sessionStorage.removeItem("anvil.nav");
    return v;
  } catch {
    return null;
  }
}

/** Zahlen und Daten im Format der Sprache. */
export const locale = LANG === "de" ? "de-DE" : LANG;

// ---- Meldungen aus dem Backend (deutsche Vorlagen mit {platzhaltern}) ----

type Pattern = { re: RegExp; names: string[]; to: string };
let patterns: Pattern[] | null = null;
function buildPatterns(): Pattern[] {
  const out: Pattern[] = [];
  if (!dict) return out;
  const keys = Object.keys(dict).filter((k) => /\{[A-Za-z0-9_]+\}/.test(k)).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    const names: string[] = [];
    const src = k
      .split(/(\{[A-Za-z0-9_]+\})/)
      .map((part) => {
        const m = /^\{([A-Za-z0-9_]+)\}$/.exec(part);
        if (m) {
          names.push(m[1]);
          return "([\\s\\S]+?)";
        }
        return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      })
      .join("");
    try {
      out.push({ re: new RegExp(`^${src}$`), names, to: dict[k] });
    } catch {
      /* ungültiges Muster überspringen */
    }
  }
  return out;
}

function translateLine(line: string): string {
  if (!dict || !line) return line;
  const exact = dict[line] ?? dict[line.trim()];
  if (exact) return exact;
  patterns ??= buildPatterns();
  for (const p of patterns) {
    const m = p.re.exec(line);
    if (!m) continue;
    let s = p.to;
    p.names.forEach((n, i) => {
      // Platzhalter können selbst Meldungen sein (z. B. Fehlerketten)
      s = s.split(`{${n}}`).join(translateMessage(m[i + 1]));
    });
    return s;
  }
  return line;
}

/**
 * Übersetzt fertige Meldungen (z. B. Fehler aus dem Backend). Zeilen und
 * Fehlerketten („ → “) werden einzeln übersetzt; Unbekanntes bleibt stehen.
 */
export function translateMessage(text: string): string {
  if (!dict || !text) return text;
  if (text.includes("\n")) {
    const whole = translateLine(text);
    if (whole !== text) return whole;
    return text.split("\n").map(translateMessage).join("\n");
  }
  if (text.includes(" → ")) {
    const whole = translateLine(text);
    if (whole !== text) return whole;
    return text.split(" → ").map(translateLine).join(" → ");
  }
  return translateLine(text);
}
