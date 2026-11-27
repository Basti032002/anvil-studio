import { t } from "../../i18n";
import { Ability, AbilityKind, BlockDef, Blueprint, BpLink, BpNode } from "../../api";
import { newBlock } from "./contentDefaults";
import { makeNode } from "./blueprints";

/** Beispiele aus der Hilfe: ein normaler Block mit Fähigkeiten und (falls nötig) einem kleinen Blueprint.
 *  Nach dem Einfügen gehört alles dem Nutzer – nichts davon ist eine feste Vorlage. */
export type ExampleId = "solar" | "generator" | "battery" | "cable" | "machine" | "chest" | "lamp";
export const EXAMPLES: { id: ExampleId; label: string; desc: string; abilities: AbilityKind[]; blueprint: string }[] = [
  { id: "generator", label: t("Generator"), desc: t("Verbrennt Kohle & Co. und erzeugt Strom"), abilities: ["energy", "inventory", "tick", "facing", "active"], blueprint: t("Block-Tick → Brennstoff? → Strom erzeugen") },
  { id: "solar", label: t("Solarpanel"), desc: t("Erzeugt tagsüber Strom – je heller, desto mehr"), abilities: ["energy", "tick", "active"], blueprint: t("Block-Tick → Tag & Himmel frei? → Lichtstärke × 2 → Strom erzeugen") },
  { id: "battery", label: t("Akku / Batteriezelle"), desc: t("Nimmt überall Strom an und gibt ihn vorne ab"), abilities: ["energy", "facing"], blueprint: "" },
  { id: "cable", label: t("Kabel"), desc: t("Verbindet sich und leitet Strom weiter"), abilities: ["energy", "connect"], blueprint: "" },
  { id: "machine", label: t("Elektrische Maschine"), desc: t("Verarbeitet Items mit Strom"), abilities: ["energy", "recipes", "facing", "active"], blueprint: "" },
  { id: "chest", label: t("Lager-Truhe"), desc: t("27 Slots zum Öffnen"), abilities: ["inventory", "facing"], blueprint: "" },
  { id: "lamp", label: t("Lampe"), desc: t("Leuchtet, solange Redstone-Strom anliegt"), abilities: ["active", "light", "redstone"], blueprint: t("Redstone geändert → An/Aus = Redstone > 0") },
];

const ab = (kind: AbilityKind, props: Record<string, string> = {}): Ability => ({ kind, props });

/** Kleiner Helfer, um Knoten und Verbindungen zu bauen */
function graph() {
  const nodes: BpNode[] = [];
  const links: BpLink[] = [];
  const node = (kind: string, x: number, y: number, props: Record<string, string> = {}) => {
    const n = makeNode(kind, x, y);
    n.props = { ...n.props, ...props };
    nodes.push(n);
    return n.id;
  };
  const flow = (from: string, out: string, to: string) => links.push({ from, out, to, pin: "" });
  const val = (from: string, to: string, pin: string) => links.push({ from, out: "value", to, pin });
  return { nodes, links, node, flow, val };
}

