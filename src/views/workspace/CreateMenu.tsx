import { t } from "../../i18n";
import { BetaBadge, type FeatureId } from "../../features";
import { useEffect, useState } from "react";
import { DimTemplate, MobModel } from "../../api";
import {
  BlueprintIcon,
  CloseIcon,
  CubeIcon,
  FlaskIcon,
  GlobeIcon,
  BoxIcon,
  GemIcon,
  PawIcon,
  SearchIcon,
  SkullIcon,
  SparkIcon,
  GuiIcon } from "../../icons";
import { MOB_MODELS } from "./contentDefaults";
import { EXAMPLES, ExampleId } from "./examples";

export type CreateGroup = "all" | "block" | "item" | "mob" | "world" | "logic" | "examples";
export type CreateChoice =
  | { kind: "block"; variant: "normal" | "ore" | "lamp" | "storage" | "shapes" | "workbench" | "machine" | "electric" | "generator" | "solar" | "battery" | "cable" }
  | { kind: "item"; variant: "basic" | "food" | "sword" | "pickaxe" | "axe" | "shovel" | "hoe" | "toolset" | "armor" | "armorset" }
  | { kind: "mob"; model: MobModel }
  | { kind: "blueprint"; template: string }
  | { kind: "event" }
  | { kind: "brew" }
  | { kind: "dimension"; preset: DimTemplate }
  | { kind: "structure" }
  | { kind: "gui"; preset: "machine" | "panel" | "empty" }
  | { kind: "example"; id: ExampleId };

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
  { id: "examples", label: t("Beispiele"), icon: <SparkIcon size={15} /> },
];

function featureOfChoice(c: CreateChoice): FeatureId {
  switch (c.kind) {
    case "block":
      return ["generator", "solar", "battery", "cable", "electric"].includes(c.variant) ? "energy" : c.variant === "machine" ? "machines" : c.variant === "ore" ? "ores" : c.variant === "storage" ? "storage" : c.variant === "workbench" ? "workbench" : "blocks";
    case "item":
      return ["sword", "pickaxe", "axe", "shovel", "hoe", "toolset"].includes(c.variant) ? "tools" : c.variant === "armor" || c.variant === "armorset" ? "armor" : "items";
    case "mob":
      return "mobs";
    case "dimension":
      return "dimensions";
    case "structure":
      return "structures";
    case "blueprint":
      return "blueprints";
    case "gui":
      return "guis";
    case "event":
      return "events";
    case "brew":
      return "brewing";
    case "example":
      return "blocks";
  }
}

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
          cards: [{ choice: { kind: "block", variant: "normal" }, icon: <CubeIcon size={20} />, title: t("Block"), desc: t("Leerer Block. Mit Fähigkeiten wird er zu Erz, Lampe, Truhe, Generator, Kabel …") }],
        },
      ];
    case "item":
      return [
        {
          title: t("Items"),
          cards: [{ choice: { kind: "item", variant: "basic" }, icon: <GemIcon size={20} />, title: t("Item"), desc: t("Leeres Item. Mit Fähigkeiten wird es Werkzeug, Waffe, Rüstung oder Essen.") }],
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
          title: t("Logik"),
          cards: [
            { choice: { kind: "blueprint", template: "empty" }, icon: <BlueprintIcon size={20} />, title: t("Blueprint"), desc: t("Logik ohne Code: Ereignis → Bedingung → Aktion, Werte verbinden") },
            { choice: { kind: "gui", preset: "empty" }, icon: <GuiIcon size={20} />, title: t("Oberfläche"), desc: t("Eigenes Fenster mit Slots, Balken und Knöpfen") },
            { choice: { kind: "brew" }, icon: <FlaskIcon size={20} />, title: t("Brau-Rezept"), desc: t("Trank + Zutat → neuer Trank") },
          ],
        },
      ];
    case "examples":
      return [
        {
          title: t("Beispiele zum Anschauen und Weiterbauen"),
          cards: EXAMPLES.map((e) => ({ choice: { kind: "example", id: e.id } as CreateChoice, icon: <SparkIcon size={20} />, title: e.label, desc: e.desc })),
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
            <div className="muted small">{t("Wähle einen Grundbaustein. Was er kann, gibst du ihm danach mit Fähigkeiten und Blueprints.")}</div>
          </div>
          <div className="search create-search">
            <SearchIcon size={13} />
            <input
              autoFocus
              placeholder={t("Suchen: Block, Blueprint, Dimension …")}
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
                    <button key={c.title + JSON.stringify(c.choice)} className="create-card" data-tour={`create-${c.choice.kind}-${"variant" in c.choice ? c.choice.variant : ""}`} onClick={() => onPick(c.choice)}>
                      <span className="create-card-icon">{c.icon}</span>
                      <span className="create-card-title">
                        {c.title}
                        <BetaBadge feature={featureOfChoice(c.choice)} />
                      </span>
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
