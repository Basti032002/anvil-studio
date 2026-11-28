import { t } from "../../i18n";
import { Blueprint, BpNode } from "../../api";

// Katalog der Blueprint-Knoten. Muss zu src-tauri/src/blueprint.rs passen.

export type BpCat = "event" | "flow" | "values" | "vars" | "block" | "world" | "player" | "other";
/** Werte-Typen für Werte-Verbindungen */
export type ValType = "num" | "bool" | "text" | "any";
export type PropType = "pinonly" | "text" | "number" | "select" | "item" | "block" | "entity" | "effect" | "sound" | "particle" | "who" | "var" | "dim" | "fn" | "varvalue" | "varop" | "varcmp" | "game" | "scope" | "tag" | "gui" | "entry";
export interface PropSpec {
  key: string;
  label: string;
  type: PropType;
  def: string;
  options?: { id: string; label: string }[];
  /** nur zeigen, wenn eine andere Eigenschaft einen dieser Werte hat */
  when?: { key: string; values: string[] };
  /** und zusätzlich diese Bedingung */
  when2?: { key: string; values: string[] };
  /** kann mit einem Wert verbunden werden */
  pin?: ValType;
  /** type "entry": Auswahl aus den Einträgen eines Plugin-Editors */
  entries?: { plugin: string; editor: string; any?: string };
}
export interface NodeSpec {
  kind: string;
  cat: BpCat;
  label: string;
  desc: string;
  outs: { id: string; label: string }[];
  props: PropSpec[];
  /** Werte-Knoten: liefert einen Wert dieses Typs (kein Ablauf) */
  value?: ValType;
  /** Braucht der Block diese Fähigkeit? (Hinweis im Editor) */
  needs?: string;
  /** kommt aus diesem Plugin */
  plugin?: string;
}

export const CATS: { id: BpCat; label: string }[] = [
  { id: "event", label: t("Ereignisse") },
  { id: "flow", label: t("Logik & Schleifen") },
  { id: "values", label: t("Werte & Rechnen") },
  { id: "vars", label: t("Variablen") },
  { id: "block", label: t("Block & Strom") },
  { id: "world", label: t("Welt") },
  { id: "player", label: t("Spieler & Kreaturen") },
  { id: "other", label: t("Sonstiges") },
];

const NEXT = [{ id: "next", label: "" }];
const who: PropSpec = {
  key: "who",
  label: t("Wer"),
  type: "who",
  def: "player",
  options: [
    { id: "player", label: t("Spieler") },
    { id: "target", label: t("Ziel (z. B. getroffene Kreatur)") },
  ],
};
const sel = (key: string, label: string, def: string, options: [string, string][]): PropSpec => ({ key, label, type: "select", def, options: options.map(([id, label]) => ({ id, label })) });
const numP = (key: string, label: string, def: string): PropSpec => ({ key, label, type: "number", def });
const textP = (key: string, label: string, def: string): PropSpec => ({ key, label, type: "text", def });

const target = (type: PropType, label: string): PropSpec => ({ key: "target", label, type, def: "" });
/** nur für Variablen, die nicht im Variablen-Tab angelegt sind */
const scopeP: PropSpec = { key: "scope", label: t("Gilt für"), type: "scope", def: "player", options: [{ id: "player", label: t("Jeden Spieler einzeln") }, { id: "global", label: t("Die ganze Welt") }] };

/** Variable passend zu einem Feld (value → var, b_value → b_var, value2 → var2) */
export function varKeyFor(key: string): string {
  const pre = key.startsWith("b_") ? "b_" : "";
  const rest = key.slice(pre.length);
  if (rest === "var2" || rest === "value2") return `${pre}var2`;
  return `${pre}var`;
}

export const GAME_VALUES: { id: string; label: string; kinds: string[] }[] = [
  { id: "health", label: t("Leben des Spielers"), kinds: ["number", "text"] },
  { id: "food", label: t("Hunger des Spielers"), kinds: ["number", "text"] },
  { id: "level", label: t("Level des Spielers"), kinds: ["number", "text"] },
  { id: "held_count", label: t("Anzahl Items in der Hand"), kinds: ["number", "text"] },
  { id: "block_energy", label: t("Strom im Block (FE)"), kinds: ["number", "text"] },
  { id: "x", label: t("Position X"), kinds: ["number", "text"] },
  { id: "y", label: t("Position Y"), kinds: ["number", "text"] },
  { id: "z", label: t("Position Z"), kinds: ["number", "text"] },
  { id: "online", label: t("Spieler online"), kinds: ["number", "text"] },
  { id: "time", label: t("Uhrzeit (0–24000)"), kinds: ["number", "text"] },
  { id: "random", label: t("Zufallszahl 0–1"), kinds: ["number", "text"] },
  { id: "target_health", label: t("Leben des Ziels"), kinds: ["number", "text"] },
  { id: "player_name", label: t("Name des Spielers"), kinds: ["text"] },
  { id: "target_name", label: t("Name des Ziels"), kinds: ["text"] },
  { id: "message", label: t("Chatnachricht / Befehl"), kinds: ["text"] },
  { id: "dimension", label: t("Aktuelle Dimension"), kinds: ["text"] },
  { id: "held_item", label: t("Item in der Hand"), kinds: ["item", "text"] },
  { id: "event_item", label: t("Item des Ereignisses"), kinds: ["item", "text"] },
  { id: "block_below", label: t("Block unter dem Spieler"), kinds: ["block", "text"] },
  { id: "event_block", label: t("Block des Ereignisses"), kinds: ["block", "text"] },
  { id: "look", label: t("Blickrichtung"), kinds: ["direction", "text"] },
  { id: "player_pos", label: t("Position des Spielers"), kinds: ["position", "text"] },
  { id: "target_pos", label: t("Position des Ziels"), kinds: ["position", "text"] },
  { id: "event_pos", label: t("Position des Ereignisses"), kinds: ["position", "text"] },
];

