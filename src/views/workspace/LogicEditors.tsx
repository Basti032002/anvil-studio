import { t } from "../../i18n";
import { ActionDef, ActionKind, BrewDef, Content, EventDef, EventTrigger, Project } from "../../api";
import { Toggle } from "../../components/Chrome";
import { OwnEntry } from "../../components/ItemPicker";
import { CloseIcon, CopyIcon, FlaskIcon, LightningIcon, PlusIcon, TranslateIcon, TrashIcon } from "../../icons";
import { Field, ItemField } from "./ContentForms";
import { POTIONS, variantIds } from "./contentDefaults";

// ---- Weitere Sprachen ------------------------------------------------------

/** Namen in weiteren Sprachen (aufklappbar). */
export function NamesField({ names }: { names: Record<string, string>; onChange?: (n: Record<string, string>) => void }) {
  const filled = Object.values(names).filter((v) => v?.trim()).length;
  return (
    <div className="field span-2 loc-hint">
      <TranslateIcon size={15} />
      <span className="grow">{filled ? t("{n} weitere Sprachen übersetzt", { n: filled }) : t("Weitere Sprachen übersetzt du im Localization-Tab.")}</span>
      <button type="button" className="btn small" onClick={() => window.dispatchEvent(new CustomEvent("anvil:open-tab", { detail: "loc" }))}>
        {t("In Localization öffnen")}
      </button>
    </div>
  );
}

// ---- Ereignisse ------------------------------------------------------------

export const TRIGGERS: { id: EventTrigger; label: string; target: "block" | "item" | "mob_or_item" }[] = [
  { id: "right_click_block", label: t("Rechtsklick auf Block"), target: "block" },
  { id: "right_click_item", label: t("Rechtsklick mit Item"), target: "item" },
  { id: "break_block", label: t("Block abgebaut"), target: "block" },
  { id: "place_block", label: t("Block platziert"), target: "block" },
  { id: "use_item", label: t("Item benutzt/gegessen"), target: "item" },
  { id: "entity_hurt", label: t("Kreatur getroffen"), target: "mob_or_item" },
  { id: "entity_killed", label: t("Kreatur getötet"), target: "mob_or_item" },
];

const ACTIONS: { id: ActionKind; label: string }[] = [
  { id: "effect", label: t("Trankeffekt geben") },
  { id: "give_item", label: t("Item geben") },
  { id: "message", label: t("Nachricht im Chat") },
  { id: "sound", label: t("Geräusch abspielen") },
  { id: "explode", label: t("Explosion") },
  { id: "fire", label: t("Anzünden") },
  { id: "xp", label: t("Erfahrung geben") },
  { id: "heal", label: t("Heilen") },
  { id: "launch", label: t("In die Luft schleudern") },
];

export const EFFECTS = [
  "speed", "slowness", "haste", "mining_fatigue", "strength", "instant_health", "instant_damage", "jump_boost", "nausea", "regeneration",
  "resistance", "fire_resistance", "water_breathing", "invisibility", "blindness", "night_vision", "hunger", "weakness", "poison", "wither",
  "health_boost", "absorption", "saturation", "glowing", "levitation", "luck", "slow_falling", "conduit_power", "dolphins_grace", "darkness",
];

export const SOUNDS = [
  "entity.experience_orb.pickup", "entity.player.levelup", "block.note_block.pling", "block.anvil.land", "entity.generic.explode",
  "block.bell.use", "entity.firework_rocket.launch", "block.amethyst_block.chime", "entity.enderman.teleport", "ui.toast.challenge_complete",
];

export const newEvent = (target = ""): EventDef => ({
  trigger: "right_click_block",
  target,
  cancel: false,
  actions: [{ kind: "message", value: t("Hallo!"), amount: 1, duration: 5, to: "player" }],
});

export function eventLabel(e: EventDef): string {
  return TRIGGERS.find((x) => x.id === e.trigger)?.label ?? e.trigger;
}

