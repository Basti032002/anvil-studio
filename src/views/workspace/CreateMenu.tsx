import { t } from "../../i18n";
import { useEffect, useState } from "react";
import { DimTemplate, MobModel } from "../../api";
import {
  BlueprintIcon,
  ChestIcon,
  GearIcon,
  HammerIcon,
  ChestplateIcon,
  CloseIcon,
  CubeIcon,
  FlaskIcon,
  GlobeIcon,
  BoxIcon,
  FoodIcon,
  GemIcon,
  LampIcon,
  LayersIcon,
  LightningIcon,
  PawIcon,
  SearchIcon,
  PickaxeIcon,
  ShovelIcon,
  SkullIcon,
  SparkIcon,
  SwordIcon, GuiIcon, BatteryIcon, PlugIcon, SolarIcon } from "../../icons";
import { MOB_MODELS } from "./contentDefaults";
import { TEMPLATES } from "./blueprints";

export type CreateGroup = "all" | "block" | "item" | "mob" | "world" | "logic";
export type CreateChoice =
  | { kind: "block"; variant: "normal" | "ore" | "lamp" | "storage" | "shapes" | "workbench" | "machine" | "electric" | "generator" | "solar" | "battery" | "cable" }
  | { kind: "item"; variant: "basic" | "food" | "sword" | "pickaxe" | "axe" | "shovel" | "hoe" | "toolset" | "armor" | "armorset" }
  | { kind: "mob"; model: MobModel }
  | { kind: "blueprint"; template: string }
  | { kind: "event" }
  | { kind: "brew" }
  | { kind: "dimension"; preset: DimTemplate }
  | { kind: "structure" }
  | { kind: "gui"; preset: "machine" | "panel" | "empty" };

interface Card {
  choice: CreateChoice;
  icon: React.ReactNode;
  title: string;
  desc: string;
}

const GROUPS: { id: CreateGroup; label: string; icon: React.ReactNode }[] = [
  { id: "all", label: t("Alle"), icon: <SparkIcon size={15} /> },
  { id: "block", label: t("Blöcke"), icon: <CubeIcon size={15} /> },
  { id: "item", label: t("Items"), icon: <GemIcon size={15} /> },
  { id: "mob", label: t("Kreaturen"), icon: <PawIcon size={15} /> },
  { id: "world", label: t("Welten"), icon: <GlobeIcon size={15} /> },
  { id: "logic", label: t("Logik"), icon: <BlueprintIcon size={15} /> },
];