/** Felder einer Bedingung (prefix "b_" für die zweite) */
function condProps(prefix: string, extra?: { key: string; values: string[] }): PropSpec[] {
  const w = (values: string[]) => ({ when: { key: `${prefix}cond`, values }, ...(extra ? { when2: extra } : {}) });
  const P = (spec: PropSpec, values: string[]): PropSpec => ({ ...spec, key: prefix + spec.key, ...w(values) });
  return [
    {
      ...sel(`${prefix}cond`, prefix ? t("Zweite Bedingung") : t("Bedingung"), "chance", [
        ["chance", t("Zufall (Prozent)")],
        ["sneaking", t("Spieler schleicht")],
        ["is_sprinting", t("Spieler sprintet")],
        ["raining", t("Es regnet")],
        ["thundering", t("Gewitter")],
        ["day", t("Es ist Tag")],
        ["night", t("Es ist Nacht")],
        ["creative", t("Kreativmodus")],
        ["holding", t("Hält Item in der Hand")],
        ["health_below", t("Leben des Ziels unter")],
        ["full_health", t("Ziel hat volles Leben")],
        ["dimension", t("In Dimension")],
        ["block_below", t("Steht auf Block")],
        ["on_ground", t("Ziel steht auf dem Boden")],
        ["y_above", t("Höhe über")],
        ["y_below", t("Höhe unter")],
        ["message_contains", t("Nachricht enthält")],
        ["var", t("Variable vergleichen")],
        ["has_item", t("Hat Item im Inventar")],
        ["level_at_least", t("Level mindestens")],
        ["in_water", t("Ziel ist im Wasser")],
        ["on_fire", t("Ziel brennt")],
        ["is_player_target", t("Ziel ist ein Spieler")],
        ["players_online", t("Spieler online mindestens")],
        ["has_tag", t("Ziel hat Markierung (Tag)")],
        ["biome", t("In Biom")],
        ["dark", t("Lichtlevel unter")],
        ["entity_is", t("Ziel ist Kreatur")],
        ["flying", t("Spieler fliegt")],
        ["is_baby", t("Ziel ist ein Baby")],
        ["holding_any", t("Hält irgendetwas")],
        ["energy_at_least", t("Block hat mindestens X Strom (FE)")],
        ["block_in_tag", t("Block darunter ist im Tag")],
        ["event_block_in_tag", t("Block des Ereignisses ist im Tag")],
        ["holding_tag", t("Hält Item aus Tag")],
        ["target_in_tag", t("Ziel ist im Tag")],
      ]),
      ...(extra ? { when: extra } : {}),
    },
    { ...sel(`${prefix}not`, t("Umkehren"), "is", [["is", t("Bedingung gilt")], ["not", t("NICHT (gilt nicht)")]]), ...(extra ? { when: extra } : {}) },
    P({ key: "var", label: t("Variable"), type: "var", def: "punkte" }, ["var"]),
    P({ ...scopeP }, ["var"]),
    P(
      {
        key: "cmp",
        label: t("Vergleich"),
        type: "varcmp",
        def: "ge",
        options: [
          { id: "ge", label: "≥" },
          { id: "gt", label: ">" },
          { id: "eq", label: "=" },
          { id: "ne", label: "≠" },
          { id: "le", label: "≤" },
          { id: "lt", label: "<" },
        ],
      },
      ["var"],
    ),
    P({ key: "value", label: t("Wert"), type: "varvalue", def: "10" }, ["var"]),
    P({ key: "value", label: t("Markierung"), type: "text", def: "" }, ["has_tag"]),
    P({ key: "value", label: t("Biom"), type: "text", def: "minecraft:plains" }, ["biome"]),
    P({ key: "value", label: t("Licht (0–15)"), type: "number", def: "8" }, ["dark"]),
    P({ key: "value", label: t("FE"), type: "number", def: "1000" }, ["energy_at_least"]),
    P({ key: "value", label: t("Kreatur"), type: "entity", def: "minecraft:zombie" }, ["entity_is"]),
    P({ key: "value", label: t("Tag"), type: "tag", def: "minecraft:logs" }, ["block_in_tag", "event_block_in_tag", "holding_tag", "target_in_tag"]),
    P({ key: "value", label: t("Item"), type: "item", def: "" }, ["has_item"]),
    P({ key: "count", label: t("Anzahl"), type: "number", def: "1" }, ["has_item"]),
    P({ key: "value", label: t("Level"), type: "number", def: "5" }, ["level_at_least"]),
    P({ key: "value", label: t("Prozent"), type: "number", def: "50" }, ["chance"]),
    P({ key: "value", label: t("Leben"), type: "number", def: "10" }, ["health_below"]),
    P({ key: "value", label: t("Höhe (Y)"), type: "number", def: "64" }, ["y_above", "y_below"]),
    P({ key: "value", label: t("Anzahl"), type: "number", def: "2" }, ["players_online"]),
    P({ key: "value", label: t("Item"), type: "item", def: "" }, ["holding"]),
    P({ key: "value", label: t("Block"), type: "block", def: "" }, ["block_below"]),
    P({ key: "value", label: t("Text"), type: "text", def: "" }, ["message_contains"]),
    P(
      {
        key: "value",
        label: t("Dimension"),
        type: "select",
        def: "overworld",
        options: [
          { id: "overworld", label: t("Oberwelt") },
          { id: "nether", label: t("Nether") },
          { id: "end", label: t("End") },
        ],
      },
      ["dimension"],
    ),
  ];
}

