import { t } from "./i18n";
import { useSettings } from "./state";

/**
 * Alle Funktionen, die im Entwicklerbereich mit „Beta“ gekennzeichnet werden können.
 * Die Auswahl wird zentral gespeichert und erscheint bei allen Nutzern.
 */
export type FeatureId =
  // Bereiche (Tabs)
  | "textures"
  | "variables"
  | "tags"
  | "code"
  | "loc"
  | "mods"
  | "modsettings"
  | "export"
  | "console"
  // Inhalte
  | "blocks"
  | "ores"
  | "storage"
  | "workbench"
  | "machines"
  | "energy"
  | "items"
  | "tools"
  | "armor"
  | "mobs"
  | "dimensions"
  | "structures"
  | "blueprints"
  | "guis"
  | "events"
  | "brewing"
  // Werkzeuge
  | "nodes"
  | "portals"
  | "models"
  | "animation"
  | "hotreload";

export const FEATURE_GROUPS: { title: string; items: { id: FeatureId; label: string }[] }[] = [
  {
    title: t("Bereiche"),
    items: [
      { id: "textures", label: t("Texturen") },
      { id: "variables", label: t("Variablen") },
      { id: "tags", label: t("Tags") },
      { id: "code", label: t("Code") },
      { id: "loc", label: t("Sprachen") },
      { id: "mods", label: t("Mods") },
      { id: "modsettings", label: t("Mod-Einstellungen") },
      { id: "export", label: t("Export") },
      { id: "console", label: t("Konsole") },
    ],
  },
  {
    title: t("Inhalte"),
    items: [
      { id: "blocks", label: t("Blöcke") },
      { id: "ores", label: t("Erze") },
      { id: "storage", label: t("Lager-Truhe") },
      { id: "workbench", label: t("Werkbank") },
      { id: "machines", label: t("Maschinen") },
      { id: "energy", label: t("Strom (FE/RF)") },
      { id: "items", label: t("Items") },
      { id: "tools", label: t("Werkzeuge") },
      { id: "armor", label: t("Rüstung") },
      { id: "mobs", label: t("Kreaturen") },
      { id: "dimensions", label: t("Dimensionen") },
      { id: "structures", label: t("Strukturen") },
      { id: "blueprints", label: t("Blueprints") },
      { id: "guis", label: t("Oberflächen") },
      { id: "events", label: t("Ereignisse") },
      { id: "brewing", label: t("Brauen") },
    ],
  },
  {
    title: t("Werkzeuge"),
    items: [
      { id: "nodes", label: t("Knoten-Gelände") },
      { id: "portals", label: t("Portale & Ankunft") },
      { id: "models", label: t("3D-Modell-Editor") },
      { id: "animation", label: t("Textur-Animation") },
      { id: "hotreload", label: t("Änderungen ins laufende Spiel laden") },
    ],
  },
];

export const ALL_FEATURES: FeatureId[] = FEATURE_GROUPS.flatMap((g) => g.items.map((i) => i.id));

export function useBeta(id: FeatureId | undefined | null): boolean {
  const s = useSettings();
  return !!id && !!s?.betaFeatures?.includes(id);
}

/** Kleine „Beta“-Plakette – erscheint nur, wenn die Funktion zentral als Beta markiert ist */
export function BetaBadge({ feature }: { feature: FeatureId | undefined | null }) {
  const on = useBeta(feature);
  if (!on) return null;
  return (
    <span className="beta-badge" data-tip={t("Beta: funktioniert, kann aber noch Fehler haben")}>
      {t("Beta")}
    </span>
  );
}

/** Welche Funktion ein Block oder Item ist (für die Plakette im Editor) */
export function featureOfBlock(b: { kind: string; ore?: { enabled: boolean }; machine?: { electric?: boolean } }): FeatureId {
  if (b.kind === "generator" || b.kind === "battery" || b.kind === "cable" || (b.kind === "machine" && b.machine?.electric)) return "energy";
  if (b.kind === "machine") return "machines";
  if (b.kind === "storage") return "storage";
  if (b.kind === "workbench") return "workbench";
  if (b.ore?.enabled) return "ores";
  return "blocks";
}
export function featureOfItem(i: { kind: string }): FeatureId {
  if (i.kind === "tool") return "tools";
  if (i.kind === "armor") return "armor";
  return "items";
}