function cards(group: CreateGroup): { title: string; cards: Card[] }[] {
  switch (group) {
    case "all":
      return (["block", "item", "mob", "world", "logic"] as CreateGroup[]).flatMap((g) => {
        const label = GROUPS.find((x) => x.id === g)!.label;
        return cards(g).map((sec, i) => ({ title: i === 0 && sec.title !== label ? `${label} · ${sec.title}` : sec.title, cards: sec.cards }));
      });
    case "block":
      return [
        {
          title: t("Blöcke"),
          cards: [
            { choice: { kind: "block", variant: "normal" }, icon: <CubeIcon size={20} />, title: t("Block"), desc: t("Einfacher Baublock mit eigener Textur") },
            { choice: { kind: "block", variant: "ore" }, icon: <GemIcon size={20} />, title: t("Erz"), desc: t("Wird in der Welt erzeugt und lässt Items fallen") },
            { choice: { kind: "block", variant: "shapes" }, icon: <LayersIcon size={20} />, title: t("Block mit Formen"), desc: t("Mit Treppe, Stufe und Mauer") },
          ],
        },
        {
          title: t("Mit Funktion"),
          cards: [
            { choice: { kind: "block", variant: "lamp" }, icon: <LampIcon size={20} />, title: t("Lampe"), desc: t("Leuchtet mit Redstone-Signal") },
            { choice: { kind: "block", variant: "storage" }, icon: <ChestIcon size={20} />, title: t("Lager-Truhe"), desc: t("Block mit Inventar zum Öffnen") },
            { choice: { kind: "block", variant: "workbench" }, icon: <HammerIcon size={20} />, title: t("Werkbank"), desc: t("Eigenes 3×3-Raster mit Rezepten, die nur hier gehen") },
            { choice: { kind: "block", variant: "machine" }, icon: <GearIcon size={20} />, title: t("Maschine"), desc: t("Verarbeitet Items über Zeit, mit Fortschrittsbalken") },
          ],
        },
        {
          title: t("Strom (FE/RF)"),
          cards: [
            { choice: { kind: "block", variant: "generator" }, icon: <LightningIcon size={20} />, title: t("Generator"), desc: t("Verbrennt Kohle & Co. und erzeugt Strom") },
            { choice: { kind: "block", variant: "solar" }, icon: <SolarIcon size={20} />, title: t("Solarpanel"), desc: t("Erzeugt tagsüber Strom aus Sonnenlicht") },
            { choice: { kind: "block", variant: "battery" }, icon: <BatteryIcon size={20} />, title: t("Akku / Batteriezelle"), desc: t("Speichert Strom und gibt ihn vorne ab") },
            { choice: { kind: "block", variant: "cable" }, icon: <PlugIcon size={20} />, title: t("Kabel"), desc: t("Leitet Strom zu Maschinen weiter") },
            { choice: { kind: "block", variant: "electric" }, icon: <GearIcon size={20} />, title: t("Elektrische Maschine"), desc: t("Verarbeitet Items mit Strom statt Kohle") },
          ],
        },
      ];
    case "item":
      return [
        {
          title: t("Items"),
          cards: [
            { choice: { kind: "item", variant: "basic" }, icon: <GemIcon size={20} />, title: t("Item"), desc: t("Material, Zutat oder Sammelobjekt") },
            { choice: { kind: "item", variant: "food" }, icon: <FoodIcon size={20} />, title: t("Nahrung"), desc: t("Essbar, mit Sättigung") },
          ],
        },
        {
          title: t("Waffen & Werkzeuge"),
          cards: [
            { choice: { kind: "item", variant: "sword" }, icon: <SwordIcon size={20} />, title: t("Schwert"), desc: t("Nahkampfwaffe") },
            { choice: { kind: "item", variant: "axe" }, icon: <PickaxeIcon size={20} />, title: t("Axt"), desc: t("Holz fällen und kämpfen") },
            { choice: { kind: "item", variant: "pickaxe" }, icon: <PickaxeIcon size={20} />, title: t("Spitzhacke"), desc: t("Stein und Erze abbauen") },
            { choice: { kind: "item", variant: "shovel" }, icon: <ShovelIcon size={20} />, title: t("Schaufel"), desc: t("Erde, Sand und Kies") },
            { choice: { kind: "item", variant: "hoe" }, icon: <ShovelIcon size={20} />, title: t("Hacke"), desc: t("Ackerboden anlegen") },
            { choice: { kind: "item", variant: "toolset" }, icon: <SparkIcon size={20} />, title: t("Werkzeug-Set"), desc: t("Alle fünf auf einmal, gleiches Material") },
          ],
        },
        {
          title: t("Rüstung"),
          cards: [
            { choice: { kind: "item", variant: "armor" }, icon: <ChestplateIcon size={20} />, title: t("Rüstungsteil"), desc: t("Helm, Brustpanzer, Hose oder Stiefel") },
            { choice: { kind: "item", variant: "armorset" }, icon: <ChestplateIcon size={20} />, title: t("Rüstungs-Set"), desc: t("Alle vier Teile auf einmal") },
          ],
        },
      ];
    case "mob":
      return [
        {
          title: t("Kreatur nach Vorlage"),
          cards: MOB_MODELS.map((m) => ({
            choice: { kind: "mob", model: m.id } as CreateChoice,
            icon: m.hostile ? <SkullIcon size={20} /> : <PawIcon size={20} />,
            title: m.label,
            desc: m.hostile ? t("Feindlich · {hp} Leben", { hp: m.health }) : t("Friedlich · {hp} Leben", { hp: m.health }),
          })),
        },
      ];
    case "world":
      return [
        {
          title: t("Dimension"),
          cards: [
            { choice: { kind: "dimension", preset: "overworld" }, icon: <GlobeIcon size={20} />, title: t("Oberwelt"), desc: t("Berge, Wälder, Meere – mit deinen eigenen Blöcken") },
            { choice: { kind: "dimension", preset: "nether" }, icon: <GlobeIcon size={20} />, title: t("Nether"), desc: t("Höhlenwelt mit Decke, Lavameer und Nether-Himmel") },
            { choice: { kind: "dimension", preset: "end" }, icon: <GlobeIcon size={20} />, title: t("End"), desc: t("Inseln im Nichts unter dunklem Himmel") },
            { choice: { kind: "dimension", preset: "floating" }, icon: <GlobeIcon size={20} />, title: t("Schwebende Inseln"), desc: t("Inseln am Himmel, darunter nichts") },
            { choice: { kind: "dimension", preset: "caves" }, icon: <GlobeIcon size={20} />, title: t("Höhlenwelt"), desc: t("Alles unter der Erde, mit Decke") },
            { choice: { kind: "dimension", preset: "amplified" }, icon: <GlobeIcon size={20} />, title: t("Zerklüftet"), desc: t("Riesige Berge und tiefe Täler") },
            { choice: { kind: "dimension", preset: "flat" }, icon: <GlobeIcon size={20} />, title: t("Flachland"), desc: t("Flache Schichten – ideal zum Bauen") },
            { choice: { kind: "dimension", preset: "void" }, icon: <GlobeIcon size={20} />, title: t("Leere"), desc: t("Nur Luft – für Skyblock und Lobbys") },
          ],
        },
        {
          title: t("Struktur"),
          cards: [{ choice: { kind: "structure" }, icon: <BoxIcon size={20} />, title: t("Eigene Struktur"), desc: t("Im Spiel mit dem Strukturblock bauen und in der Welt verteilen") }],
        },
      ];
    case "logic":
      return [
        {
          title: t("Blueprint (Knoten-Editor)"),
          cards: TEMPLATES.map((tp) => ({ choice: { kind: "blueprint", template: tp.id } as CreateChoice, icon: <BlueprintIcon size={20} />, title: tp.label, desc: tp.desc })),
        },
        {
          title: t("Oberfläche (GUI-Editor)"),
          cards: [
            { choice: { kind: "gui", preset: "machine" }, icon: <GuiIcon size={20} />, title: t("Maschinen-Oberfläche"), desc: t("Slots, Fortschrittspfeil und Inventar – für Maschinen-Blöcke") },
            { choice: { kind: "gui", preset: "panel" }, icon: <GuiIcon size={20} />, title: t("Bedienfeld"), desc: t("Knöpfe, Schalter und Anzeigen – per Blueprint öffnen") },
            { choice: { kind: "gui", preset: "empty" }, icon: <GuiIcon size={20} />, title: t("Leere Oberfläche"), desc: t("Alles selbst gestalten") },
          ],
        },
        {
          title: t("Einfach"),
          cards: [
            { choice: { kind: "event" }, icon: <LightningIcon size={20} />, title: t("Ereignis"), desc: t("Auslöser und Aktionen als Liste") },
            { choice: { kind: "brew" }, icon: <FlaskIcon size={20} />, title: t("Brau-Rezept"), desc: t("Trank + Zutat → neuer Trank") },
          ],
        },
      ];
  }
}