export const NODES: NodeSpec[] = [
  // ---- Ereignisse ----
  { kind: "ev_join", cat: "event", label: t("Spieler betritt die Welt"), desc: t("Beim Einloggen in die Welt oder auf den Server"), outs: NEXT, props: [] },
  { kind: "ev_respawn", cat: "event", label: t("Spieler wiederbelebt"), desc: t("Nach dem Tod wieder erschienen"), outs: NEXT, props: [] },
  { kind: "ev_dimension", cat: "event", label: t("Dimension gewechselt"), desc: t("Nether, End oder zurück"), outs: NEXT, props: [] },
  { kind: "ev_start", cat: "event", label: t("Welt gestartet"), desc: t("Einmal, wenn die Welt bzw. der Server fertig geladen ist"), outs: NEXT, props: [] },
  { kind: "ev_timer", cat: "event", label: t("Alle X Sekunden"), desc: t("Läuft regelmäßig für jeden Spieler"), outs: NEXT, props: [numP("seconds", t("Sekunden"), "60")] },
  { kind: "ev_click_block", cat: "event", label: t("Rechtsklick auf Block"), desc: t("Leer lassen = jeder Block"), outs: NEXT, props: [target("block", t("Block"))] },
  { kind: "ev_click_item", cat: "event", label: t("Rechtsklick mit Item"), desc: t("Leer lassen = jedes Item"), outs: NEXT, props: [target("item", t("Item"))] },
  { kind: "ev_break", cat: "event", label: t("Block abgebaut"), desc: t("Leer lassen = jeder Block"), outs: NEXT, props: [target("block", t("Block"))] },
  { kind: "ev_place", cat: "event", label: t("Block platziert"), desc: t("Leer lassen = jeder Block"), outs: NEXT, props: [target("block", t("Block"))] },
  { kind: "ev_use", cat: "event", label: t("Item benutzt/gegessen"), desc: t("Nach dem Essen oder Trinken"), outs: NEXT, props: [target("item", t("Item"))] },
  { kind: "ev_craft", cat: "event", label: t("Item hergestellt"), desc: t("Beim Herausnehmen aus der Werkbank"), outs: NEXT, props: [target("item", t("Item"))] },
  { kind: "ev_hurt", cat: "event", label: t("Kreatur getroffen"), desc: t("„Ziel“ ist die getroffene Kreatur"), outs: NEXT, props: [target("entity", t("Kreatur"))] },
  { kind: "ev_kill", cat: "event", label: t("Kreatur getötet"), desc: t("„Ziel“ ist die getötete Kreatur"), outs: NEXT, props: [target("entity", t("Kreatur"))] },
  { kind: "ev_jump", cat: "event", label: t("Spieler springt"), desc: t("Bei jedem Sprung"), outs: NEXT, props: [] },
  { kind: "ev_click_entity", cat: "event", label: t("Rechtsklick auf Kreatur"), desc: t("„Ziel“ ist die angeklickte Kreatur"), outs: NEXT, props: [target("entity", t("Kreatur"))] },
  { kind: "ev_left_click_block", cat: "event", label: t("Linksklick auf Block"), desc: t("Beim Anschlagen, bevor er abgebaut ist"), outs: NEXT, props: [target("block", t("Block"))] },
  { kind: "ev_pickup", cat: "event", label: t("Item aufgehoben"), desc: t("Leer lassen = jedes Item"), outs: NEXT, props: [target("item", t("Item"))] },
  { kind: "ev_player_death", cat: "event", label: t("Spieler stirbt"), desc: t("Wenn ein Spieler stirbt"), outs: NEXT, props: [] },
  { kind: "ev_level_up", cat: "event", label: t("Level aufgestiegen"), desc: t("Wenn der Spieler ein Erfahrungslevel erreicht"), outs: NEXT, props: [] },
  { kind: "ev_leave", cat: "event", label: t("Spieler verlässt die Welt"), desc: t("Beim Ausloggen"), outs: NEXT, props: [] },
  { kind: "ev_command", cat: "event", label: t("Chat-Befehl"), desc: t("Eigener Befehl, z. B. /belohnung"), outs: NEXT, props: [textP("command", t("Befehl"), "/belohnung")] },
  { kind: "ev_toss", cat: "event", label: t("Item weggeworfen"), desc: t("Mit Q fallen gelassen"), outs: NEXT, props: [target("item", t("Item"))] },
  { kind: "ev_player_hurt", cat: "event", label: t("Spieler erleidet Schaden"), desc: t("„Ziel“ ist der Angreifer (falls es einen gibt)"), outs: NEXT, props: [] },
  { kind: "ev_fish", cat: "event", label: t("Etwas geangelt"), desc: t("Beim Einholen der Angel"), outs: NEXT, props: [] },
  { kind: "ev_function", cat: "event", label: t("Eigene Funktion"), desc: t("Wird mit „Funktion aufrufen“ gestartet – aus jedem Blueprint"), outs: NEXT, props: [textP("fn", t("Name"), "belohnung")] },
  { kind: "ev_chat", cat: "event", label: t("Chatnachricht"), desc: t("Mit „Wenn → Nachricht enthält“ auf Wörter reagieren"), outs: NEXT, props: [] },

  // ---- Ablauf ----
  {
    kind: "if",
    cat: "flow",
    label: t("Wenn"),
    desc: t("Verzweigt je nach Bedingung – mit NICHT, UND, ODER"),
    outs: [
      { id: "true", label: t("Ja") },
      { id: "false", label: t("Nein") },
      { id: "next", label: t("Danach") },
    ],
    props: [
      { key: "ifcond", label: t("Bedingung (verbunden)"), type: "pinonly", def: "", pin: "bool" },
      ...condProps(""),
      sel("join", t("Verknüpfen"), "none", [["none", t("Nur diese Bedingung")], ["and", t("UND zweite Bedingung")], ["or", t("ODER zweite Bedingung")]]),
      ...condProps("b_", { key: "join", values: ["and", "or"] }),
    ],
  },
  {
    kind: "while",
    cat: "flow",
    label: t("Solange"),
    desc: t("Wiederholt, solange die Bedingung gilt (höchstens „Max.“ mal)"),
    outs: [
      { id: "body", label: t("Wiederholen") },
      { id: "done", label: t("Danach") },
    ],
    props: [...condProps(""), numP("max", t("Max. Durchläufe"), "100")],
  },
  {
    kind: "for_players",
    cat: "flow",
    label: t("Für jeden Spieler"),
    desc: t("„Spieler“ ist im Ablauf jeweils der nächste Spieler"),
    outs: [
      { id: "body", label: t("Je Spieler") },
      { id: "done", label: t("Danach") },
    ],
    props: [sel("range", t("Welche"), "all", [["all", t("Alle Spieler")], ["radius", t("Im Umkreis")]]), { ...numP("radius", t("Umkreis (Blöcke)"), "16"), when: { key: "range", values: ["radius"] } }],
  },
  {
    kind: "for_entities",
    cat: "flow",
    label: t("Für jede Kreatur im Umkreis"),
    desc: t("„Ziel“ ist im Ablauf jeweils die nächste Kreatur"),
    outs: [
      { id: "body", label: t("Je Kreatur") },
      { id: "done", label: t("Danach") },
    ],
    props: [numP("radius", t("Umkreis (Blöcke)"), "8"), { key: "entity", label: t("Nur diese Art (leer = alle)"), type: "entity", def: "" }, sel("players", t("Spieler mitzählen"), "no", [["no", t("Nein")], ["yes", t("Ja")]])],
  },
  { kind: "stop", cat: "flow", label: t("Stoppen"), desc: t("Beendet diesen Ablauf sofort"), outs: [], props: [] },
  { kind: "call", cat: "flow", label: t("Funktion aufrufen"), desc: t("Führt eine eigene Funktion aus"), outs: NEXT, props: [{ key: "fn", label: t("Funktion"), type: "fn", def: "" }] },
  { kind: "delay", cat: "flow", label: t("Warten"), desc: t("Führt den Rest später aus"), outs: NEXT, props: [numP("seconds", t("Sekunden"), "2")] },
  {
    kind: "repeat",
    cat: "flow",
    label: t("Wiederholen"),
    desc: t("Führt „Mehrmals“ mehrfach aus"),
    outs: [
      { id: "body", label: t("Mehrmals") },
      { id: "done", label: t("Danach") },
    ],
    props: [numP("times", t("Anzahl"), "3")],
  },
  { kind: "cancel", cat: "flow", label: t("Handlung verhindern"), desc: t("Z. B. Abbauen oder Chatnachricht stoppen (nicht nach „Warten“)"), outs: NEXT, props: [] },

  // ---- Variablen ----
  {
    kind: "var_set",
    cat: "vars",
    label: t("Variable setzen"),
    desc: t("Im Text mit {var:name} anzeigen"),
    outs: NEXT,
    props: [
      { key: "var", label: t("Variable"), type: "var", def: "punkte" },
      { ...scopeP },
      { key: "op", label: t("Rechnung"), type: "varop", def: "set" },
      sel("src", t("Wert kommt von"), "value", [["value", t("Fester Wert")], ["var", t("Andere Variable")], ["game", t("Aus dem Spiel")]]),
      { key: "value", label: t("Wert"), type: "varvalue", def: "1", when: { key: "src", values: ["value"] }, pin: "any" },
      { key: "var2", label: t("Andere Variable"), type: "var", def: "", when: { key: "src", values: ["var"] } },
      { key: "game", label: t("Spielwert"), type: "game", def: "health", when: { key: "src", values: ["game"] } },
    ],
  },
  {
    kind: "var_math",
    cat: "vars",
    label: t("Mit Variablen rechnen"),
    desc: t("Variable = Variable (+ − × ÷ …) Zahl oder andere Variable"),
    outs: NEXT,
    props: [
      { key: "var", label: t("Variable"), type: "var", def: "punkte" },
      { ...scopeP },
      sel("op", t("Rechnung"), "add", [["add", "+"], ["sub", "−"], ["mul", "×"], ["div", "÷"], ["mod", t("Rest (mod)")], ["min", t("Kleinerer Wert (min)")], ["max", t("Größerer Wert (max)")], ["set", t("Setzen auf")], ["rand", t("Zufallszahl unter")]]),
      sel("src", t("Mit"), "num", [["num", t("Zahl")], ["var", t("Anderer Variable")]]),
      { ...numP("value", t("Zahl"), "1"), when: { key: "src", values: ["num"] } },
      { key: "var2", label: t("Andere Variable"), type: "var", def: "", when: { key: "src", values: ["var"] } },
      { ...scopeP, key: "scope2", label: t("Andere gilt für"), when: { key: "src", values: ["var"] } },
    ],
  },
  { kind: "var_show", cat: "vars", label: t("Variable anzeigen"), desc: t("Als Tabelle am Bildschirmrand"), outs: NEXT, props: [{ key: "var", label: t("Variable"), type: "var", def: "punkte" }, sel("slot", t("Ort"), "sidebar", [["sidebar", t("Rechts am Rand")], ["list", t("Spielerliste (Tab)")]])] },
  { kind: "var_hide", cat: "vars", label: t("Anzeige ausblenden"), desc: t("Tabelle am Rand entfernen"), outs: NEXT, props: [] },
  { kind: "tp_var", cat: "vars", label: t("Zu Position-Variable teleportieren"), desc: t("Variable vom Typ Position"), outs: NEXT, props: [{ key: "var", label: t("Variable"), type: "var", def: "heimat" }, who] },
  { kind: "give_var", cat: "vars", label: t("Item aus Variable geben"), desc: t("Variable vom Typ Item"), outs: NEXT, props: [{ key: "var", label: t("Variable"), type: "var", def: "" }, numP("count", t("Anzahl"), "1")] },
  {
    kind: "setblock_var",
    cat: "vars",
    label: t("Block aus Variable setzen"),
    desc: t("Variable vom Typ Block"),
    outs: NEXT,
    props: [
      { key: "var", label: t("Variable (Block)"), type: "var", def: "" },
      sel("at", t("Wo"), "here", [["here", t("An der Position")], ["below", t("Darunter")], ["var", t("An Position-Variable")]]),
      { key: "pos", label: t("Position-Variable"), type: "var", def: "", when: { key: "at", values: ["var"] } },
    ],
  },
  { kind: "summon_at_var", cat: "vars", label: t("Kreatur an Position-Variable"), desc: "", outs: NEXT, props: [{ key: "entity", label: t("Kreatur"), type: "entity", def: "minecraft:pig" }, { key: "var", label: t("Position-Variable"), type: "var", def: "" }] },

  // ---- Welt ----
  { kind: "weather", cat: "world", label: t("Wetter ändern"), desc: "", outs: NEXT, props: [sel("weather", t("Wetter"), "rain", [["clear", t("Klar")], ["rain", t("Regen")], ["thunder", t("Gewitter")]]), numP("seconds", t("Dauer (Sek.)"), "300")] },
  { kind: "time", cat: "world", label: t("Uhrzeit setzen"), desc: "", outs: NEXT, props: [sel("time", t("Zeit"), "day", [["day", t("Morgen")], ["noon", t("Mittag")], ["night", t("Abend")], ["midnight", t("Mitternacht")]])] },
  { kind: "summon", cat: "world", label: t("Kreatur erscheinen lassen"), desc: "", outs: NEXT, props: [{ key: "entity", label: t("Kreatur"), type: "entity", def: "minecraft:zombie" }, numP("count", t("Anzahl"), "1")] },
  { kind: "place_structure", cat: "world", label: t("Struktur platzieren"), desc: t("Vanilla-Struktur an der Position"), outs: NEXT, props: [sel("structure", t("Struktur"), "minecraft:igloo", [["minecraft:igloo", t("Iglu")], ["minecraft:village_plains", t("Dorf (Ebene)")], ["minecraft:desert_pyramid", t("Wüstentempel")], ["minecraft:jungle_pyramid", t("Dschungeltempel")], ["minecraft:pillager_outpost", t("Plünderer-Außenposten")], ["minecraft:shipwreck", t("Schiffswrack")], ["minecraft:ruined_portal", t("Portalruine")], ["minecraft:witch_hut", t("Hexenhütte")], ["minecraft:trail_ruins", t("Pfadruine")]])] },
  { kind: "lightning", cat: "world", label: t("Blitz einschlagen"), desc: "", outs: NEXT, props: [] },
  { kind: "explode", cat: "world", label: t("Explosion"), desc: "", outs: NEXT, props: [numP("power", t("Stärke"), "2")] },
  {
    kind: "setblock",
    cat: "world",
    label: t("Block setzen"),
    desc: t("Versatz relativ zur Position"),
    outs: NEXT,
    props: [{ key: "block", label: t("Block"), type: "block", def: "minecraft:stone" }, numP("dx", "X", "0"), numP("dy", "Y", "0"), numP("dz", "Z", "0")],
  },
  { kind: "drop_item", cat: "world", label: t("Item fallen lassen"), desc: t("Erscheint als Item auf dem Boden"), outs: NEXT, props: [{ key: "item", label: t("Item"), type: "item", def: "minecraft:diamond" }, numP("count", t("Anzahl"), "1")] },
  {
    kind: "fill",
    cat: "world",
    label: t("Fläche füllen"),
    desc: t("Quadrat um die Position, Radius bis 15"),
    outs: NEXT,
    props: [{ key: "block", label: t("Block"), type: "block", def: "minecraft:glass" }, numP("radius", t("Radius"), "2"), numP("height", t("Höhe"), "1"), numP("dy", t("Versatz Y"), "-1")],
  },
  {
    kind: "travel",
    cat: "world",
    label: t("In Dimension reisen"),
    desc: t("„Hin und zurück“: wer schon dort ist, kommt in die Oberwelt"),
    outs: NEXT,
    props: [{ key: "dim", label: t("Dimension"), type: "dim", def: "minecraft:overworld" }, sel("mode", t("Art"), "toggle", [["toggle", t("Hin und zurück")], ["go", t("Nur hin")]])],
  },
  { kind: "firework", cat: "world", label: t("Feuerwerk"), desc: "", outs: NEXT, props: [] },
  { kind: "particle", cat: "world", label: t("Partikel"), desc: "", outs: NEXT, props: [{ key: "particle", label: t("Partikel"), type: "particle", def: "minecraft:heart" }, numP("count", t("Anzahl"), "20")] },
  { kind: "sound", cat: "world", label: t("Geräusch abspielen"), desc: "", outs: NEXT, props: [{ key: "sound", label: t("Geräusch"), type: "sound", def: "minecraft:entity.player.levelup" }] },
  {
    kind: "difficulty",
    cat: "world",
    label: t("Schwierigkeit"),
    desc: "",
    outs: NEXT,
    props: [sel("difficulty", t("Schwierigkeit"), "normal", [["peaceful", t("Friedlich")], ["easy", t("Einfach")], ["normal", t("Normal")], ["hard", t("Schwer")]])],
  },

  // ---- Spieler & Kreaturen ----
  { kind: "message", cat: "player", label: t("Nachricht im Chat"), desc: t("{player} = Name des Spielers"), outs: NEXT, props: [{ ...textP("text", t("Text"), t("Hallo {player}!")), pin: "text" }, sel("to", t("An"), "player", [["player", t("Spieler")], ["all", t("Alle")]])] },
  {
    kind: "title",
    cat: "player",
    label: t("Großer Titel"),
    desc: t("Text mitten auf dem Bildschirm"),
    outs: NEXT,
    props: [textP("text", t("Text"), t("Willkommen!")), textP("subtitle", t("Untertitel"), ""), sel("to", t("An"), "player", [["player", t("Spieler")], ["all", t("Alle")]])],
  },
  {
    kind: "bossbar",
    cat: "player",
    label: t("Bossleiste"),
    desc: t("Leiste oben am Bildschirm, 0 Sekunden = bleibt"),
    outs: NEXT,
    props: [
      textP("text", t("Text"), t("Der Endgegner naht")),
      sel("color", t("Farbe"), "purple", [["purple", t("Lila")], ["red", t("Rot")], ["blue", t("Blau")], ["green", t("Grün")], ["yellow", t("Gelb")], ["pink", t("Rosa")], ["white", t("Weiß")]]),
      numP("progress", t("Füllung (%)"), "100"),
      numP("seconds", t("Sekunden"), "10"),
      sel("to", t("An"), "player", [["player", t("Spieler")], ["all", t("Alle")]]),
    ],
  },
  { kind: "actionbar", cat: "player", label: t("Text über der Leiste"), desc: t("{player} = Name des Spielers"), outs: NEXT, props: [{ ...textP("text", t("Text"), t("Psst …")), pin: "text" }] },
  { kind: "give", cat: "player", label: t("Item geben"), desc: "", outs: NEXT, props: [{ key: "item", label: t("Item"), type: "item", def: "minecraft:diamond" }, numP("count", t("Anzahl"), "1")] },
  { kind: "effect", cat: "player", label: t("Trankeffekt geben"), desc: "", outs: NEXT, props: [{ key: "effect", label: t("Effekt"), type: "effect", def: "speed" }, numP("seconds", t("Sekunden"), "10"), numP("level", t("Effektstufe"), "1"), who] },
  { kind: "remove_item", cat: "player", label: t("Item wegnehmen"), desc: t("Aus dem Inventar entfernen"), outs: NEXT, props: [{ key: "item", label: t("Item"), type: "item", def: "minecraft:dirt" }, numP("count", t("Anzahl"), "1")] },
  { kind: "random_tp", cat: "player", label: t("Zufällig teleportieren"), desc: t("Irgendwo im Umkreis auf festen Boden"), outs: NEXT, props: [numP("radius", t("Umkreis (Blöcke)"), "50")] },
  { kind: "set_name", cat: "player", label: t("Namen geben"), desc: t("Namensschild für das Ziel (keine Spieler)"), outs: NEXT, props: [textP("text", t("Name"), "Bello")] },
  { kind: "equip", cat: "player", label: t("Ausrüsten"), desc: t("Item direkt in einen Slot legen"), outs: NEXT, props: [{ key: "item", label: t("Item"), type: "item", def: "minecraft:diamond_helmet" }, sel("slot", t("Slot"), "head", [["head", t("Kopf")], ["chest", t("Brust")], ["legs", t("Beine")], ["feet", t("Füße")], ["hand", t("Haupthand")], ["offhand", t("Zweithand")]])] },
  { kind: "feed", cat: "player", label: t("Sättigen"), desc: t("Hunger komplett auffüllen"), outs: NEXT, props: [] },
  { kind: "spawnpoint", cat: "player", label: t("Wiederbelebungspunkt setzen"), desc: t("Spieler erscheint nach dem Tod hier"), outs: NEXT, props: [] },
  {
    kind: "enchant",
    cat: "player",
    label: t("Item in der Hand verzaubern"),
    desc: "",
    outs: NEXT,
    props: [
      sel("enchant", t("Verzauberung"), "sharpness", [
        ["sharpness", t("Schärfe")],
        ["efficiency", t("Effizienz")],
        ["unbreaking", t("Haltbarkeit")],
        ["fortune", t("Glück")],
        ["looting", t("Plünderung")],
        ["fire_aspect", t("Verbrennung")],
        ["knockback", t("Rückstoß")],
        ["protection", t("Schutz")],
        ["mending", t("Reparatur")],
        ["silk_touch", t("Behutsamkeit")],
      ]),
      numP("level", t("Effektstufe"), "1"),
    ],
  },
  { kind: "clear_effects", cat: "player", label: t("Effekte entfernen"), desc: "", outs: NEXT, props: [who] },
  { kind: "heal", cat: "player", label: t("Heilen"), desc: t("2 = ein Herz"), outs: NEXT, props: [numP("amount", t("Menge"), "4"), who] },
  { kind: "damage", cat: "player", label: t("Schaden zufügen"), desc: t("2 = ein Herz"), outs: NEXT, props: [numP("amount", t("Menge"), "2"), who] },
  { kind: "fire", cat: "player", label: t("Anzünden"), desc: "", outs: NEXT, props: [numP("seconds", t("Sekunden"), "5"), who] },
  { kind: "launch", cat: "player", label: t("In die Luft schleudern"), desc: "", outs: NEXT, props: [numP("strength", t("Stärke"), "2"), who] },
  { kind: "teleport", cat: "player", label: t("Teleportieren"), desc: t("Versatz relativ zur Position"), outs: NEXT, props: [numP("dx", "X", "0"), numP("dy", "Y", "10"), numP("dz", "Z", "0"), who] },
  { kind: "xp", cat: "player", label: t("Erfahrung geben"), desc: "", outs: NEXT, props: [numP("amount", t("Punkte"), "10")] },
  {
    kind: "gamemode",
    cat: "player",
    label: t("Spielmodus ändern"),
    desc: "",
    outs: NEXT,
    props: [sel("mode", t("Modus"), "creative", [["survival", t("Überleben")], ["creative", t("Kreativ")], ["adventure", t("Abenteuer")], ["spectator", t("Zuschauer")]])],
  },
  { kind: "clear_inventory", cat: "player", label: t("Inventar leeren"), desc: "", outs: NEXT, props: [who] },
  { kind: "kill", cat: "player", label: t("Töten"), desc: "", outs: NEXT, props: [who] },

  // ---- Sonstiges ----
  // ---- neue Aktionen ----
  { kind: "set_health", cat: "player", label: t("Leben setzen"), desc: t("2 = ein Herz"), outs: NEXT, props: [numP("amount", t("Leben"), "20"), who] },
  { kind: "set_food", cat: "player", label: t("Hunger setzen"), desc: t("0–20"), outs: NEXT, props: [numP("amount", t("Hunger"), "20")] },
  { kind: "fly", cat: "player", label: t("Fliegen erlauben"), desc: t("Wie im Kreativmodus"), outs: NEXT, props: [sel("on", t("Zustand"), "true", [["true", t("An")], ["false", t("Aus")]])] },
  { kind: "xp_level", cat: "player", label: t("Level setzen"), desc: "", outs: NEXT, props: [numP("amount", t("Level"), "10")] },
  {
    kind: "attribute",
    cat: "player",
    label: t("Eigenschaft ändern"),
    desc: t("Größe, Tempo, Sprungkraft …"),
    outs: NEXT,
    props: [
      sel("attr", t("Eigenschaft"), "scale", [["scale", t("Größe (1 = normal)")], ["speed", t("Tempo (0.1 = normal)")], ["jump", t("Sprungkraft (0.42 = normal)")], ["max_health", t("Max. Leben (20 = normal)")], ["damage", t("Angriffsschaden (1 = normal)")], ["reach", t("Reichweite (4.5 = normal)")], ["gravity", t("Schwerkraft (0.08 = normal)")], ["step", t("Stufenhöhe (0.6 = normal)")]]),
      numP("value", t("Wert"), "1.5"),
      who,
    ],
  },
  { kind: "attribute_reset", cat: "player", label: t("Eigenschaften zurücksetzen"), desc: t("Alle Werte wieder normal"), outs: NEXT, props: [who] },
  { kind: "tag_add", cat: "player", label: t("Markierung (Tag) setzen"), desc: t("Für /tag und Bedingungen"), outs: NEXT, props: [textP("tag", t("Markierung"), "vip"), who] },
  { kind: "tag_remove", cat: "player", label: t("Markierung (Tag) entfernen"), desc: "", outs: NEXT, props: [textP("tag", t("Markierung"), "vip"), who] },
  { kind: "repair", cat: "player", label: t("Item in der Hand reparieren"), desc: "", outs: NEXT, props: [] },
  { kind: "glow", cat: "player", label: t("Leuchten (durch Wände sichtbar)"), desc: "", outs: NEXT, props: [sel("on", t("Zustand"), "true", [["true", t("An")], ["false", t("Aus")]]), who] },
  { kind: "invisible", cat: "player", label: t("Unsichtbar machen"), desc: "", outs: NEXT, props: [sel("on", t("Zustand"), "true", [["true", t("An")], ["false", t("Aus")]]), who] },
  { kind: "freeze", cat: "player", label: t("Kreatur einfrieren (keine KI)"), desc: t("Wirkt auf das Ziel"), outs: NEXT, props: [sel("on", t("Zustand"), "true", [["true", t("An")], ["false", t("Aus")]])] },
  { kind: "knockback", cat: "player", label: t("Ziel wegstoßen"), desc: "", outs: NEXT, props: [numP("strength", t("Stärke"), "1.5")] },
  { kind: "remove_entity", cat: "player", label: t("Ziel entfernen"), desc: t("Ohne Drops, nicht bei Spielern"), outs: NEXT, props: [] },
  { kind: "extinguish", cat: "player", label: t("Feuer löschen"), desc: "", outs: NEXT, props: [who] },
  { kind: "kick", cat: "player", label: t("Spieler rauswerfen"), desc: t("Trennt die Verbindung"), outs: NEXT, props: [textP("text", t("Grund"), "Tschüss {player}")] },
  { kind: "energy_add", cat: "world", label: t("Strom in Block laden"), desc: t("Füllt FE in den Block – geht auch bei Blöcken anderer Mods"), outs: NEXT, props: [numP("amount", t("FE"), "1000"), sel("where", t("Wo"), "here", [["here", t("An der Position")], ["below", t("Darunter")]])] },
  { kind: "energy_take", cat: "world", label: t("Strom aus Block nehmen"), desc: t("Zieht FE aus dem Block ab"), outs: NEXT, props: [numP("amount", t("FE"), "1000"), sel("where", t("Wo"), "here", [["here", t("An der Position")], ["below", t("Darunter")]])] },
  { kind: "break_block", cat: "world", label: t("Block abbauen"), desc: "", outs: NEXT, props: [sel("where", t("Wo"), "here", [["here", t("An der Position")], ["below", t("Darunter")]]), sel("drops", t("Drops"), "true", [["true", t("Mit Drops")], ["false", t("Ohne Drops")]])] },
  {
    kind: "gamerule",
    cat: "world",
    label: t("Spielregel ändern"),
    desc: "",
    outs: NEXT,
    props: [
      sel("rule", t("Regel"), "keepInventory", [["keepInventory", t("Inventar behalten")], ["doDaylightCycle", t("Tageszeit läuft")], ["doWeatherCycle", t("Wetter wechselt")], ["mobGriefing", t("Kreaturen zerstören Blöcke")], ["doMobSpawning", t("Kreaturen spawnen")], ["doFireTick", t("Feuer breitet sich aus")], ["naturalRegeneration", t("Natürliche Heilung")], ["doImmediateRespawn", t("Sofort wiederbeleben")], ["showDeathMessages", t("Todesnachrichten")], ["doInsomnia", t("Phantome")]]),
      sel("value", t("Wert"), "true", [["true", t("An")], ["false", t("Aus")]]),
    ],
  },
  { kind: "worldborder", cat: "world", label: t("Weltbarriere setzen"), desc: "", outs: NEXT, props: [numP("size", t("Größe (Blöcke)"), "1000")] },
  { kind: "time_add", cat: "world", label: t("Zeit vorspulen"), desc: t("1000 Ticks ≈ 1 Stunde"), outs: NEXT, props: [numP("ticks", t("Ticks"), "1000")] },
  { kind: "xp_orb", cat: "world", label: t("Erfahrungskugel erzeugen"), desc: "", outs: NEXT, props: [numP("amount", t("Erfahrung"), "10")] },
  { kind: "open_gui", cat: "other", label: t("Oberfläche öffnen"), desc: t("Zeigt dem Spieler eine Oberfläche aus dem GUI-Editor"), outs: NEXT, props: [{ key: "gui", label: t("Oberfläche"), type: "gui", def: "" }] },
  { kind: "close_gui", cat: "other", label: t("Oberfläche schließen"), desc: "", outs: NEXT, props: [] },
  { kind: "log", cat: "other", label: t("In Konsole schreiben"), desc: t("Zum Testen, erscheint im Konsolen-Tab"), outs: NEXT, props: [{ ...textP("text", t("Text"), "Wert: {var:punkte}"), pin: "text" }] },
  { kind: "command", cat: "other", label: t("Befehl ausführen"), desc: t("@s = Spieler, {var:name} setzt Variablen ein"), outs: NEXT, props: [textP("command", t("Befehl"), "say Hallo"), who] },

  // ---- Block-Ereignisse (für Blöcke mit Fähigkeiten) ----
  { kind: "ev_block_tick", cat: "event", label: t("Block-Tick"), desc: t("Läuft regelmäßig für jeden gesetzten Block – Takt in der Fähigkeit „Tick-Logik“"), outs: NEXT, props: [{ key: "target", label: t("Block (leer = jeder mit Fähigkeiten)"), type: "block", def: "" }], needs: "tick" },
  { kind: "ev_block_use", cat: "event", label: t("Block wird benutzt"), desc: t("Rechtsklick auf den Block – ersetzt das normale Öffnen"), outs: NEXT, props: [{ key: "target", label: t("Block (leer = jeder mit Fähigkeiten)"), type: "block", def: "" }] },
  { kind: "ev_block_redstone", cat: "event", label: t("Redstone geändert"), desc: t("Der Block bekommt Redstone-Strom oder verliert ihn"), outs: NEXT, props: [{ key: "target", label: t("Block (leer = jeder mit Fähigkeiten)"), type: "block", def: "" }] },

  // ---- Block & Strom (dieser Block = Block des Ereignisses) ----
  { kind: "blk_energy_gen", cat: "block", label: t("Strom erzeugen"), desc: t("Legt Strom in den Speicher dieses Blocks"), outs: NEXT, props: [{ ...numP("amount", t("Menge (FE)"), "20"), pin: "num" }], needs: "energy" },
  {
    kind: "blk_energy_use",
    cat: "block",
    label: t("Strom verbrauchen"),
    desc: t("Nimmt Strom aus dem Speicher – nur wenn genug da ist"),
    outs: [
      { id: "ok", label: t("Genug Strom") },
      { id: "fail", label: t("Zu wenig") },
      { id: "next", label: t("Danach") },
    ],
    props: [{ ...numP("amount", t("Menge (FE)"), "20"), pin: "num" }],
    needs: "energy",
  },
  { kind: "blk_energy_push", cat: "block", label: t("Strom an Nachbarn abgeben"), desc: t("Gibt Strom an Kabel, Akkus und Maschinen ab"), outs: NEXT, props: [{ ...numP("amount", t("Höchstens (FE)"), "100"), pin: "num" }, sel("side", t("Wohin"), "all", [["all", t("Alle Seiten")], ["front", t("Nur vorne")]])], needs: "energy" },
  { kind: "blk_lit", cat: "block", label: t("An/Aus setzen"), desc: t("Schaltet den Zustand „an“ – mit eigener Textur und Licht"), outs: NEXT, props: [{ ...sel("value", t("Zustand"), "true", [["true", t("An")], ["false", t("Aus")]]), pin: "bool" }], needs: "active" },
  { kind: "blk_signal", cat: "block", label: t("Redstone-Signal senden"), desc: t("0 = aus, 15 = volle Stärke"), outs: NEXT, props: [{ ...numP("power", t("Stärke (0–15)"), "15"), pin: "num" }], needs: "redstone" },
  { kind: "blk_var_set", cat: "block", label: t("Block-Variable setzen"), desc: t("Wird im Block gespeichert, z. B. Brennzeit"), outs: NEXT, props: [textP("name", t("Name"), "brennzeit"), sel("op", t("Rechnung"), "set", [["set", t("Setzen auf")], ["add", t("Erhöhen um")], ["sub", t("Verringern um")]]), { ...numP("value", t("Wert"), "1"), pin: "num" }] },
  {
    kind: "blk_slot_take",
    cat: "block",
    label: t("Item aus Slot nehmen"),
    desc: t("Nur wenn genug drin ist"),
    outs: [
      { id: "ok", label: t("Genommen") },
      { id: "fail", label: t("Nicht genug") },
      { id: "next", label: t("Danach") },
    ],
    props: [{ ...numP("slot", t("Slot"), "1"), pin: "num" }, { ...numP("count", t("Anzahl"), "1"), pin: "num" }],
    needs: "inventory",
  },
  { kind: "blk_slot_put", cat: "block", label: t("Item in Slot legen"), desc: t("Passt es nicht, passiert nichts"), outs: NEXT, props: [{ ...numP("slot", t("Slot"), "3"), pin: "num" }, { key: "item", label: t("Item"), type: "item", def: "minecraft:diamond" }, { ...numP("count", t("Anzahl"), "1"), pin: "num" }], needs: "inventory" },

  // ---- Werte & Rechnen (liefern Werte, kein Ablauf) ----
  { kind: "val_number", cat: "values", label: t("Zahl"), desc: "", outs: [], props: [numP("value", t("Wert"), "10")], value: "num" },
  { kind: "val_text", cat: "values", label: t("Text"), desc: t("{player} und {var:name} gehen auch"), outs: [], props: [textP("value", t("Text"), "Hallo")], value: "text" },
  { kind: "val_bool", cat: "values", label: t("Ja/Nein"), desc: "", outs: [], props: [sel("value", t("Wert"), "true", [["true", t("Ja")], ["false", t("Nein")]])], value: "bool" },
  {
    kind: "val_math",
    cat: "values",
    label: t("Rechnen"),
    desc: "",
    outs: [],
    props: [
      { ...numP("a", "A", "0"), pin: "num" },
      sel("op", t("Rechnung"), "add", [["add", "A + B"], ["sub", "A − B"], ["mul", "A × B"], ["div", "A ÷ B"], ["min", t("kleinerer Wert")], ["max", t("größerer Wert")], ["mod", t("Rest von A ÷ B")], ["pow", "A hoch B"]]),
      { ...numP("b", "B", "2"), pin: "num" },
    ],
    value: "num",
  },
  { kind: "val_round", cat: "values", label: t("Runden"), desc: "", outs: [], props: [{ ...numP("in", t("Zahl"), "0"), pin: "num" }, sel("mode", t("Art"), "round", [["round", t("Runden")], ["floor", t("Abrunden")], ["ceil", t("Aufrunden")], ["abs", t("Ohne Minus")]])], value: "num" },
  { kind: "val_random", cat: "values", label: t("Zufallszahl"), desc: t("Kommazahl zwischen Min und Max"), outs: [], props: [{ ...numP("min", t("Min"), "0"), pin: "num" }, { ...numP("max", t("Max"), "10"), pin: "num" }], value: "num" },
  {
    kind: "val_compare",
    cat: "values",
    label: t("Vergleichen"),
    desc: "",
    outs: [],
    props: [{ ...numP("a", "A", "0"), pin: "num" }, sel("cmp", t("Vergleich"), "gt", [["gt", "A > B"], ["ge", "A ≥ B"], ["eq", "A = B"], ["ne", "A ≠ B"], ["le", "A ≤ B"], ["lt", "A < B"]]), { ...numP("b", "B", "0"), pin: "num" }],
    value: "bool",
  },
  { kind: "val_and", cat: "values", label: t("UND"), desc: t("Ja, wenn beide Ja sind"), outs: [], props: [{ key: "a", label: "A", type: "pinonly", def: "", pin: "bool" }, { key: "b", label: "B", type: "pinonly", def: "", pin: "bool" }], value: "bool" },
  { kind: "val_or", cat: "values", label: t("ODER"), desc: t("Ja, wenn eins von beiden Ja ist"), outs: [], props: [{ key: "a", label: "A", type: "pinonly", def: "", pin: "bool" }, { key: "b", label: "B", type: "pinonly", def: "", pin: "bool" }], value: "bool" },
  { kind: "val_not", cat: "values", label: t("NICHT"), desc: t("Dreht Ja und Nein um"), outs: [], props: [{ key: "in", label: t("Wert"), type: "pinonly", def: "", pin: "bool" }], value: "bool" },
  { kind: "val_join", cat: "values", label: t("Text verbinden"), desc: "", outs: [], props: [{ ...textP("a", "A", ""), pin: "text" }, { ...textP("b", "B", ""), pin: "text" }], value: "text" },
  { kind: "val_var", cat: "values", label: t("Variable lesen"), desc: "", outs: [], props: [{ key: "var", label: t("Variable"), type: "var", def: "punkte" }], value: "any" },
  { kind: "val_game", cat: "values", label: t("Spielwert"), desc: t("Leben, Uhrzeit, Position …"), outs: [], props: [sel("game", t("Wert"), "health", GAME_VALUES.map((g) => [g.id, g.label] as [string, string]))], value: "any" },
  { kind: "val_sneaking", cat: "values", label: t("Spieler schleicht?"), desc: "", outs: [], props: [], value: "bool" },
  { kind: "val_blk_energy", cat: "block", label: t("Gespeicherter Strom"), desc: t("FE im Block"), outs: [], props: [], value: "num", needs: "energy" },
  { kind: "val_blk_capacity", cat: "block", label: t("Strom-Speichergröße"), desc: t("Wie viel FE höchstens hineinpasst"), outs: [], props: [], value: "num", needs: "energy" },
  { kind: "val_blk_var", cat: "block", label: t("Block-Variable lesen"), desc: "", outs: [], props: [textP("name", t("Name"), "brennzeit")], value: "num" },
  { kind: "val_blk_slot_count", cat: "block", label: t("Anzahl im Slot"), desc: "", outs: [], props: [{ ...numP("slot", t("Slot"), "1"), pin: "num" }], value: "num", needs: "inventory" },
  { kind: "val_blk_slot_item", cat: "block", label: t("Item im Slot"), desc: t("ID, z. B. minecraft:coal"), outs: [], props: [{ ...numP("slot", t("Slot"), "1"), pin: "num" }], value: "text", needs: "inventory" },
  { kind: "val_blk_burn", cat: "block", label: t("Brennwert im Slot"), desc: t("Wie lange das Item brennt (Ticks, 0 = gar nicht)"), outs: [], props: [{ ...numP("slot", t("Slot"), "1"), pin: "num" }], value: "num", needs: "inventory" },
  { kind: "val_blk_light", cat: "block", label: t("Lichtstärke"), desc: t("Himmelslicht über dem Block, 0–15"), outs: [], props: [], value: "num" },
  { kind: "val_blk_sky", cat: "block", label: t("Himmel sichtbar?"), desc: "", outs: [], props: [], value: "bool" },
  { kind: "val_blk_day", cat: "block", label: t("Ist Tag?"), desc: "", outs: [], props: [], value: "bool" },
  { kind: "val_blk_rain", cat: "block", label: t("Regnet es?"), desc: "", outs: [], props: [], value: "bool" },
  { kind: "val_blk_redstone", cat: "block", label: t("Redstone-Stärke"), desc: t("Wie stark der Block mit Redstone versorgt wird, 0–15"), outs: [], props: [], value: "num" },
  { kind: "val_blk_lit", cat: "block", label: t("Ist an?"), desc: t("Zustand An/Aus des Blocks"), outs: [], props: [], value: "bool", needs: "active" },
];

