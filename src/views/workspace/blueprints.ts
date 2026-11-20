import { t } from "../../i18n";
import { Blueprint, BpNode } from "../../api";

// Katalog der Blueprint-Knoten. Muss zu src-tauri/src/blueprint.rs passen.

export type BpCat = "event" | "flow" | "vars" | "world" | "player" | "other";
export type PropType = "text" | "number" | "select" | "item" | "block" | "entity" | "effect" | "sound" | "particle" | "who" | "var";
export interface PropSpec {
  key: string;
  label: string;
  type: PropType;
  def: string;
  options?: { id: string; label: string }[];
  /** nur zeigen, wenn eine andere Eigenschaft einen dieser Werte hat */
  when?: { key: string; values: string[] };
}
export interface NodeSpec {
  kind: string;
  cat: BpCat;
  label: string;
  desc: string;
  outs: { id: string; label: string }[];
  props: PropSpec[];
}

export const CATS: { id: BpCat; label: string }[] = [
  { id: "event", label: t("Ereignisse") },
  { id: "flow", label: t("Ablauf") },
  { id: "vars", label: t("Variablen") },
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
const scopeP: PropSpec = { key: "scope", label: t("Gilt für"), type: "select", def: "player", options: [{ id: "player", label: t("Spieler") }, { id: "global", label: t("Ganze Welt") }] };

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
  { kind: "ev_chat", cat: "event", label: t("Chatnachricht"), desc: t("Mit „Wenn → Nachricht enthält“ auf Wörter reagieren"), outs: NEXT, props: [] },

  // ---- Ablauf ----
  {
    kind: "if",
    cat: "flow",
    label: t("Wenn"),
    desc: t("Verzweigt je nach Bedingung"),
    outs: [
      { id: "true", label: t("Ja") },
      { id: "false", label: t("Nein") },
      { id: "next", label: t("Danach") },
    ],
    props: [
      sel("cond", t("Bedingung"), "chance", [
        ["chance", t("Zufall (Prozent)")],
        ["sneaking", t("Spieler schleicht")],
        ["raining", t("Es regnet")],
        ["thundering", t("Gewitter")],
        ["day", t("Es ist Tag")],
        ["night", t("Es ist Nacht")],
        ["creative", t("Kreativmodus")],
        ["holding", t("Hält Item in der Hand")],
        ["health_below", t("Leben des Ziels unter")],
        ["dimension", t("In Dimension")],
        ["block_below", t("Steht auf Block")],
        ["message_contains", t("Nachricht enthält")],
        ["var", t("Variable vergleichen")],
        ["has_item", t("Hat Item im Inventar")],
        ["level_at_least", t("Level mindestens")],
        ["in_water", t("Ziel ist im Wasser")],
        ["on_fire", t("Ziel brennt")],
        ["is_player_target", t("Ziel ist ein Spieler")],
      ]),
      { key: "var", label: t("Variable"), type: "var", def: "punkte", when: { key: "cond", values: ["var"] } },
      { ...scopeP, when: { key: "cond", values: ["var"] } },
      {
        key: "cmp",
        label: t("Vergleich"),
        type: "select",
        def: "ge",
        when: { key: "cond", values: ["var"] },
        options: [
          { id: "ge", label: "≥" },
          { id: "gt", label: ">" },
          { id: "eq", label: "=" },
          { id: "ne", label: "≠" },
          { id: "le", label: "≤" },
          { id: "lt", label: "<" },
        ],
      },
      { key: "value", label: t("Wert"), type: "number", def: "10", when: { key: "cond", values: ["var"] } },
      { key: "value", label: t("Item"), type: "item", def: "", when: { key: "cond", values: ["has_item"] } },
      { key: "count", label: t("Anzahl"), type: "number", def: "1", when: { key: "cond", values: ["has_item"] } },
      { key: "value", label: t("Level"), type: "number", def: "5", when: { key: "cond", values: ["level_at_least"] } },
      { key: "value", label: t("Prozent"), type: "number", def: "50", when: { key: "cond", values: ["chance"] } },
      { key: "value", label: t("Leben"), type: "number", def: "10", when: { key: "cond", values: ["health_below"] } },
      { key: "value", label: t("Item"), type: "item", def: "", when: { key: "cond", values: ["holding"] } },
      { key: "value", label: t("Block"), type: "block", def: "", when: { key: "cond", values: ["block_below"] } },
      { key: "value", label: t("Text"), type: "text", def: "", when: { key: "cond", values: ["message_contains"] } },
      {
        key: "value",
        label: t("Dimension"),
        type: "select",
        def: "overworld",
        when: { key: "cond", values: ["dimension"] },
        options: [
          { id: "overworld", label: t("Oberwelt") },
          { id: "nether", label: t("Nether") },
          { id: "end", label: t("End") },
        ],
      },
    ],
  },
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
    label: t("Variable ändern"),
    desc: t("Im Text mit {var:name} bzw. {global:name} anzeigen"),
    outs: NEXT,
    props: [
      { key: "var", label: t("Variable"), type: "var", def: "punkte" },
      { key: "scope", label: t("Gilt für"), type: "select", def: "player", options: [{ id: "player", label: t("Jeden Spieler einzeln") }, { id: "global", label: t("Die ganze Welt") }] },
      sel("op", t("Rechnung"), "add", [["set", t("Setzen auf")], ["add", t("Erhöhen um")], ["sub", t("Verringern um")], ["random", t("Zufallszahl unter")]]),
      numP("value", t("Wert"), "1"),
    ],
  },
  { kind: "var_show", cat: "vars", label: t("Variable anzeigen"), desc: t("Als Tabelle am Bildschirmrand"), outs: NEXT, props: [{ key: "var", label: t("Variable"), type: "var", def: "punkte" }, sel("slot", t("Ort"), "sidebar", [["sidebar", t("Rechts am Rand")], ["list", t("Spielerliste (Tab)")]])] },
  { kind: "var_hide", cat: "vars", label: t("Anzeige ausblenden"), desc: t("Tabelle am Rand entfernen"), outs: NEXT, props: [] },

  // ---- Welt ----
  { kind: "weather", cat: "world", label: t("Wetter ändern"), desc: "", outs: NEXT, props: [sel("weather", t("Wetter"), "rain", [["clear", t("Klar")], ["rain", t("Regen")], ["thunder", t("Gewitter")]]), numP("seconds", t("Dauer (Sek.)"), "300")] },
  { kind: "time", cat: "world", label: t("Uhrzeit setzen"), desc: "", outs: NEXT, props: [sel("time", t("Zeit"), "day", [["day", t("Morgen")], ["noon", t("Mittag")], ["night", t("Abend")], ["midnight", t("Mitternacht")]])] },
  { kind: "summon", cat: "world", label: t("Kreatur erscheinen lassen"), desc: "", outs: NEXT, props: [{ key: "entity", label: t("Kreatur"), type: "entity", def: "minecraft:zombie" }, numP("count", t("Anzahl"), "1")] },
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
  { kind: "message", cat: "player", label: t("Nachricht im Chat"), desc: t("{player} = Name des Spielers"), outs: NEXT, props: [textP("text", t("Text"), t("Hallo {player}!")), sel("to", t("An"), "player", [["player", t("Spieler")], ["all", t("Alle")]])] },
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
  { kind: "actionbar", cat: "player", label: t("Text über der Leiste"), desc: t("{player} = Name des Spielers"), outs: NEXT, props: [textP("text", t("Text"), t("Psst …"))] },
  { kind: "give", cat: "player", label: t("Item geben"), desc: "", outs: NEXT, props: [{ key: "item", label: t("Item"), type: "item", def: "minecraft:diamond" }, numP("count", t("Anzahl"), "1")] },
  { kind: "effect", cat: "player", label: t("Trankeffekt geben"), desc: "", outs: NEXT, props: [{ key: "effect", label: t("Effekt"), type: "effect", def: "speed" }, numP("seconds", t("Sekunden"), "10"), numP("level", t("Effektstufe"), "1"), who] },
  { kind: "remove_item", cat: "player", label: t("Item wegnehmen"), desc: t("Aus dem Inventar entfernen"), outs: NEXT, props: [{ key: "item", label: t("Item"), type: "item", def: "minecraft:dirt" }, numP("count", t("Anzahl"), "1")] },
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
  { kind: "command", cat: "other", label: t("Befehl ausführen"), desc: t("Beliebiger Minecraft-Befehl, @s = Spieler"), outs: NEXT, props: [textP("command", t("Befehl"), "say Hallo")] },
];