export default function CreateMenu({ group = "all", onPick, onClose }: { group?: CreateGroup; onPick: (c: CreateChoice) => void; onClose: () => void }) {
  const [tab, setTab] = useState<CreateGroup>(group);
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  const sections = (query ? cards("all") : cards(tab))
    .map((sec) => ({ ...sec, cards: query ? sec.cards.filter((c) => `${c.title} ${c.desc} ${sec.title}`.toLowerCase().includes(query)) : sec.cards }))
    .filter((sec) => sec.cards.length > 0);
  const first = sections[0]?.cards[0];
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="create-menu" role="dialog" aria-label={t("Neu erstellen")}>
        <div className="create-head">
          <div>
            <div className="panel-title-lg">{t("Was möchtest du erstellen?")}</div>
            <div className="muted small">{t("Wähle eine Vorlage – alles lässt sich danach anpassen.")}</div>
          </div>
          <div className="search create-search">
            <SearchIcon size={13} />
            <input
              autoFocus
              placeholder={t("Suchen: Schwert, Erz, Dimension …")}
              aria-label={t("Vorlagen suchen")}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && first && onPick(first.choice)}
            />
          </div>
          <button className="icon-btn" onClick={onClose} aria-label={t("Schließen")} data-tip={t("Schließen")}>
            <CloseIcon size={14} />
          </button>
        </div>
        <div className="create-body">
          <nav className="create-tabs">
            {GROUPS.map((g) => (
              <button key={g.id} className={tab === g.id && !query ? "create-tab active" : "create-tab"} onClick={() => (setTab(g.id), setQ(""))}>
                {g.icon} {g.label}
              </button>
            ))}
          </nav>
          <div className="create-cards">
            {sections.length === 0 && <p className="muted">{t("Nichts gefunden.")}</p>}
            {sections.map((sec) => (
              <section key={sec.title}>
                <div className="create-sec">{sec.title}</div>
                <div className="create-grid">
                  {sec.cards.map((c) => (
                    <button key={c.title + JSON.stringify(c.choice)} className="create-card" onClick={() => onPick(c.choice)}>
                      <span className="create-card-icon">{c.icon}</span>
                      <span className="create-card-title">{c.title}</span>
                      <span className="create-card-desc">{c.desc}</span>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