export const nodeSpec = (kind: string) => NODES.find((n) => n.kind === kind);
export const isEvent = (kind: string) => kind.startsWith("ev_") || (kind.includes(":") && NODES.some((n) => n.kind === kind && n.cat === "event"));
export const isValue = (kind: string) => kind.startsWith("val_");

/** Farben der Werte-Typen (Punkte und Linien) */
export const VAL_COLOR: Record<ValType, string> = { num: "#5aa8ff", bool: "#f26d6d", text: "#ff7eb6", any: "#c3c7ce" };

/** Welche Eigenschaften gerade sichtbar sind (z. B. abhängig von der Bedingung). */
export function visibleProps(spec: NodeSpec, props: Record<string, string>): PropSpec[] {
  const val = (key: string) => props[key] ?? spec.props.find((x) => x.key === key)?.def ?? "";
  return spec.props.filter((p) => (!p.when || p.when.values.includes(val(p.when.key))) && (!p.when2 || p.when2.values.includes(val(p.when2.key))));
}

let seq = 0;
export const nodeId = () => `n${Date.now().toString(36)}${(seq++).toString(36)}`;

export function makeNode(kind: string, x: number, y: number): BpNode {
  const spec = nodeSpec(kind)!;
  const props: Record<string, string> = {};
  for (const p of spec.props) if (!(p.key in props) && !p.when) props[p.key] = p.def;
  // abhängige Felder mit dem Standard der aktuell sichtbaren Variante
  for (const p of visibleProps(spec, props)) if (!(p.key in props)) props[p.key] = p.def;
  return { id: nodeId(), kind, x, y, props };
}

