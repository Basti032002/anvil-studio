import { t } from "../../i18n";
import { Content, VarDef, VarKind, VarScope } from "../../api";

export const VAR_KINDS: { id: VarKind; label: string; desc: string; def: string }[] = [
  { id: "number", label: t("Zahl"), desc: t("Punkte, Zähler, Leben …"), def: "0" },
  { id: "logic", label: t("Wahr/Falsch"), desc: t("An oder aus, z. B. „Quest erledigt“"), def: "false" },
  { id: "text", label: t("Text"), desc: t("Namen, Nachrichten …"), def: "" },
  { id: "item", label: t("Item"), desc: t("Ein Item, z. B. minecraft:diamond"), def: "minecraft:air" },
  { id: "block", label: t("Block"), desc: t("Ein Block, z. B. minecraft:stone"), def: "minecraft:air" },
  { id: "direction", label: t("Richtung"), desc: t("Norden, Süden, Oben …"), def: "north" },
  { id: "position", label: t("Position"), desc: t("Koordinaten x y z"), def: "0 64 0" },
];

export const VAR_SCOPES: { id: VarScope; label: string; desc: string }[] = [
  { id: "world", label: t("Welt (gespeichert)"), desc: t("Ein Wert für die ganze Welt, bleibt nach Neustart erhalten") },
  { id: "session", label: t("Welt (bis Neustart)"), desc: t("Ein Wert für die ganze Welt, wird beim Neustart zurückgesetzt") },
  { id: "player", label: t("Spieler (gespeichert)"), desc: t("Jeder Spieler hat seinen eigenen Wert, bleibt erhalten") },
  { id: "player_life", label: t("Spieler (bis zum Tod)"), desc: t("Jeder Spieler hat seinen eigenen Wert, beim Sterben zurückgesetzt") },
];

export const varKindLabel = (k: VarKind) => VAR_KINDS.find((x) => x.id === k)?.label ?? k;
export const varScopeLabel = (s: VarScope) => VAR_SCOPES.find((x) => x.id === s)?.label ?? s;
export const cleanVarName = (s: string) => s.toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 40);

/** Eigenschaften eines Knotens, die eine Variable benennen */
const VAR_KEYS = ["var", "var2", "b_var", "pos"];

export interface VarUse {
  blueprint: string;
  node: string;
  label: string;
}

/** Wo eine Variable vorkommt (Knoten-Felder und {var:x}-Texte) */
export function varUsages(content: Content, name: string, nodeLabel: (kind: string) => string): VarUse[] {
  const out: VarUse[] = [];
  const re = new RegExp(`\\{(var|global):${name}\\}`);
  for (const b of content.blueprints) {
    for (const n of b.nodes) {
      const hit = VAR_KEYS.some((k) => n.props[k] === name) || Object.values(n.props).some((v) => typeof v === "string" && re.test(v));
      if (hit) out.push({ blueprint: b.name, node: n.id, label: nodeLabel(n.kind) });
    }
  }
  return out;
}

/** Variable in allen Blueprints umbenennen */
export function renameVar(content: Content, from: string, to: string): Content {
  const re = new RegExp(`\\{(var|global):${from}\\}`, "g");
  return {
    ...content,
    variables: (content.variables ?? []).map((v) => (v.name === from ? { ...v, name: to } : v)),
    blueprints: content.blueprints.map((b) => ({
      ...b,
      nodes: b.nodes.map((n) => {
        const props: Record<string, string> = {};
        for (const [k, v] of Object.entries(n.props)) props[k] = VAR_KEYS.includes(k) && v === from ? to : typeof v === "string" ? v.replace(re, `{$1:${to}}`) : v;
        return { ...n, props };
      }),
    })),
  };
}

/** Variablen, die in Blueprints benutzt, aber nicht angelegt sind */
export function undeclaredVars(content: Content): string[] {
  const defined = new Set((content.variables ?? []).map((v) => v.name));
  const found = new Set<string>();
  for (const b of content.blueprints)
    for (const n of b.nodes) {
      for (const k of VAR_KEYS) if (k !== "pos" || n.kind === "setblock_var") if (n.props[k] && !defined.has(n.props[k])) found.add(n.props[k]);
      for (const v of Object.values(n.props)) if (typeof v === "string") for (const m of v.matchAll(/\{(?:var|global):([a-z0-9_]+)\}/g)) if (!defined.has(m[1])) found.add(m[1]);
    }
  return [...found].sort();
}

export const newVar = (name: string, kind: VarKind = "number", scope: VarScope = "player"): VarDef => ({ name, kind, scope, default: VAR_KINDS.find((k) => k.id === kind)!.def, desc: "" });