export const nodeSpec = (kind: string) => NODES.find((n) => n.kind === kind);
export const isEvent = (kind: string) => kind.startsWith("ev_");

/** Welche Eigenschaften gerade sichtbar sind (z. B. abhängig von der Bedingung). */
export function visibleProps(spec: NodeSpec, props: Record<string, string>): PropSpec[] {
  return spec.props.filter((p) => !p.when || p.when.values.includes(props[p.when.key] ?? spec.props.find((x) => x.key === p.when!.key)?.def ?? ""));
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
  const links = nodes.slice(1).map((n, i) => ({ from: nodes[i].id, out: "next", to: n.id }));
  return { name, enabled: true, nodes, links };
}

export const TEMPLATES: BpTemplate[] = [
  { id: "empty", label: t("Leer"), desc: t("Mit einem einzelnen Ereignis anfangen"), build: () => chain(t("Neuer Blueprint"), [["ev_join"]]) },
  {
    id: "welcome",
    label: t("Willkommen"),
    desc: t("Beim Betreten: Titel, Nachricht und Geräusch"),
    build: () =>
      chain(t("Willkommen"), [
        ["ev_join"],
        ["title", { text: t("Willkommen!") }],
        ["message", { text: t("Schön, dass du da bist, {player}!"), to: "player" }],
        ["sound", { sound: "minecraft:ui.toast.challenge_complete" }],
      ]),
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