export const ENTITIES = [
  "zombie", "skeleton", "creeper", "spider", "enderman", "witch", "slime", "blaze", "ghast", "phantom", "drowned", "husk", "pillager", "ravager",
  "warden", "wither", "ender_dragon", "cow", "pig", "sheep", "chicken", "rabbit", "horse", "wolf", "cat", "fox", "bee", "axolotl", "frog", "villager",
  "iron_golem", "snow_golem", "allay", "parrot", "dolphin", "tnt", "firework_rocket", "experience_orb", "lightning_bolt",
];
export const PARTICLES = [
  "heart", "flame", "soul_fire_flame", "happy_villager", "angry_villager", "smoke", "large_smoke", "cloud", "explosion", "end_rod", "portal",
  "note", "totem_of_undying", "witch", "dragon_breath", "snowflake", "glow", "enchant", "crit", "bubble", "lava", "cherry_leaves", "electric_spark",
];

// ---- Vorlagen ----------------------------------------------------------------

export interface BpTemplate {
  id: string;
  label: string;
  desc: string;
  build: () => Blueprint;
}

function chain(name: string, kinds: [string, Record<string, string>?][]): Blueprint {
  const nodes = kinds.map(([k, props], i) => {
    const n = makeNode(k, 60 + i * 300, 80);
    if (props) n.props = { ...n.props, ...props };
    return n;
  });
  const links = nodes.slice(1).map((n, i) => ({ from: nodes[i].id, out: "next", to: n.id, pin: "" }));
  return { name, enabled: true, nodes, links, comments: [], owner: "" };
}