export function EventEditor({
  project,
  content,
  event,
  own,
  onChange,
  onDuplicate,
  onRemove,
}: {
  project: Project;
  content: Content;
  event: EventDef;
  own: OwnEntry[];
  onChange: (e: EventDef) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const trig = TRIGGERS.find((x) => x.id === event.trigger) ?? TRIGGERS[0];
  const blocks = content.blocks.flatMap((b) => variantIds(b));
  const targets =
    trig.target === "block"
      ? blocks.map((v) => ({ id: v.id, name: v.name }))
      : trig.target === "item"
        ? content.items.map((i) => ({ id: i.id, name: i.nameDe || i.id }))
        : [
            ...content.mobs.map((m) => ({ id: m.id, name: `${m.nameDe || m.id} (${t("Kreatur")})` })),
            ...content.items.map((i) => ({ id: i.id, name: `${i.nameDe || i.id} (${t("Waffe")})` })),
          ];
  const setAction = (i: number, patch: Partial<ActionDef>) => onChange({ ...event, actions: event.actions.map((a, j) => (j === i ? { ...a, ...patch } : a)) });
  const canCancel = !["use_item", "entity_killed"].includes(event.trigger);
  const hasTarget = event.trigger === "entity_hurt" || event.trigger === "entity_killed";

  return (
    <div className="panel form-panel logic-panel">
      <div className="panel-head">
        <div className="row">
          <span className="sub-icon">
            <LightningIcon size={16} />
          </span>
          <div>
            <div className="panel-title-lg">{t("Ereignis")}</div>
            <div className="muted small">{t("Wenn etwas passiert, führt die Mod die Aktionen aus – ganz ohne Code.")}</div>
          </div>
        </div>
        <div className="row gap-6">
          <button className="icon-btn" onClick={onDuplicate} aria-label={t("Duplizieren")} data-tip={t("Duplizieren")}>
            <CopyIcon size={15} />
          </button>
          <button className="icon-btn danger" onClick={onRemove} aria-label={t("Entfernen")} data-tip={t("Entfernen")}>
            <TrashIcon size={15} />
          </button>
        </div>
      </div>

      <div className="logic-when">
        <span className="logic-word">{t("Wenn")}</span>
        <select className="input" value={event.trigger} onChange={(e) => onChange({ ...event, trigger: e.target.value as EventTrigger, target: "" })} aria-label={t("Auslöser")}>
          {TRIGGERS.map((x) => (
            <option key={x.id} value={x.id}>
              {x.label}
            </option>
          ))}
        </select>
        <span className="logic-word">{t("bei")}</span>
        <select className="input" value={event.target} onChange={(e) => onChange({ ...event, target: e.target.value })} aria-label={t("Ziel")}>
          <option value="">{t("– wählen –")}</option>
          {targets.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
      </div>
      {targets.length === 0 && <div className="callout warn small">{t("Lege zuerst passende Inhalte an (Block, Item oder Kreatur).")}</div>}
      {canCancel && (
        <div className="toggle-row" style={{ flexDirection: "row" }}>
          <Toggle label={t("Verhindern")} checked={event.cancel} onChange={(v) => onChange({ ...event, cancel: v })} />
          <span>
            {t("Eigentliche Handlung verhindern")} <span className="muted small">· {t("z. B. Block lässt sich nicht abbauen")}</span>
          </span>
        </div>
      )}

      <div className="logic-then">
        <span className="logic-word">{t("Dann")}</span>
      </div>
      <div className="action-list">
        {event.actions.map((a, i) => (
          <div key={i} className="action-row">
            <span className="action-num">{i + 1}</span>
            <select className="input" value={a.kind} onChange={(e) => setAction(i, { kind: e.target.value as ActionKind, value: "", amount: 1, duration: 5 })} aria-label={t("Aktion")}>
              {ACTIONS.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label}
                </option>
              ))}
            </select>
            <ActionFields project={project} own={own} action={a} hasTarget={hasTarget} onChange={(patch) => setAction(i, patch)} />
            <button className="icon-btn" aria-label={t("Entfernen")} data-tip={t("Entfernen")} onClick={() => onChange({ ...event, actions: event.actions.filter((_, j) => j !== i) })}>
              <CloseIcon size={12} />
            </button>
          </div>
        ))}
        <button className="btn small" onClick={() => onChange({ ...event, actions: [...event.actions, { kind: "effect", value: "minecraft:speed", amount: 1, duration: 10, to: "player" }] })}>
          <PlusIcon size={13} /> {t("Aktion hinzufügen")}
        </button>
      </div>
    </div>
  );
}