export function buildExample(id: ExampleId, modId: string, uid: (base: string) => string): { block: BlockDef; blueprint?: Blueprint } {
  const metal: Partial<BlockDef> = { material: "metal", hardness: 3, resistance: 6, tool: "pickaxe", tier: "stone" };
  const mk = (base: string, en: string, _de: string, extra: Partial<BlockDef>) => ({ ...newBlock(uid(base)), ...metal, nameEn: en, ...extra });
  const bp = (b: BlockDef, label: string, g: ReturnType<typeof graph>): Blueprint => ({ name: `${b.nameDe || b.nameEn} · ${label}`, enabled: true, owner: b.id, nodes: g.nodes, links: g.links, comments: [] });
  const target = (b: BlockDef) => ({ target: `${modId}:${b.id}` });
  switch (id) {
    case "solar": {
      const b = mk("solarpanel", "Solar Panel", "Solarpanel", {
        model: [{ from: [0, 0, 0], to: [16, 6, 16], tex: "" }],
        abilities: [ab("energy", { capacity: "20000", in: "0", out: "100", sides: "bbbbbb", push: "true" }), ab("tick", { ticks: "20" }), ab("active"), ab("light", { level: "4", when: "active" })],
      });
      const g = graph();
      const ev = g.node("ev_block_tick", 0, 0, target(b));
      const iff = g.node("if", 340, 0);
      const day = g.node("val_blk_day", 0, 200);
      const sky = g.node("val_blk_sky", 0, 300);
      const and = g.node("val_and", 0, 400);
      const light = g.node("val_blk_light", 340, 380);
      const mul = g.node("val_math", 600, 340, { op: "mul", b: "20" });
      const gen = g.node("blk_energy_gen", 660, 0);
      const on = g.node("blk_lit", 960, 0, { value: "true" });
      const off = g.node("blk_lit", 660, 180, { value: "false" });
      g.flow(ev, "next", iff);
      g.val(day, and, "a");
      g.val(sky, and, "b");
      g.val(and, iff, "ifcond");
      g.flow(iff, "true", gen);
      g.val(light, mul, "a");
      g.val(mul, gen, "amount");
      g.flow(gen, "next", on);
      g.flow(iff, "false", off);
      const blueprint = bp(b, t("Tick"), g);
      blueprint.comments = [{ id: "c1", x: -30, y: 160, w: 330, h: 420, text: t("Scheint die Sonne?"), color: "#3ec7b5" }];
      return { block: b, blueprint };
    }
    case "generator": {
      const b = mk("generator", "Generator", "Generator", {
        abilities: [ab("energy", { capacity: "20000", in: "0", out: "200", sides: "bbbbbb", push: "true" }), ab("inventory", { slots: "1" }), ab("tick", { ticks: "20" }), ab("facing"), ab("active")],
      });
      const g = graph();
      const ev = g.node("ev_block_tick", 0, 0, target(b));
      const burning = g.node("if", 320, 0);
      const left = g.node("val_blk_var", 0, 300, { name: "brennzeit" });
      const cmp = g.node("val_compare", 0, 420, { cmp: "gt", b: "0" });
      const dec = g.node("blk_var_set", 640, 0, { name: "brennzeit", op: "sub", value: "20" });
      const gen = g.node("blk_energy_gen", 940, 0, { amount: "800" });
      const on = g.node("blk_lit", 1220, 0, { value: "true" });
      const fuelIf = g.node("if", 640, 400);
      const burn = g.node("val_blk_burn", 320, 620, { slot: "1" });
      const cmp2 = g.node("val_compare", 320, 740, { cmp: "gt", b: "0" });
      const set = g.node("blk_var_set", 940, 400, { name: "brennzeit", op: "set" });
      const take = g.node("blk_slot_take", 1220, 400, { slot: "1", count: "1" });
      const off = g.node("blk_lit", 940, 760, { value: "false" });
      g.flow(ev, "next", burning);
      g.val(left, cmp, "a");
      g.val(cmp, burning, "ifcond");
      g.flow(burning, "true", dec);
      g.flow(dec, "next", gen);
      g.flow(gen, "next", on);
      g.flow(burning, "false", fuelIf);
      g.val(burn, cmp2, "a");
      g.val(cmp2, fuelIf, "ifcond");
      g.flow(fuelIf, "true", set);
      g.val(burn, set, "value");
      g.flow(set, "next", take);
      g.flow(fuelIf, "false", off);
      const blueprint = bp(b, t("Tick"), g);
      return { block: b, blueprint };
    }
    case "battery":
      return { block: mk("akku", "Battery Cell", "Akku", { abilities: [ab("energy", { capacity: "100000", in: "1000", out: "1000", sides: "oiiiii", push: "true" }), ab("facing")] }) };
    case "cable":
      return { block: mk("kabel", "Energy Cable", "Kabel", { hardness: 0.5, resistance: 1, abilities: [ab("energy", { capacity: "1000", in: "1000", out: "1000", sides: "bbbbbb", push: "true" }), ab("connect", { to: "energy" })] }) };
    case "machine":
      return {
        block: mk("maschine", "Electric Machine", "Elektrische Maschine", {
          abilities: [ab("energy", { capacity: "20000", in: "500", out: "0", sides: "iiiiii", push: "false" }), ab("recipes", { use: "20" }), ab("facing"), ab("active")],
          machine: { fuel: false, recipes: [{ input: "minecraft:cobblestone", inputCount: 1, output: "minecraft:gravel", outputCount: 1, time: 100 }] },
        }),
      };
    case "chest":
      return { block: { ...newBlock(uid("truhe")), nameEn: "Storage Chest", nameDe: "", material: "wood", hardness: 2.5, resistance: 2.5, tool: "axe", abilities: [ab("inventory", { slots: "27" }), ab("facing")] } };
    case "lamp": {
      const b: BlockDef = { ...newBlock(uid("lampe")), nameEn: "Lamp", nameDe: "", material: "glass", hardness: 0.3, resistance: 0.3, tool: "none", abilities: [ab("active"), ab("light", { level: "15", when: "active" }), ab("redstone")] };
      const g = graph();
      const ev = g.node("ev_block_redstone", 0, 0, target(b));
      const rs = g.node("val_blk_redstone", 0, 180);
      const cmp = g.node("val_compare", 260, 180, { cmp: "gt", b: "0" });
      const lit = g.node("blk_lit", 520, 0);
      g.flow(ev, "next", lit);
      g.val(rs, cmp, "a");
      g.val(cmp, lit, "value");
      return { block: b, blueprint: bp(b, t("Redstone"), g) };
    }
  }
}