export const TEMPLATES: BpTemplate[] = [
  { id: "empty", label: t("Leer"), desc: t("Mit einem einzelnen Ereignis anfangen"), build: () => chain(t("Neuer Blueprint"), [["ev_join"]]) },
  {
    id: "command_reward",
    label: t("Eigener Befehl"),
    desc: t("/belohnung gibt einmal pro Spieler einen Diamanten"),
    build: () => {
      const ev = makeNode("ev_command", 60, 80);
      ev.props = { command: "/belohnung" };
      const iff = makeNode("if", 360, 80);
      iff.props = { cond: "var", var: "belohnt", scope: "player", cmp: "lt", value: "1", not: "is", join: "none" };
      const give = makeNode("give", 660, 20);
      give.props = { ...give.props, item: "minecraft:diamond", count: "1" };
      const set = makeNode("var_set", 960, 20);
      set.props = { var: "belohnt", scope: "player", op: "set", value: "1" };
      const no = makeNode("message", 660, 220);
      no.props = { text: t("Die Belohnung hast du schon abgeholt."), to: "player" };
      return {
        name: t("Eigener Befehl"),
        enabled: true,
        nodes: [ev, iff, give, set, no],
        links: [
          { from: ev.id, out: "next", to: iff.id },
          { from: iff.id, out: "true", to: give.id },
          { from: give.id, out: "next", to: set.id },
          { from: iff.id, out: "false", to: no.id },
        ],
      };
    },
  },
  {
    id: "loop_entities",
    label: t("Feuerstab"),
    desc: t("Rechtsklick mit Lohenrute: alle Monster im Umkreis brennen"),
    build: () => {
      const ev = makeNode("ev_click_item", 60, 80);
      ev.props = { target: "minecraft:blaze_rod" };
      const loop = makeNode("for_entities", 360, 80);
      loop.props = { ...loop.props, radius: "10" };
      const fire = makeNode("fire", 660, 40);
      fire.props = { ...fire.props, who: "target", seconds: "4" };
      const pt = makeNode("particle", 960, 40);
      pt.props = { ...pt.props, particle: "minecraft:flame", count: "20" };
      const sound = makeNode("sound", 660, 240);
      sound.props = { ...sound.props, sound: "minecraft:item.firecharge.use" };
      return {
        name: t("Feuerstab"),
        enabled: true,
        nodes: [ev, loop, fire, pt, sound],
        links: [
          { from: ev.id, out: "next", to: loop.id },
          { from: loop.id, out: "body", to: fire.id },
          { from: fire.id, out: "next", to: pt.id },
          { from: loop.id, out: "done", to: sound.id },
        ],
      };
    },
  },
  {
    id: "chat_weather",
    label: t("Wetter per Chat"),
    desc: t("Schreibt jemand „regen“, fängt es an zu regnen"),
    build: () => {
      const ev = makeNode("ev_chat", 60, 80);
      const iff = makeNode("if", 360, 80);
      iff.props = { cond: "message_contains", value: "regen" };
      const w = makeNode("weather", 660, 40);
      const m = makeNode("message", 960, 40);
      m.props = { text: t("{player} hat Regen bestellt!"), to: "all" };
      return {
        name: t("Wetter per Chat"),
        enabled: true,
        nodes: [ev, iff, w, m],
        links: [
          { from: ev.id, out: "next", to: iff.id },
          { from: iff.id, out: "true", to: w.id },
          { from: w.id, out: "next", to: m.id },
        ],
      };
    },
  },
  {
    id: "magic_block",
    label: t("Magischer Block"),
    desc: t("Rechtsklick: Partikel, Schnelligkeit, nach 3 Sekunden Blitz"),
    build: () =>
      chain(t("Magischer Block"), [
        ["ev_click_block"],
        ["particle", { particle: "minecraft:enchant", count: "60" }],
        ["effect", { effect: "speed", seconds: "15", level: "2", who: "player" }],
        ["delay", { seconds: "3" }],
        ["lightning"],
      ]),
  },
  {
    id: "points",
    label: t("Punkte sammeln"),
    desc: t("Jeder abgebaute Block gibt einen Punkt, bei 10 gibt es eine Belohnung"),
    build: () => {
      const ev = makeNode("ev_break", 60, 80);
      const add = makeNode("var_set", 360, 80);
      add.props = { var: "punkte", scope: "player", op: "add", value: "1" };
      const show = makeNode("var_show", 660, 80);
      show.props = { var: "punkte", slot: "sidebar" };
      const iff = makeNode("if", 960, 80);
      iff.props = { cond: "var", var: "punkte", scope: "player", cmp: "ge", value: "10" };
      const give = makeNode("give", 1260, 20);
      give.props = { item: "minecraft:diamond", count: "1" };
      const msg = makeNode("message", 1560, 20);
      msg.props = { text: t("{player} hat {var:punkte} Punkte erreicht!"), to: "all" };
      const reset = makeNode("var_set", 1860, 20);
      reset.props = { var: "punkte", scope: "player", op: "set", value: "0" };
      return {
        name: t("Punkte sammeln"),
        enabled: true,
        nodes: [ev, add, show, iff, give, msg, reset],
        links: [
          { from: ev.id, out: "next", to: add.id },
          { from: add.id, out: "next", to: show.id },
          { from: show.id, out: "next", to: iff.id },
          { from: iff.id, out: "true", to: give.id },
          { from: give.id, out: "next", to: msg.id },
          { from: msg.id, out: "next", to: reset.id },
        ],
      };
    },
  },
  {
    id: "timer_gift",
    label: t("Regelmäßiges Geschenk"),
    desc: t("Alle 10 Minuten ein Diamant"),
    build: () => chain(t("Geschenk"), [["ev_timer", { seconds: "600" }], ["give", { item: "minecraft:diamond", count: "1" }], ["actionbar", { text: t("Ein Geschenk für dich!") }]]),
  },
];