function ActionFields({ project, own, action, hasTarget, onChange }: { project: Project; own: OwnEntry[]; action: ActionDef; hasTarget: boolean; onChange: (p: Partial<ActionDef>) => void }) {
  const who = hasTarget && ["effect", "fire", "heal", "launch"].includes(action.kind) && (
    <select className="input narrow" value={action.to} onChange={(e) => onChange({ to: e.target.value as ActionDef["to"] })} aria-label={t("Für wen")}>
      <option value="player">{t("Spieler")}</option>
      <option value="target">{t("Ziel")}</option>
    </select>
  );
  const num = (label: string, value: number, key: "amount" | "duration", min: number, max: number, step = 1) => (
    <label className="action-num-field">
      <span className="muted small">{label}</span>
      <input className="input" type="number" min={min} max={max} step={step} value={value} onChange={(e) => onChange({ [key]: Number(e.target.value) } as Partial<ActionDef>)} />
    </label>
  );
  switch (action.kind) {
    case "effect":
      return (
        <div className="action-fields">
          <select className="input" value={action.value.replace("minecraft:", "")} onChange={(e) => onChange({ value: `minecraft:${e.target.value}` })} aria-label={t("Effekt")}>
            <option value="">{t("– wählen –")}</option>
            {EFFECTS.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
          {num(t("Stufe"), action.amount, "amount", 1, 10)}
          {num(t("Sekunden"), action.duration, "duration", 1, 3600)}
          {who}
        </div>
      );
    case "give_item":
      return (
        <div className="action-fields">
          <ItemField project={project} own={own} value={action.value} onChange={(v) => onChange({ value: v })} placeholder={t("Item wählen …")} />
          {num(t("Anzahl"), action.amount, "amount", 1, 64)}
        </div>
      );
    case "message":
      return (
        <div className="action-fields">
          <input className="input grow" value={action.value} maxLength={256} onChange={(e) => onChange({ value: e.target.value })} placeholder={t("Text der Nachricht")} />
        </div>
      );
    case "sound":
      return (
        <div className="action-fields">
          <select className="input" value={action.value.replace("minecraft:", "")} onChange={(e) => onChange({ value: `minecraft:${e.target.value}` })} aria-label={t("Geräusch")}>
            <option value="">{t("– wählen –")}</option>
            {SOUNDS.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </div>
      );
    case "explode":
      return <div className="action-fields">{num(t("Stärke"), action.amount, "amount", 0.5, 10, 0.5)}</div>;
    case "fire":
      return (
        <div className="action-fields">
          {num(t("Sekunden"), action.duration, "duration", 1, 60)}
          {who}
        </div>
      );
    case "xp":
      return <div className="action-fields">{num(t("Punkte"), action.amount, "amount", 1, 10000)}</div>;
    case "heal":
      return (
        <div className="action-fields">
          {num(t("Herzen × 2"), action.amount, "amount", 0.5, 1000, 0.5)}
          {who}
        </div>
      );
    case "launch":
      return (
        <div className="action-fields">
          {num(t("Stärke"), action.amount, "amount", 0.5, 20, 0.5)}
          {who}
        </div>
      );
  }
}

// ---- Brauen ----------------------------------------------------------------

export const newBrew = (): BrewDef => ({ input: "awkward", ingredient: "", output: "swiftness" });

export function brewLabel(b: BrewDef): string {
  return `${b.input} → ${b.output}`;
}

export function BrewEditor({ project, brew, own, onChange, onRemove }: { project: Project; brew: BrewDef; own: OwnEntry[]; onChange: (b: BrewDef) => void; onRemove: () => void }) {
  const potionSelect = (value: string, set: (v: string) => void, label: string) => (
    <select className="input" value={value} onChange={(e) => set(e.target.value)} aria-label={label}>
      {POTIONS.map((p) => (
        <option key={p} value={p}>
          {p}
        </option>
      ))}
    </select>
  );
  return (
    <div className="panel form-panel logic-panel">
      <div className="panel-head">
        <div className="row">
          <span className="sub-icon">
            <FlaskIcon size={16} />
          </span>
          <div>
            <div className="panel-title-lg">{t("Brau-Rezept")}</div>
            <div className="muted small">{t("Im Braustand: Trank + Zutat ergibt einen neuen Trank.")}</div>
          </div>
        </div>
        <button className="icon-btn danger" onClick={onRemove} aria-label={t("Entfernen")} data-tip={t("Entfernen")}>
          <TrashIcon size={15} />
        </button>
      </div>
      <div className="form-grid">
        <Field label={t("Ausgangstrank")}>{potionSelect(brew.input, (v) => onChange({ ...brew, input: v }), t("Ausgangstrank"))}</Field>
        <Field label={t("Ergebnis")}>{potionSelect(brew.output, (v) => onChange({ ...brew, output: v }), t("Ergebnis"))}</Field>
        <Field label={t("Zutat")} span>
          <ItemField project={project} own={own} value={brew.ingredient} onChange={(v) => onChange({ ...brew, ingredient: v })} placeholder={t("Item wählen …")} />
        </Field>
        <div className="span-2 muted small">{t("Tipp: „awkward“ ist der seltsame Trank (Wasserflasche + Netherwarze).")}</div>
      </div>
    </div>
  );
}
