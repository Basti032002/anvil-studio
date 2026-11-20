import { t } from "../../i18n";
import { useEffect, useState } from "react";
import { MobModel } from "../../api";
import {
  BlueprintIcon,
  ChestIcon,
  ChestplateIcon,
  CloseIcon,
  CubeIcon,
  FlaskIcon,
  FoodIcon,
  GemIcon,
  LampIcon,
  LayersIcon,
  LightningIcon,
  PawIcon,
  PickaxeIcon,
  ShovelIcon,
  SkullIcon,
  SparkIcon,
  SwordIcon,
} from "../../icons";
import { MOB_MODELS } from "./contentDefaults";
import { TEMPLATES } from "./blueprints";

export type CreateGroup = "block" | "item" | "mob" | "logic";
export type CreateChoice =
  | { kind: "block"; variant: "normal" | "ore" | "lamp" | "storage" | "shapes" }
  | { kind: "item"; variant: "basic" | "food" | "sword" | "pickaxe" | "axe" | "shovel" | "hoe" | "toolset" | "armor" | "armorset" }
  | { kind: "mob"; model: MobModel }
  | { kind: "blueprint"; template: string }
  | { kind: "event" }
  | { kind: "brew" };

interface Card {
  choice: CreateChoice;
  icon: React.ReactNode;
  title: string;
  desc: string;
}

const GROUPS: { id: CreateGroup; label: string; icon: React.ReactNode }[] = [
  { id: "block", label: t("Blöcke"), icon: <CubeIcon size={15} /> },
  { id: "item", label: t("Items"), icon: <GemIcon size={15} /> },
  { id: "mob", label: t("Kreaturen"), icon: <PawIcon size={15} /> },
  { id: "logic", label: t("Logik"), icon: <BlueprintIcon size={15} /> },
];

function cards(group: CreateGroup): { title: string; cards: Card[] }[] {
  switch (group) {
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
    case "logic":
      return [
        {
          title: t("Blueprint (Knoten-Editor)"),
          cards: TEMPLATES.map((tp) => ({ choice: { kind: "blueprint", template: tp.id } as CreateChoice, icon: <BlueprintIcon size={20} />, title: tp.label, desc: tp.desc })),
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

export default function CreateMenu({ group, onPick, onClose }: { group: CreateGroup; onPick: (c: CreateChoice) => void; onClose: () => void }) {
  const [tab, setTab] = useState<CreateGroup>(group);
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
          <button className="icon-btn" onClick={onClose} aria-label={t("Schließen")} data-tip={t("Schließen")}>
            <CloseIcon size={14} />
          </button>
        </div>
        <div className="create-body">
          <nav className="create-tabs">
            {GROUPS.map((g) => (
              <button key={g.id} className={tab === g.id ? "create-tab active" : "create-tab"} onClick={() => setTab(g.id)}>
                {g.icon} {g.label}
              </button>
            ))}
          </nav>
          <div className="create-cards">
            {cards(tab).map((sec) => (
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
