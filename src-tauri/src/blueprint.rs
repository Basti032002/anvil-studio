//! Blueprints: Knoten-Graphen (Ereignis → Bedingungen → Aktionen), aus denen
//! Java-Code für NeoForge erzeugt wird. Viele Aktionen laufen über Minecraft-
//! Befehle – deren Syntax ist über die Versionen 1.21.x stabil.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::cell::{Cell, RefCell};
use std::collections::{BTreeMap, HashSet};

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct Blueprint {
    pub name: String,
    pub enabled: bool,
    pub nodes: Vec<BpNode>,
    pub links: Vec<BpLink>,
    /// Kommentar-Rahmen im Editor (ohne Wirkung auf den Code)
    pub comments: Vec<BpComment>,
    /// Gehört zu einem Block oder Item (nur zur Anzeige)
    pub owner: String,
}

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct BpComment {
    pub id: String,
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,
    pub text: String,
    pub color: String,
}

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct BpNode {
    pub id: String,
    pub kind: String,
    pub x: f32,
    pub y: f32,
    pub props: BTreeMap<String, String>,
}

/// Ausführungs-Verbindung: Ausgang `out` von `from` → Eingang von `to`
#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct BpLink {
    pub from: String,
    pub out: String,
    pub to: String,
    /// Werte-Verbindung: Eingang (Eigenschaft) am Ziel – leer = Ablauf-Verbindung
    pub pin: String,
}

/// Versionsunterschiede, die der Generator kennt
pub struct BpApi {
    /// ab 1.21.2: Registry#getValue statt #get
    pub get_value: bool,
    pub modid: String,
    /// Java-Paket der Mod
    pub package: String,
    /// eigene Block-/Item-/Kreatur-IDs (ohne Namensraum)
    pub own: HashSet<String>,
    /// Variablen aus dem Variablen-Tab (Schlüssel: var_name)
    pub vars: BTreeMap<String, VarDef>,
    /// Oberflächen aus dem GUI-Editor (Knöpfe, Schalter, Anzeigen)
    pub guis: Vec<crate::gui::GuiDef>,
}

/// Variable aus dem Variablen-Tab
#[derive(Serialize, Deserialize, Clone, Default, Debug)]
#[serde(rename_all = "camelCase", default)]
pub struct VarDef {
    pub name: String,
    /// number | logic | text | item | block | direction | position
    pub kind: String,
    /// world | session | player | player_life
    pub scope: String,
    pub default: String,
    pub desc: String,
}

pub const VAR_KINDS: &[&str] = &["number", "logic", "text", "item", "block", "direction", "position"];

impl BpApi {
    /// (Java-Gültigkeit w/s/p/l, Art, Startwert) einer Variablen; unbekannte sind Zahlen
    pub fn var_info(&self, name: &str, legacy_scope: &str) -> (&'static str, String, String) {
        let key = var_name(name);
        match self.vars.get(&key) {
            Some(v) => {
                let scope = match v.scope.as_str() {
                    "session" => "s",
                    "player" => "p",
                    "player_life" => "l",
                    _ => "w",
                };
                let kind = if VAR_KINDS.contains(&v.kind.as_str()) { v.kind.clone() } else { "number".into() };
                let def = if v.default.is_empty() { default_of(&kind).to_string() } else { v.default.clone() };
                (scope, kind, def)
            }
            None => (if legacy_scope == "global" { "w" } else { "p" }, "number".into(), "0".into()),
        }
    }
}

fn default_of(kind: &str) -> &'static str {
    match kind {
        "number" => "0",
        "logic" => "false",
        "item" => "minecraft:air",
        "block" => "minecraft:air",
        "direction" => "north",
        "position" => "0 64 0",
        _ => "",
    }
}

/// Tag-ID ohne # und mit Namensraum (ohne: eigene Mod)
fn tag_ref(api: &BpApi, v: &str) -> String {
    let v = v.trim().trim_start_matches('#');
    if v.contains(':') { v.to_string() } else { format!("{}:{v}", api.modid) }
}

/// Java-Ausdruck: Wert einer Variablen als Text
fn var_get(api: &BpApi, name: &str, legacy_scope: &str) -> String {
    let (scope, _, def) = api.var_info(name, legacy_scope);
    let who = if matches!(scope, "p" | "l") { "player" } else { "null" };
    format!("anvilVar(level, {who}, \"{scope}\", \"{}\", \"{}\")", var_name(name), js(&def))
}

/// Java-Ausdruck: Wert einer Variablen als Zahl
fn var_num(api: &BpApi, name: &str, legacy_scope: &str) -> String {
    let (scope, _, def) = api.var_info(name, legacy_scope);
    let who = if matches!(scope, "p" | "l") { "player" } else { "null" };
    let d: f64 = def.trim().parse().unwrap_or(0.0);
    format!("anvilNum(level, {who}, \"{scope}\", \"{}\", {d:?})", var_name(name))
}

/// Java-Anweisung: Variable setzen (value: Java-Ausdruck, Text oder Zahl)
fn var_put(api: &BpApi, ind: &str, name: &str, legacy_scope: &str, value: &str, numeric: bool) -> String {
    let (scope, _, _) = api.var_info(name, legacy_scope);
    let who = if matches!(scope, "p" | "l") { "player" } else { "null" };
    let f = if numeric { "anvilPutNum" } else { "anvilPut" };
    format!("{ind}{f}(level, {who}, \"{scope}\", \"{}\", {value});\n", var_name(name))
}

/// Java-Ausdruck für einen Spielwert (src = game)
fn game_expr(api: &BpApi, g: &str) -> (String, bool) {
    let get = if api.get_value { "getKey" } else { "getKey" };
    let num = |e: &str| (e.to_string(), true);
    let txt = |e: String| (e, false);
    match g {
        "health" => num("(player != null ? player.getHealth() : 0)"),
        "food" => num("(player != null ? player.getFoodData().getFoodLevel() : 0)"),
        "level" => num("(player != null ? player.experienceLevel : 0)"),
        "x" => num("Math.floor(x)"),
        "y" => num("Math.floor(y)"),
        "z" => num("Math.floor(z)"),
        "online" => num("level.getServer().getPlayerCount()"),
        "time" => num("(level.getDayTime() % 24000L)"),
        "random" => num("level.getRandom().nextDouble()"),
        "target_health" => num("(target != null ? target.getHealth() : 0)"),
        "held_count" => num("(player != null ? player.getMainHandItem().getCount() : 0)"),
        "block_energy" => num("anvilEnergyAt(level, BlockPos.containing(x, y, z))"),
        "player_name" => txt("(player != null ? player.getName().getString() : \"\")".into()),
        "message" => txt("message".into()),
        "dimension" => txt("level.dimension().location().toString()".into()),
        "target_name" => txt("(target != null ? target.getName().getString() : \"\")".into()),
        "held_item" => txt(format!("(player != null ? BuiltInRegistries.ITEM.{get}(player.getMainHandItem().getItem()).toString() : \"minecraft:air\")")),
        "event_item" => txt(format!("(stack != null ? BuiltInRegistries.ITEM.{get}(stack.getItem()).toString() : \"minecraft:air\")")),
        "block_below" => txt(format!("BuiltInRegistries.BLOCK.{get}(level.getBlockState(BlockPos.containing(x, y - 0.5, z)).getBlock()).toString()")),
        "event_block" => txt(format!("(state != null ? BuiltInRegistries.BLOCK.{get}(state.getBlock()).toString() : \"minecraft:air\")")),
        "look" => txt("(player != null ? player.getDirection().getName() : \"north\")".into()),
        "player_pos" => txt("(player != null ? anvilPos(player.getX(), player.getY(), player.getZ()) : anvilPos(x, y, z))".into()),
        "target_pos" => txt("(target != null ? anvilPos(target.getX(), target.getY(), target.getZ()) : anvilPos(x, y, z))".into()),
        _ => txt("anvilPos(x, y, z)".into()),
    }
}

/// ID vollständig machen: eigene Inhalte bekommen die Mod-ID, Rest minecraft:
fn rid(api: &BpApi, s: &str) -> String {
    let s = s.trim();
    if s.contains(':') {
        js(s)
    } else if api.own.contains(s) {
        js(&format!("{}:{s}", api.modid))
    } else {
        js(&format!("minecraft:{s}"))
    }
}

fn js(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"").replace('\n', "\\n").replace('\r', "")
}

/// Variablenname → Scoreboard-Ziel (nur a-z, 0-9, _)
pub fn var_name(s: &str) -> String {
    let n: String = s.trim().to_lowercase().chars().map(|c| if c.is_ascii_alphanumeric() { c } else { '_' }).take(24).collect();
    if n.is_empty() { "wert".into() } else { n }
}

/// Text mit {player}, {var:name} und {global:name} als Java-Ausdruck
fn text_expr(api: &BpApi, s: &str) -> String {
    let mut parts: Vec<String> = vec![];
    let mut lit = String::new();
    let mut rest = s;
    while let Some(i) = rest.find('{') {
        let after = &rest[i + 1..];
        let Some(j) = after.find('}') else { break };
        let token = &after[..j];
        let expr = if token == "player" {
            Some("(player != null ? player.getName().getString() : \"\")".to_string())
        } else if let Some(v) = token.strip_prefix("var:") {
            Some(var_get(api, v, "player"))
        } else if let Some(v) = token.strip_prefix("global:") {
            Some(var_get(api, v, "global"))
        } else {
            None
        };
        match expr {
            Some(e) => {
                lit.push_str(&rest[..i]);
                parts.push(format!("\"{}\"", js(&lit)));
                lit.clear();
                parts.push(format!("String.valueOf({e})"));
            }
            None => lit.push_str(&rest[..i + 1 + j + 1]),
        }
        rest = &after[j + 1..];
    }
    lit.push_str(rest);
    parts.push(format!("\"{}\"", js(&lit)));
    parts.join(" + ")
}

/// Befehlsteil sicher machen (nur eine Zeile, kein führender Schrägstrich)
fn cmd_part(s: &str) -> String {
    s.trim().trim_start_matches('/').replace(['\n', '\r'], " ")
}

fn id_ok(s: &str) -> bool {
    let s = s.trim();
    !s.is_empty() && s.len() < 120 && s.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || "_:/.-".contains(c))
}

fn num(props: &BTreeMap<String, String>, key: &str, default: f64, min: f64, max: f64) -> f64 {
    props.get(key).and_then(|v| v.trim().replace(',', ".").parse::<f64>().ok()).unwrap_or(default).clamp(min, max)
}

fn prop<'a>(props: &'a BTreeMap<String, String>, key: &str) -> &'a str {
    props.get(key).map(|s| s.trim()).unwrap_or("")
}

/// Wer betroffen ist: der Spieler oder das Ziel (z. B. getroffene Kreatur)
fn who(props: &BTreeMap<String, String>) -> &'static str {
    if prop(props, "who") == "target" {
        "target"
    } else {
        "player"
    }
}

pub const EVENT_KINDS: [&str; 29] = [
    "ev_block_tick", "ev_block_use", "ev_block_redstone",
    "ev_join", "ev_respawn", "ev_dimension", "ev_timer", "ev_click_block", "ev_click_item", "ev_break", "ev_place", "ev_use", "ev_hurt", "ev_kill",
    "ev_jump", "ev_chat", "ev_craft", "ev_start", "ev_click_entity", "ev_player_death", "ev_leave", "ev_pickup", "ev_level_up", "ev_left_click_block",
    "ev_function", "ev_command", "ev_toss", "ev_player_hurt", "ev_fish",
];

/// Parameter eines Körpers (Schleifen, Funktionen) – dieselben Namen wie im Ereignis
const BODY_PARAMS: &str = "ServerLevel level, Player player, LivingEntity target, double x, double y, double z, BlockState state, ItemStack stack, String message";

/// Name einer eigenen Funktion als Java-Bezeichner
pub fn fn_name(s: &str) -> String {
    let v = var_name(s);
    if v.is_empty() { "funktion".into() } else { v }
}

struct Gen<'a> {
    api: &'a BpApi,
    bp: &'a Blueprint,
    nodes: BTreeMap<&'a str, &'a BpNode>,
    cancellable: bool,
    /// zusätzliche Methoden (Schleifenkörper)
    extra: &'a RefCell<String>,
    seq: &'a Cell<usize>,
}

impl<'a> Gen<'a> {
    /// Körper als eigene Methode (frische Variablennamen), gibt den Methodennamen zurück
    fn body_method(&self, from: &str, out: &str, depth: usize, stack: &mut HashSet<String>) -> Option<String> {
        let g = Gen { api: self.api, bp: self.bp, nodes: self.nodes.clone(), cancellable: false, extra: self.extra, seq: self.seq };
        let body = g.follow(from, out, 0, true, stack);
        let _ = depth;
        if body.trim().is_empty() {
            return None;
        }
        let n = self.seq.get() + 1;
        self.seq.set(n);
        let name = format!("anvilBody{n}");
        self.extra.borrow_mut().push_str(&format!("\n    private static void {name}({BODY_PARAMS}) {{\n{body}    }}\n"));
        Some(name)
    }

    /// Code für alle Knoten, die an Ausgang `out` von `from` hängen
    fn follow(&self, from: &str, out: &str, depth: usize, in_lambda: bool, stack: &mut HashSet<String>) -> String {
        let mut links: Vec<&BpLink> = self.bp.links.iter().filter(|l| l.from == from && l.out == out && l.pin.is_empty()).collect();
        // von oben nach unten ausführen
        links.sort_by(|a, b| {
            let ya = self.nodes.get(a.to.as_str()).map(|n| n.y).unwrap_or(0.0);
            let yb = self.nodes.get(b.to.as_str()).map(|n| n.y).unwrap_or(0.0);
            ya.partial_cmp(&yb).unwrap_or(std::cmp::Ordering::Equal)
        });
        let mut out_code = String::new();
        for l in links {
            if let Some(n) = self.nodes.get(l.to.as_str()) {
                out_code.push_str(&self.node(n, depth, in_lambda, stack));
            }
        }
        out_code
    }

    fn node(&self, n: &BpNode, depth: usize, in_lambda: bool, stack: &mut HashSet<String>) -> String {
        if depth > 48 || stack.contains(&n.id) || EVENT_KINDS.contains(&n.kind.as_str()) || n.kind.starts_with("val_") || crate::plugins::is_value_node(&n.kind) {
            return String::new(); // Schleife oder zu tief
        }
        stack.insert(n.id.clone());
        let ind = "        ".to_string() + &"    ".repeat(depth.min(12));
        let p = &n.props;
        let next = |s: &mut HashSet<String>| self.follow(&n.id, "next", depth, in_lambda, s);
        let run = |cmd: String| format!("{ind}anvilRun(level, {}, x, y, z, \"{}\");\n", who(p), js(&cmd));
        let code = match n.kind.as_str() {
            // ---- Ablauf ----
            "if" => {
                let cond = self.pin(n, "ifcond", "bool").unwrap_or_else(|| self.full_condition(p));
                let t = self.follow(&n.id, "true", depth + 1, in_lambda, stack);
                let f = self.follow(&n.id, "false", depth + 1, in_lambda, stack);
                let mut c = format!("{ind}if ({cond}) {{\n{t}{ind}}}");
                if !f.is_empty() {
                    c.push_str(&format!(" else {{\n{f}{ind}}}"));
                }
                c.push('\n');
                c + &next(stack)
            }
            "delay" => {
                let ticks = (num(p, "seconds", 1.0, 0.05, 3600.0) * 20.0).round() as i64;
                let rest = self.follow(&n.id, "next", depth + 1, true, stack);
                stack.remove(&n.id);
                return format!("{ind}anvilLater(level, {ticks}, () -> {{\n{rest}{ind}}});\n");
            }
            "repeat" => {
                let times = num(p, "times", 3.0, 1.0, 1000.0) as i64;
                let body = self.follow(&n.id, "body", depth + 1, in_lambda, stack);
                format!("{ind}for (int i{depth} = 0; i{depth} < {times}; i{depth}++) {{\n{body}{ind}}}\n") + &self.follow(&n.id, "done", depth, in_lambda, stack)
            }
            "while" => {
                let cond = self.full_condition(p);
                let max = num(p, "max", 100.0, 1.0, 10000.0) as i64;
                let body = self.follow(&n.id, "body", depth + 1, in_lambda, stack);
                format!("{ind}for (int w{depth} = 0; w{depth} < {max} && ({cond}); w{depth}++) {{\n{body}{ind}}}\n") + &self.follow(&n.id, "done", depth, in_lambda, stack)
            }
            "for_players" => {
                let call = self.body_method(&n.id, "body", depth, stack);
                let mut c = String::new();
                if let Some(m) = call {
                    let filter = if prop(p, "range") == "radius" {
                        format!(" if (p.distanceToSqr(x, y, z) > {r} * {r}) continue;", r = num(p, "radius", 16.0, 1.0, 512.0))
                    } else {
                        String::new()
                    };
                    c = format!("{ind}for (net.minecraft.server.level.ServerPlayer p : new java.util.ArrayList<>(level.getServer().getPlayerList().getPlayers())) {{{filter} if (p.level() instanceof ServerLevel pl) {m}(pl, p, p, p.getX(), p.getY(), p.getZ(), null, p.getMainHandItem(), message); }}\n");
                }
                c + &self.follow(&n.id, "done", depth, in_lambda, stack)
            }
            "for_entities" => {
                let call = self.body_method(&n.id, "body", depth, stack);
                let mut c = String::new();
                if let Some(m) = call {
                    let r = num(p, "radius", 8.0, 1.0, 64.0);
                    let e = prop(p, "entity");
                    let filter = if id_ok(e) { format!(" if (e.getType() != anvilEntity(\"{}\")) continue;", rid(self.api, e)) } else { String::new() };
                    let players = if prop(p, "players") == "yes" { "" } else { " if (e instanceof Player) continue;" };
                    c = format!("{ind}for (LivingEntity e : level.getEntitiesOfClass(LivingEntity.class, new net.minecraft.world.phys.AABB(x - {r}, y - {r}, z - {r}, x + {r}, y + {r}, z + {r}))) {{{filter}{players} {m}(level, player, e, e.getX(), e.getY(), e.getZ(), state, stack, message); }}\n");
                }
                c + &self.follow(&n.id, "done", depth, in_lambda, stack)
            }
            "stop" => {
                stack.remove(&n.id);
                return format!("{ind}if (true) return;\n");
            }
            "call" => {
                let f = fn_name(prop(p, "fn"));
                format!("{ind}anvilFn_{f}(level, player, target, x, y, z, state, stack, message);\n") + &next(stack)
            }
            "var_math" => {
                let name = prop(p, "var");
                let operand = if prop(p, "src") == "var" { var_num(self.api, prop(p, "var2"), prop(p, "scope2")) } else { format!("{:?}", num(p, "value", 1.0, -1_000_000_000.0, 1_000_000_000.0)) };
                let cur = var_num(self.api, name, prop(p, "scope"));
                let expr = match prop(p, "op") {
                    "set" => operand.clone(),
                    "sub" => format!("{cur} - {operand}"),
                    "mul" => format!("{cur} * {operand}"),
                    "div" => format!("({operand}) == 0 ? {cur} : {cur} / ({operand})"),
                    "mod" => format!("({operand}) == 0 ? {cur} : {cur} % ({operand})"),
                    "min" => format!("Math.min({cur}, {operand})"),
                    "max" => format!("Math.max({cur}, {operand})"),
                    "rand" => format!("level.getRandom().nextInt(Math.max(1, (int) ({operand})))"),
                    _ => format!("{cur} + {operand}"),
                };
                var_put(self.api, &ind, name, prop(p, "scope"), &expr, true) + &next(stack)
            }
            "random_tp" => run(format!("spreadplayers ~ ~ 0 {} false @s", num(p, "radius", 50.0, 1.0, 10000.0) as i64)) + &next(stack),
            "set_name" => {
                let t = text_expr(self.api, prop(p, "text"));
                format!("{ind}if (target != null && !(target instanceof Player)) {{ target.setCustomName(Component.literal({t})); target.setCustomNameVisible(true); }}\n") + &next(stack)
            }
            "place_structure" => {
                let st = prop(p, "structure");
                let st = if id_ok(st) { st.to_string() } else { "minecraft:village_plains".into() };
                format!("{ind}anvilRun(level, null, x, y, z, \"place structure {} ~ ~ ~\");\n", js(&st)) + &next(stack)
            }
            "equip" => {
                let it = prop(p, "item");
                if id_ok(it) {
                    let slot = match prop(p, "slot") {
                        "chest" => "armor.chest",
                        "legs" => "armor.legs",
                        "feet" => "armor.feet",
                        "offhand" => "weapon.offhand",
                        "hand" => "weapon.mainhand",
                        _ => "armor.head",
                    };
                    run(format!("item replace entity @s {slot} with {}", rid(self.api, it))) + &next(stack)
                } else {
                    next(stack)
                }
            }
            "cancel" => {
                let c = if self.cancellable && !in_lambda { format!("{ind}event.setCanceled(true);\n") } else { String::new() };
                c + &next(stack)
            }
            // ---- Aktionen ----
            "message" => {
                let text = self.text_in(n, "text");
                let c = if prop(p, "to") == "all" {
                    format!("{ind}level.getServer().getPlayerList().broadcastSystemMessage(Component.literal({text}), false);\n")
                } else {
                    format!("{ind}if (player != null) player.displayClientMessage(Component.literal({text}), false);\n")
                };
                c + &next(stack)
            }
            "actionbar" => {
                format!("{ind}if (player != null) player.displayClientMessage(Component.literal({}), true);\n", self.text_in(n, "text")) + &next(stack)
            }
            "title" => {
                let t = serde_json::to_string(prop(p, "text")).unwrap_or_else(|_| "\"\"".into());
                let sel = if prop(p, "to") == "all" { "@a" } else { "@s" };
                let sub = prop(p, "subtitle");
                let mut c = run(format!("title {sel} title {t}"));
                if !sub.is_empty() {
                    let st = serde_json::to_string(sub).unwrap_or_else(|_| "\"\"".into());
                    c = run(format!("title {sel} subtitle {st}")) + &c;
                }
                c + &next(stack)
            }
            // ---- Variablen ----
            "var_set" => {
                let name = prop(p, "var");
                let (_, kind, _) = self.api.var_info(name, prop(p, "scope"));
                let numeric = kind == "number";
                // Quelle: verbundener Wert, fester Wert, andere Variable oder Spielwert
                let linked = self.pin(n, "value", if numeric { "num" } else { "text" });
                let (src, src_num) = match prop(p, "src") {
                    _ if linked.is_some() => (linked.clone().unwrap_or_default(), numeric),
                    "var" => {
                        if numeric { (var_num(self.api, prop(p, "var2"), "player"), true) } else { (var_get(self.api, prop(p, "var2"), "player"), false) }
                    }
                    "game" => game_expr(self.api, prop(p, "game")),
                    _ => {
                        if numeric {
                            (format!("{:?}", num(p, "value", 1.0, -1_000_000_000.0, 1_000_000_000.0)), true)
                        } else if kind == "logic" {
                            ((if prop(p, "value") == "true" { "\"true\"" } else { "\"false\"" }).to_string(), false)
                        } else if kind == "text" {
                            (text_expr(self.api, prop(p, "value")), false)
                        } else if kind == "item" || kind == "block" {
                            (format!("\"{}\"", js(&rid(self.api, prop(p, "value")))), false)
                        } else {
                            (format!("\"{}\"", js(prop(p, "value").trim())), false)
                        }
                    }
                };
                let code = if numeric {
                    let v = if src_num { src.clone() } else { format!("anvilParse({src})") };
                    let cur = var_num(self.api, name, prop(p, "scope"));
                    let expr = match prop(p, "op") {
                        "add" => format!("{cur} + {v}"),
                        "sub" => format!("{cur} - {v}"),
                        "mul" => format!("{cur} * {v}"),
                        "div" => format!("({v}) == 0 ? {cur} : {cur} / ({v})"),
                        "random" => format!("level.getRandom().nextInt(Math.max(1, (int) ({v})))"),
                        _ => v,
                    };
                    var_put(self.api, &ind, name, prop(p, "scope"), &expr, true)
                } else if kind == "logic" && prop(p, "op") == "toggle" {
                    let cur = var_get(self.api, name, "player");
                    var_put(self.api, &ind, name, "player", &format!("String.valueOf(!\"true\".equals({cur}))"), false)
                } else {
                    let v = if src_num { format!("anvilFmt({src})") } else { format!("String.valueOf({src})") };
                    var_put(self.api, &ind, name, prop(p, "scope"), &v, false)
                };
                code + &next(stack)
            }
            "var_show" => {
                let name = var_name(prop(p, "var"));
                let (scope, _, def) = self.api.var_info(prop(p, "var"), "player");
                let slot = if prop(p, "slot") == "list" { "list" } else { "sidebar" };
                format!("{ind}anvilObj(level, \"{name}\");\n{ind}anvilShow(level, \"{scope}\", \"{name}\", \"{}\");\n{ind}anvilRun(level, null, x, y, z, \"scoreboard objectives setdisplay {slot} anv_{name}\");\n", js(&def)) + &next(stack)
            }
            "var_hide" => format!("{ind}anvilRun(level, null, x, y, z, \"scoreboard objectives setdisplay sidebar\");\n") + &next(stack),
            // ---- weitere Aktionen ----
            "remove_item" => {
                let item = prop(p, "item");
                let count = num(p, "count", 1.0, 1.0, 2304.0) as i64;
                (if id_ok(item) { run(format!("clear @s {} {count}", rid(self.api, item))) } else { String::new() }) + &next(stack)
            }
            "drop_item" => {
                let item = prop(p, "item");
                let count = num(p, "count", 1.0, 1.0, 64.0) as i64;
                (if id_ok(item) {
                    format!("{ind}anvilRun(level, null, x, y, z, \"summon item ~ ~1 ~ {{Item:{{id:\\\"{}\\\",count:{count}}}}}\");\n", rid(self.api, item))
                } else {
                    String::new()
                }) + &next(stack)
            }
            "fill" => {
                let b = prop(p, "block");
                let r = num(p, "radius", 2.0, 0.0, 15.0) as i64;
                let dy = num(p, "dy", 0.0, -64.0, 64.0) as i64;
                (if id_ok(b) {
                    format!("{ind}anvilRun(level, null, x, y, z, \"fill ~-{r} ~{dy} ~-{r} ~{r} ~{} ~{r} {}\");\n", dy + num(p, "height", 1.0, 1.0, 31.0) as i64 - 1, rid(self.api, b))
                } else {
                    String::new()
                }) + &next(stack)
            }
            "bossbar" => {
                let id = format!("anvil:bar_{}", n.id.to_lowercase().chars().filter(|c| c.is_ascii_alphanumeric()).collect::<String>());
                let text = serde_json::to_string(prop(p, "text")).unwrap_or_else(|_| "\"\"".into());
                let color = match prop(p, "color") {
                    c @ ("blue" | "green" | "pink" | "purple" | "red" | "white" | "yellow") => c,
                    _ => "purple",
                };
                let value = num(p, "progress", 100.0, 0.0, 100.0) as i64;
                let secs = num(p, "seconds", 10.0, 0.0, 86400.0);
                let sel = if prop(p, "to") == "all" { "@a" } else { "@s" };
                let mut c = String::new();
                for cmd in [
                    format!("bossbar add {id} {text}"),
                    format!("bossbar set {id} name {text}"),
                    format!("bossbar set {id} color {color}"),
                    format!("bossbar set {id} max 100"),
                    format!("bossbar set {id} value {value}"),
                    format!("bossbar set {id} visible true"),
                    format!("bossbar set {id} players {sel}"),
                ] {
                    c.push_str(&run(cmd));
                }
                if secs > 0.0 {
                    let ticks = (secs * 20.0).round() as i64;
                    c.push_str(&format!("{ind}anvilLater(level, {ticks}, () -> anvilRun(level, null, x, y, z, \"bossbar remove {id}\"));\n"));
                }
                c + &next(stack)
            }
            "travel" => {
                let dim = prop(p, "dim");
                (if id_ok(dim) {
                    let back = if prop(p, "mode") == "toggle" { "true" } else { "false" };
                    format!("{ind}if (player != null) anvilTravel(level, player, \"{}\", {back});\n", rid(self.api, dim))
                } else {
                    String::new()
                }) + &next(stack)
            }
            "firework" => format!("{ind}anvilRun(level, null, x, y, z, \"summon firework_rocket ~ ~1 ~ {{LifeTime:20}}\");\n") + &next(stack),
            "spawnpoint" => run("spawnpoint @s ~ ~ ~".into()) + &next(stack),
            "feed" => run("effect give @s saturation 1 20 true".into()) + &next(stack),
            "enchant" => {
                let e = prop(p, "enchant");
                let lvl = num(p, "level", 1.0, 1.0, 5.0) as i64;
                (if id_ok(e) { run(format!("enchant @s {e} {lvl}")) } else { String::new() }) + &next(stack)
            }
            "command" => {
                let c = cmd_part(prop(p, "command"));
                // {var:name} und {player} im Befehl werden eingesetzt
                (if c.is_empty() { String::new() } else if c.contains('{') { format!("{ind}anvilRun(level, {}, x, y, z, {});\n", who(p), text_expr(self.api, &c)) } else { run(c) }) + &next(stack)
            }
            "weather" => {
                let w = match prop(p, "weather") {
                    "rain" => "rain",
                    "thunder" => "thunder",
                    _ => "clear",
                };
                let secs = num(p, "seconds", 300.0, 1.0, 100000.0) as i64;
                format!("{ind}anvilRun(level, null, x, y, z, \"weather {w} {secs}s\");\n") + &next(stack)
            }
            "time" => {
                let t = match prop(p, "time") {
                    "noon" => "noon",
                    "night" => "night",
                    "midnight" => "midnight",
                    _ => "day",
                };
                format!("{ind}anvilRun(level, null, x, y, z, \"time set {t}\");\n") + &next(stack)
            }
            "summon" => {
                let e = prop(p, "entity");
                let count = num(p, "count", 1.0, 1.0, 50.0) as i64;
                if id_ok(e) {
                    format!("{ind}for (int s{depth} = 0; s{depth} < {count}; s{depth}++) anvilRun(level, null, x, y, z, \"summon {} ~ ~1 ~\");\n", rid(self.api, e)) + &next(stack)
                } else {
                    next(stack)
                }
            }
            "lightning" => format!("{ind}anvilRun(level, null, x, y, z, \"summon minecraft:lightning_bolt ~ ~ ~\");\n") + &next(stack),
            "setblock" => {
                let b = prop(p, "block");
                let (dx, dy, dz) = (num(p, "dx", 0.0, -64.0, 64.0) as i64, num(p, "dy", 0.0, -64.0, 64.0) as i64, num(p, "dz", 0.0, -64.0, 64.0) as i64);
                if id_ok(b) {
                    format!("{ind}anvilRun(level, null, x, y, z, \"setblock ~{dx} ~{dy} ~{dz} {}\");\n", rid(self.api, b)) + &next(stack)
                } else {
                    next(stack)
                }
            }
            "particle" => {
                let pt = prop(p, "particle");
                let count = num(p, "count", 20.0, 1.0, 500.0) as i64;
                if id_ok(pt) {
                    format!("{ind}anvilRun(level, null, x, y, z, \"particle {} ~ ~1 ~ 0.5 0.5 0.5 0.05 {count}\");\n", js(pt)) + &next(stack)
                } else {
                    next(stack)
                }
            }
            "teleport" => {
                let (dx, dy, dz) = (num(p, "dx", 0.0, -1000.0, 1000.0), num(p, "dy", 10.0, -1000.0, 1000.0), num(p, "dz", 0.0, -1000.0, 1000.0));
                run(format!("tp @s ~{dx} ~{dy} ~{dz}")) + &next(stack)
            }
            "give" => {
                let item = prop(p, "item");
                let count = num(p, "count", 1.0, 1.0, 64.0) as i64;
                (if id_ok(item) { run(format!("give @s {} {count}", rid(self.api, item))) } else { String::new() }) + &next(stack)
            }
            "effect" => {
                let e = prop(p, "effect");
                let secs = num(p, "seconds", 10.0, 1.0, 100000.0) as i64;
                let lvl = (num(p, "level", 1.0, 1.0, 10.0) as i64) - 1;
                (if id_ok(e) { run(format!("effect give @s {e} {secs} {lvl}")) } else { String::new() }) + &next(stack)
            }
            "clear_effects" => run("effect clear @s".into()) + &next(stack),
            "sound" => {
                let s = prop(p, "sound");
                (if id_ok(s) { format!("{ind}anvilRun(level, null, x, y, z, \"playsound {} master @a ~ ~ ~ 1 1\");\n", js(s)) } else { String::new() }) + &next(stack)
            }
            "explode" => {
                let power = num(p, "power", 2.0, 0.5, 10.0);
                format!("{ind}level.explode(null, x, y, z, {power:.1}f, Level.ExplosionInteraction.TNT);\n") + &next(stack)
            }
            "fire" => {
                let secs = num(p, "seconds", 5.0, 1.0, 60.0) as i64;
                format!("{ind}if ({w} != null) {w}.igniteForSeconds({secs}f);\n", w = who(p)) + &next(stack)
            }
            "heal" => {
                let amt = num(p, "amount", 4.0, 0.5, 1000.0);
                format!("{ind}if ({w} != null) {w}.heal({amt:.1}f);\n", w = who(p)) + &next(stack)
            }
            "damage" => {
                let amt = num(p, "amount", 2.0, 0.5, 1000.0);
                run(format!("damage @s {amt:.1} minecraft:magic")) + &next(stack)
            }
            "launch" => {
                let s = num(p, "strength", 2.0, 0.1, 20.0) * 0.5;
                format!("{ind}if ({w} != null) {{ {w}.setDeltaMovement({w}.getDeltaMovement().add(0, {s:.2}, 0)); {w}.hurtMarked = true; }}\n", w = who(p)) + &next(stack)
            }
            "xp" => {
                let amt = num(p, "amount", 10.0, 1.0, 100000.0) as i64;
                format!("{ind}if (player != null) player.giveExperiencePoints({amt});\n") + &next(stack)
            }
            "gamemode" => {
                let m = match prop(p, "mode") {
                    "creative" => "creative",
                    "adventure" => "adventure",
                    "spectator" => "spectator",
                    _ => "survival",
                };
                run(format!("gamemode {m} @s")) + &next(stack)
            }
            "clear_inventory" => run("clear @s".into()) + &next(stack),
            "kill" => run("kill @s".into()) + &next(stack),
            // ---- weitere Spieler-/Kreatur-Aktionen ----
            "set_health" => {
                let v = num(p, "amount", 20.0, 0.5, 1024.0);
                format!("{ind}if ({w} != null) {w}.setHealth({v:.1}f);\n", w = who(p)) + &next(stack)
            }
            "set_food" => {
                let v = num(p, "amount", 20.0, 0.0, 20.0) as i64;
                format!("{ind}if (player != null) player.getFoodData().setFoodLevel({v});\n") + &next(stack)
            }
            "fly" => {
                let on = prop(p, "on") != "false";
                format!("{ind}if (player instanceof net.minecraft.server.level.ServerPlayer sp) {{ sp.getAbilities().mayfly = {on}; if (!{on}) sp.getAbilities().flying = false; sp.onUpdateAbilities(); }}\n") + &next(stack)
            }
            "xp_level" => {
                let v = num(p, "amount", 10.0, 0.0, 100000.0) as i64;
                format!("{ind}if (player instanceof net.minecraft.server.level.ServerPlayer sp) sp.setExperienceLevels({v});\n") + &next(stack)
            }
            "attribute" => {
                let new = self.api.get_value;
                let id = match (prop(p, "attr"), new) {
                    ("speed", true) => "minecraft:movement_speed",
                    ("speed", false) => "minecraft:generic.movement_speed",
                    ("jump", true) => "minecraft:jump_strength",
                    ("jump", false) => "minecraft:generic.jump_strength",
                    ("max_health", true) => "minecraft:max_health",
                    ("max_health", false) => "minecraft:generic.max_health",
                    ("damage", true) => "minecraft:attack_damage",
                    ("damage", false) => "minecraft:generic.attack_damage",
                    ("reach", true) => "minecraft:block_interaction_range",
                    ("reach", false) => "minecraft:player.block_interaction_range",
                    ("gravity", true) => "minecraft:gravity",
                    ("gravity", false) => "minecraft:generic.gravity",
                    ("step", true) => "minecraft:step_height",
                    ("step", false) => "minecraft:generic.step_height",
                    (_, true) => "minecraft:scale",
                    (_, false) => "minecraft:generic.scale",
                };
                let v = num(p, "value", 1.0, -1000.0, 1000.0);
                run(format!("attribute @s {id} base set {v}")) + &next(stack)
            }
            "attribute_reset" => {
                let new = self.api.get_value;
                let ids: &[&str] = if new {
                    &["minecraft:scale", "minecraft:movement_speed", "minecraft:jump_strength", "minecraft:max_health", "minecraft:attack_damage", "minecraft:block_interaction_range", "minecraft:gravity", "minecraft:step_height"]
                } else {
                    &["minecraft:generic.scale", "minecraft:generic.movement_speed", "minecraft:generic.jump_strength", "minecraft:generic.max_health", "minecraft:generic.attack_damage", "minecraft:player.block_interaction_range", "minecraft:generic.gravity", "minecraft:generic.step_height"]
                };
                let mut c = String::new();
                for id in ids {
                    c.push_str(&run(format!("attribute @s {id} base reset")));
                }
                c + &next(stack)
            }
            "tag_add" | "tag_remove" => {
                let tag = var_name(prop(p, "tag"));
                let op = if n.kind == "tag_add" { "add" } else { "remove" };
                run(format!("tag @s {op} {tag}")) + &next(stack)
            }
            "repair" => format!("{ind}if (player != null && player.getMainHandItem().isDamageableItem()) player.getMainHandItem().setDamageValue(0);\n") + &next(stack),
            "glow" => {
                let on = prop(p, "on") != "false";
                format!("{ind}if ({w} != null) {w}.setGlowingTag({on});\n", w = who(p)) + &next(stack)
            }
            "invisible" => {
                let on = prop(p, "on") != "false";
                format!("{ind}if ({w} != null) {w}.setInvisible({on});\n", w = who(p)) + &next(stack)
            }
            "freeze" => {
                let on = prop(p, "on") != "false";
                format!("{ind}if (target instanceof net.minecraft.world.entity.Mob anvilMob) anvilMob.setNoAi({on});\n") + &next(stack)
            }
            "knockback" => {
                let s = num(p, "strength", 1.5, 0.1, 10.0);
                format!("{ind}if (target != null && player != null && target != player) {{ target.knockback({s:.2}, player.getX() - target.getX(), player.getZ() - target.getZ()); target.hurtMarked = true; }}\n") + &next(stack)
            }
            "remove_entity" => format!("{ind}if (target != null && !(target instanceof Player)) target.discard();\n") + &next(stack),
            "extinguish" => format!("{ind}if ({w} != null) {w}.clearFire();\n", w = who(p)) + &next(stack),
            "kick" => {
                let text = text_expr(self.api, prop(p, "text"));
                format!("{ind}if (player instanceof net.minecraft.server.level.ServerPlayer sp) sp.connection.disconnect(Component.literal({text}));\n") + &next(stack)
            }
            // ---- weitere Welt-Aktionen ----
            "break_block" => {
                let pos = if prop(p, "where") == "below" { "BlockPos.containing(x, y - 0.5, z)" } else { "BlockPos.containing(x, y, z)" };
                let drops = prop(p, "drops") != "false";
                format!("{ind}level.destroyBlock({pos}, {drops});\n") + &next(stack)
            }
            "gamerule" => {
                let rule = match prop(p, "rule") {
                    "keepInventory" | "doDaylightCycle" | "doWeatherCycle" | "mobGriefing" | "doMobSpawning" | "doFireTick" | "naturalRegeneration" | "doImmediateRespawn" | "showDeathMessages" | "doInsomnia" => prop(p, "rule"),
                    _ => "keepInventory",
                };
                let v = if prop(p, "value") == "false" { "false" } else { "true" };
                format!("{ind}anvilRun(level, null, x, y, z, \"gamerule {rule} {v}\");\n") + &next(stack)
            }
            "worldborder" => {
                let v = num(p, "size", 1000.0, 1.0, 59_999_968.0) as i64;
                format!("{ind}anvilRun(level, null, x, y, z, \"worldborder set {v}\");\n") + &next(stack)
            }
            "time_add" => {
                let v = num(p, "ticks", 1000.0, 1.0, 1_000_000.0) as i64;
                format!("{ind}anvilRun(level, null, x, y, z, \"time add {v}\");\n") + &next(stack)
            }
            "xp_orb" => {
                let v = num(p, "amount", 10.0, 1.0, 10000.0) as i64;
                format!("{ind}level.addFreshEntity(new net.minecraft.world.entity.ExperienceOrb(level, x, y + 0.5, z, {v}));\n") + &next(stack)
            }
            // ---- Block & Strom (dieser Block = Position des Ereignisses) ----
            "blk_energy_gen" => {
                let a = self.int_in(n, "amount", 20.0);
                format!("{ind}anvilBlkAdd(level, BlockPos.containing(x, y, z), {a});\n") + &next(stack)
            }
            "blk_energy_use" => {
                let a = self.int_in(n, "amount", 20.0);
                let ok = self.follow(&n.id, "ok", depth + 1, in_lambda, stack);
                let fail = self.follow(&n.id, "fail", depth + 1, in_lambda, stack);
                format!("{ind}if (anvilBlkEnergy(level, BlockPos.containing(x, y, z)) >= {a}) {{\n{ind}    anvilBlkTake(level, BlockPos.containing(x, y, z), {a});\n{ok}{ind}}} else {{\n{fail}{ind}}}\n") + &next(stack)
            }
            "blk_energy_push" => {
                let a = self.int_in(n, "amount", 100.0);
                let front = prop(p, "side") == "front";
                format!("{ind}anvilBlkPush(level, BlockPos.containing(x, y, z), {a}, {front});\n") + &next(stack)
            }
            "blk_lit" => {
                let v = self.pin(n, "value", "bool").unwrap_or_else(|| if prop(p, "value") == "false" { "false".into() } else { "true".into() });
                format!("{ind}anvilBlkLit(level, BlockPos.containing(x, y, z), {v});\n") + &next(stack)
            }
            "blk_signal" => {
                let v = self.int_in(n, "power", 15.0);
                format!("{ind}anvilBlkSignal(level, BlockPos.containing(x, y, z), {v});\n") + &next(stack)
            }
            "blk_var_set" => {
                let name = js(&var_name(prop(p, "name")));
                let v = self.num_in(n, "value", 0.0);
                let e = match prop(p, "op") {
                    "add" => format!("anvilBlkVar(level, BlockPos.containing(x, y, z), \"{name}\") + {v}"),
                    "sub" => format!("anvilBlkVar(level, BlockPos.containing(x, y, z), \"{name}\") - {v}"),
                    _ => v,
                };
                format!("{ind}anvilBlkSetVar(level, BlockPos.containing(x, y, z), \"{name}\", {e});\n") + &next(stack)
            }
            "blk_slot_take" => {
                let slot = self.int_in(n, "slot", 1.0);
                let count = self.int_in(n, "count", 1.0);
                let ok = self.follow(&n.id, "ok", depth + 1, in_lambda, stack);
                let fail = self.follow(&n.id, "fail", depth + 1, in_lambda, stack);
                format!("{ind}if (anvilBlkTakeSlot(level, BlockPos.containing(x, y, z), {slot} - 1, {count})) {{\n{ok}{ind}}} else {{\n{fail}{ind}}}\n") + &next(stack)
            }
            "blk_slot_put" => {
                let slot = self.int_in(n, "slot", 1.0);
                let count = self.int_in(n, "count", 1.0);
                let item = prop(p, "item");
                if !id_ok(item) {
                    return next(stack);
                }
                format!("{ind}anvilBlkPutSlot(level, BlockPos.containing(x, y, z), {slot} - 1, new ItemStack(anvilBpItem(\"{}\"), Math.max(1, {count})));\n", rid(self.api, item)) + &next(stack)
            }
            "log" => {
                let text = self.text_in(n, "text");
                format!("{ind}com.mojang.logging.LogUtils.getLogger().info(\"[Blueprint] \" + {text});\n") + &next(stack)
            }
            "energy_add" | "energy_take" => {
                let amount = num(p, "amount", 1000.0, 1.0, 2_000_000_000.0) as i64;
                let pos = if prop(p, "where") == "below" { "BlockPos.containing(x, y - 1, z)" } else { "BlockPos.containing(x, y, z)" };
                let f = if n.kind == "energy_add" { "anvilEnergyAdd" } else { "anvilEnergyTake" };
                format!("{ind}{f}(level, {pos}, {amount});\n") + &next(stack)
            }
            "open_gui" => {
                let g = var_name(prop(p, "gui"));
                if self.api.guis.iter().any(|x| x.id == g && crate::gui::valid(x)) {
                    format!("{ind}if (player instanceof net.minecraft.server.level.ServerPlayer anvilSp) anvilOpenGui(anvilSp, \"{g}\", null, null, BlockPos.containing(x, y, z), Component.literal(\"\"));\n") + &next(stack)
                } else {
                    next(stack)
                }
            }
            "close_gui" => format!("{ind}if (player instanceof net.minecraft.server.level.ServerPlayer anvilSp) anvilSp.closeContainer();\n") + &next(stack),
            // ---- mit Variablen ----
            "tp_var" => format!("{ind}anvilRun(level, {w}, x, y, z, \"tp @s \" + {v});\n", w = who(p), v = var_get(self.api, prop(p, "var"), "player")) + &next(stack),
            "give_var" => {
                let count = num(p, "count", 1.0, 1.0, 6400.0) as i64;
                format!("{ind}anvilRun(level, player, x, y, z, \"give @s \" + {v} + \" {count}\");\n", v = var_get(self.api, prop(p, "var"), "player")) + &next(stack)
            }
            "setblock_var" => {
                let pos = if prop(p, "at") == "var" { var_get(self.api, prop(p, "pos"), "player") } else if prop(p, "at") == "below" { "anvilPos(x, y - 1, z)".into() } else { "anvilPos(x, y, z)".into() };
                format!("{ind}anvilRun(level, null, x, y, z, \"setblock \" + {pos} + \" \" + {v});\n", v = var_get(self.api, prop(p, "var"), "player")) + &next(stack)
            }
            "summon_at_var" => {
                let e = prop(p, "entity");
                if id_ok(e) {
                    format!("{ind}anvilRun(level, null, x, y, z, \"summon {} \" + {});\n", js(&rid(self.api, e)), var_get(self.api, prop(p, "var"), "player")) + &next(stack)
                } else {
                    next(stack)
                }
            }
            "difficulty" => {
                let d = match prop(p, "difficulty") {
                    "peaceful" => "peaceful",
                    "easy" => "easy",
                    "hard" => "hard",
                    _ => "normal",
                };
                format!("{ind}anvilRun(level, null, x, y, z, \"difficulty {d}\");\n") + &next(stack)
            }
            // ---- Knoten aus Plugins (<plugin>:<kind>) ----
            k if k.contains(':') => {
                let Some(def) = crate::plugins::node_def(k) else { return next(stack) };
                let tpl = def["java"].as_str().unwrap_or("").to_string();
                let filled = plugin_defaults(n, &def);
                let n = &filled;
                let p = &n.props;
                let mut used_next = false;
                let modid = self.api.modid.clone();
                let body = crate::plugins::expand(&tpl, |ty, key| match ty {
                    "num" => Some(self.num_in(n, key, 0.0)),
                    "int" => Some(self.int_in(n, key, 0.0)),
                    "text" => Some(self.text_in(n, key)),
                    "bool" => Some(self.bool_in_d(n, key, 0)),
                    "ident" | "id" => crate::plugins::literal(ty, prop(p, key)),
                    "modid" => Some(modid.clone()),
                    "plugin" => Some(crate::plugins::java_pkg(&self.api.package, k.split(':').next().unwrap_or(""))),
                    "out" => {
                        if key == "next" {
                            used_next = true;
                        }
                        Some(self.follow(&n.id, key, depth + 1, in_lambda, stack))
                    }
                    _ => None,
                });
                match body {
                    Some(b) => {
                        let rest = if used_next { String::new() } else { self.follow(&n.id, "next", depth, in_lambda, stack) };
                        format!("{ind}{{\n{ind}    {}\n{ind}}}\n", b.trim().replace('\n', &format!("\n{ind}    "))) + &rest
                    }
                    None => next(stack),
                }
            }
            _ => next(stack),
        };
        stack.remove(&n.id);
        code
    }

    /// Verbundener Wert an Eingang `key` als Java-Ausdruck vom Typ `ty` (num | bool | text)
    fn pin(&self, n: &BpNode, key: &str, ty: &str) -> Option<String> {
        self.pin_d(n, key, ty, 0)
    }

    fn pin_d(&self, n: &BpNode, key: &str, ty: &str, depth: usize) -> Option<String> {
        let l = self.bp.links.iter().find(|l| l.to == n.id && l.pin == key)?;
        let src = self.nodes.get(l.from.as_str())?;
        if depth > 40 || !(src.kind.starts_with("val_") || crate::plugins::is_value_node(&src.kind)) {
            return None;
        }
        let (code, t) = self.value(src, depth + 1);
        Some(conv(&code, t, ty))
    }

    /// Eingang als Zahl: verbunden oder aus dem Feld
    fn num_in(&self, n: &BpNode, key: &str, def: f64) -> String {
        self.num_in_d(n, key, def, 0)
    }

    fn num_in_d(&self, n: &BpNode, key: &str, def: f64, depth: usize) -> String {
        self.pin_d(n, key, "num", depth).unwrap_or_else(|| format!("{:?}", num(&n.props, key, def, -1.0e12, 1.0e12)))
    }

    fn int_in(&self, n: &BpNode, key: &str, def: f64) -> String {
        format!("(int) Math.round({})", self.num_in(n, key, def))
    }

    fn text_in(&self, n: &BpNode, key: &str) -> String {
        self.pin(n, key, "text").unwrap_or_else(|| text_expr(self.api, prop(&n.props, key)))
    }

    fn bool_in_d(&self, n: &BpNode, key: &str, depth: usize) -> String {
        self.pin_d(n, key, "bool", depth).unwrap_or_else(|| if prop(&n.props, key) == "true" { "true".into() } else { "false".into() })
    }

    /// Werte-Knoten → (Java-Ausdruck, Typ)
    fn value(&self, n: &BpNode, d: usize) -> (String, &'static str) {
        let p = &n.props;
        let pos = "BlockPos.containing(x, y, z)";
        let a = || self.num_in_d(n, "a", 0.0, d);
        let b = || self.num_in_d(n, "b", 0.0, d);
        match n.kind.as_str() {
            "val_number" => (format!("{:?}", num(p, "value", 0.0, -1.0e12, 1.0e12)), "num"),
            "val_text" => (text_expr(self.api, prop(p, "value")), "text"),
            "val_bool" => ((if prop(p, "value") == "false" { "false" } else { "true" }).into(), "bool"),
            "val_math" => {
                let (a, b) = (a(), b());
                let e = match prop(p, "op") {
                    "sub" => format!("({a} - {b})"),
                    "mul" => format!("({a} * {b})"),
                    "div" => format!("(({b}) == 0 ? 0 : ({a}) / ({b}))"),
                    "min" => format!("Math.min({a}, {b})"),
                    "max" => format!("Math.max({a}, {b})"),
                    "mod" => format!("(({b}) == 0 ? 0 : ({a}) % ({b}))"),
                    "pow" => format!("Math.pow({a}, {b})"),
                    _ => format!("({a} + {b})"),
                };
                (e, "num")
            }
            "val_round" => {
                let v = self.num_in_d(n, "in", 0.0, d);
                let e = match prop(p, "mode") {
                    "floor" => format!("Math.floor({v})"),
                    "ceil" => format!("Math.ceil({v})"),
                    "abs" => format!("Math.abs({v})"),
                    _ => format!("Math.rint({v})"),
                };
                (e, "num")
            }
            "val_random" => {
                let (lo, hi) = (self.num_in_d(n, "min", 0.0, d), self.num_in_d(n, "max", 10.0, d));
                (format!("anvilRandom(level, {lo}, {hi})"), "num")
            }
            "val_compare" => {
                let (a, b) = (a(), b());
                let cmp = match prop(p, "cmp") {
                    "lt" => "<",
                    "le" => "<=",
                    "ge" => ">=",
                    "eq" => "==",
                    "ne" => "!=",
                    _ => ">",
                };
                (format!("({a} {cmp} {b})"), "bool")
            }
            "val_and" | "val_or" => {
                let (a, b) = (self.bool_in_d(n, "a", d), self.bool_in_d(n, "b", d));
                (format!("({a} {} {b})", if n.kind == "val_and" { "&&" } else { "||" }), "bool")
            }
            "val_not" => (format!("!({})", self.bool_in_d(n, "in", d)), "bool"),
            "val_join" => {
                let a = self.pin_d(n, "a", "text", d).unwrap_or_else(|| text_expr(self.api, prop(p, "a")));
                let b = self.pin_d(n, "b", "text", d).unwrap_or_else(|| text_expr(self.api, prop(p, "b")));
                (format!("({a} + {b})"), "text")
            }
            "val_var" => {
                let name = prop(p, "var");
                let (_, kind, _) = self.api.var_info(name, "player");
                match kind.as_str() {
                    "number" => (var_num(self.api, name, "player"), "num"),
                    "logic" => (format!("\"true\".equals({})", var_get(self.api, name, "player")), "bool"),
                    _ => (var_get(self.api, name, "player"), "text"),
                }
            }
            "val_game" => {
                let (e, is_num) = game_expr(self.api, prop(p, "game"));
                (e, if is_num { "num" } else { "text" })
            }
            "val_blk_energy" => (format!("anvilBlkEnergy(level, {pos})"), "num"),
            "val_blk_capacity" => (format!("anvilBlkCapacity(level, {pos})"), "num"),
            "val_blk_var" => (format!("anvilBlkVar(level, {pos}, \"{}\")", js(&var_name(prop(p, "name")))), "num"),
            "val_blk_slot_count" => (format!("anvilBlkSlot(level, {pos}, (int) Math.round({}) - 1).getCount()", self.num_in_d(n, "slot", 1.0, d)), "num"),
            "val_blk_slot_item" => (format!("BuiltInRegistries.ITEM.getKey(anvilBlkSlot(level, {pos}, (int) Math.round({}) - 1).getItem()).toString()", self.num_in_d(n, "slot", 1.0, d)), "text"),
            "val_blk_burn" => {
                let st = format!("anvilBlkSlot(level, {pos}, (int) Math.round({}) - 1)", self.num_in_d(n, "slot", 1.0, d));
                let e = if self.api.get_value { format!("anvilBurn(level, {st})") } else { format!("anvilBurn(level, {st})") };
                (e, "num")
            }
            "val_blk_light" => (format!("level.getMaxLocalRawBrightness({pos}.above())"), "num"),
            "val_blk_sky" => (format!("level.canSeeSky({pos}.above())"), "bool"),
            "val_blk_day" => ("anvilBlkIsDay(level)".into(), "bool"),
            "val_blk_rain" => ("level.isRaining()".into(), "bool"),
            "val_blk_redstone" => (format!("level.getBestNeighborSignal({pos})"), "num"),
            "val_blk_lit" => (format!("anvilBlkIsLit(level, {pos})"), "bool"),
            "val_sneaking" => ("(player != null && player.isShiftKeyDown())".into(), "bool"),
            k if k.contains(':') => {
                let Some(def) = crate::plugins::node_def(k) else { return ("0".into(), "num") };
                let filled = plugin_defaults(n, &def);
                let n = &filled;
                let p = &n.props;
                let ty: &'static str = match def["value"].as_str() {
                    Some("bool") => "bool",
                    Some("text") => "text",
                    _ => "num",
                };
                let modid = self.api.modid.clone();
                let e = crate::plugins::expand(def["expr"].as_str().unwrap_or("0"), |t, key| match t {
                    "num" => Some(self.num_in_d(n, key, 0.0, d)),
                    "int" => Some(format!("(int) Math.round({})", self.num_in_d(n, key, 0.0, d))),
                    "text" => Some(self.pin_d(n, key, "text", d).unwrap_or_else(|| text_expr(self.api, prop(p, key)))),
                    "bool" => Some(self.bool_in_d(n, key, d)),
                    "ident" | "id" => crate::plugins::literal(t, prop(p, key)),
                    "modid" => Some(modid.clone()),
                    "plugin" => Some(crate::plugins::java_pkg(&self.api.package, k.split(':').next().unwrap_or(""))),
                    _ => None,
                });
                match e {
                    Some(e) => (format!("({e})"), ty),
                    None => (if ty == "bool" { "false" } else if ty == "text" { "\"\"" } else { "0" }.into(), ty),
                }
            }
            _ => ("0".into(), "num"),
        }
    }

    /// Bedingung mit NICHT und optional einer zweiten (UND / ODER)
    fn full_condition(&self, p: &BTreeMap<String, String>) -> String {
        let one = |prefix: &str| -> String {
            let sub: BTreeMap<String, String> = p.iter().filter_map(|(k, v)| k.strip_prefix(prefix).map(|k| (k.to_string(), v.clone()))).collect();
            let c = self.condition(&sub);
            if prop(&sub, "not") == "not" { format!("!({c})") } else { format!("({c})") }
        };
        let a = one("");
        match prop(p, "join") {
            "and" => format!("{a} && {}", one("b_")),
            "or" => format!("{a} || {}", one("b_")),
            _ => a,
        }
    }

    fn condition(&self, p: &BTreeMap<String, String>) -> String {
        let v = prop(p, "value");
        match prop(p, "cond") {
            "sneaking" => "player != null && player.isShiftKeyDown()".into(),
            "raining" => "level.isRaining()".into(),
            "thundering" => "level.isThundering()".into(),
            "day" => "(level.getDayTime() % 24000L) < 12000L".into(),
            "night" => "(level.getDayTime() % 24000L) >= 12000L".into(),
            "creative" => "player != null && player.isCreative()".into(),
            "holding" if id_ok(v) => format!("player != null && player.getMainHandItem().is(anvilBpItem(\"{}\"))", rid(self.api, v)),
            "health_below" => format!("target != null && target.getHealth() < {:.1}f", num(p, "value", 10.0, 0.5, 1000.0)),
            "dimension" => match v {
                "nether" => "level.dimension() == Level.NETHER".into(),
                "end" => "level.dimension() == Level.END".into(),
                _ => "level.dimension() == Level.OVERWORLD".into(),
            },
            "block_below" if id_ok(v) => format!("level.getBlockState(BlockPos.containing(x, y - 0.5, z)).is(anvilBlock(\"{}\"))", rid(self.api, v)),
            "var" => {
                let name = prop(p, "var");
                let (_, kind, _) = self.api.var_info(name, prop(p, "scope"));
                match kind.as_str() {
                    "number" => {
                        let cmp = match prop(p, "cmp") {
                            "lt" => "<",
                            "eq" => "==",
                            "le" => "<=",
                            "ge" => ">=",
                            "ne" => "!=",
                            _ => ">",
                        };
                        format!("{} {cmp} {:?}", var_num(self.api, name, prop(p, "scope")), num(p, "value", 0.0, -1_000_000_000.0, 1_000_000_000.0))
                    }
                    "logic" => {
                        let want = if prop(p, "value") == "false" { "false" } else { "true" };
                        format!("\"{want}\".equals({})", var_get(self.api, name, "player"))
                    }
                    "text" => {
                        let g = var_get(self.api, name, "player");
                        let v = js(prop(p, "value"));
                        match prop(p, "cmp") {
                            "contains" => format!("{g}.toLowerCase().contains(\"{v}\".toLowerCase())"),
                            "ne" => format!("!{g}.equalsIgnoreCase(\"{v}\")"),
                            "empty" => format!("{g}.isEmpty()"),
                            _ => format!("{g}.equalsIgnoreCase(\"{v}\")"),
                        }
                    }
                    "item" | "block" => {
                        let g = var_get(self.api, name, "player");
                        let v = if id_ok(prop(p, "value")) { rid(self.api, prop(p, "value")) } else { "minecraft:air".into() };
                        if prop(p, "cmp") == "ne" { format!("!\"{v}\".equals({g})") } else { format!("\"{v}\".equals({g})") }
                    }
                    _ => {
                        let g = var_get(self.api, name, "player");
                        let v = js(prop(p, "value").trim());
                        if prop(p, "cmp") == "ne" { format!("!\"{v}\".equals({g})") } else { format!("\"{v}\".equals({g})") }
                    }
                }
            }
            "has_item" if id_ok(v) => format!("player != null && player.getInventory().countItem(anvilBpItem(\"{}\")) >= {}", rid(self.api, v), num(p, "count", 1.0, 1.0, 2304.0) as i64),
            "level_at_least" => format!("player != null && player.experienceLevel >= {}", num(p, "value", 5.0, 0.0, 100000.0) as i64),
            "in_water" => "target != null && target.isInWater()".into(),
            "on_fire" => "target != null && target.isOnFire()".into(),
            "is_player_target" => "target instanceof Player".into(),
            "players_online" => format!("level.getServer().getPlayerCount() >= {}", num(p, "value", 2.0, 0.0, 1000.0) as i64),
            "y_above" => format!("y > {}", num(p, "value", 64.0, -64.0, 320.0)),
            "y_below" => format!("y < {}", num(p, "value", 0.0, -64.0, 320.0)),
            "on_ground" => "target != null && target.onGround()".into(),
            "is_sprinting" => "player != null && player.isSprinting()".into(),
            "full_health" => "target != null && target.getHealth() >= target.getMaxHealth()".into(),
            "has_tag" => format!("target != null && target.getTags().contains(\"{}\")", var_name(v)),
            "biome" if id_ok(v) => format!("level.getBiome(BlockPos.containing(x, y, z)).is(ResourceLocation.parse(\"{}\"))", if v.contains(':') { v.to_string() } else { format!("minecraft:{v}") }),
            "dark" => format!("level.getMaxLocalRawBrightness(BlockPos.containing(x, y, z)) < {}", num(p, "value", 8.0, 0.0, 15.0) as i64),
            "entity_is" if id_ok(v) => format!("target != null && target.getType() == anvilEntity(\"{}\")", rid(self.api, v)),
            "flying" => "player != null && player.getAbilities().flying".into(),
            "is_baby" => "target != null && target.isBaby()".into(),
            "holding_any" => "player != null && !player.getMainHandItem().isEmpty()".into(),
            "energy_at_least" => format!("anvilEnergyAt(level, BlockPos.containing(x, y, z)) >= {}", num(p, "value", 1000.0, 0.0, 2_000_000_000.0) as i64),
            "block_in_tag" if id_ok(v.trim_start_matches('#')) => format!("level.getBlockState(BlockPos.containing(x, y - 0.5, z)).is(net.minecraft.tags.TagKey.create(Registries.BLOCK, ResourceLocation.parse(\"{}\")))", tag_ref(self.api, v)),
            "event_block_in_tag" if id_ok(v.trim_start_matches('#')) => format!("state != null && state.is(net.minecraft.tags.TagKey.create(Registries.BLOCK, ResourceLocation.parse(\"{}\")))", tag_ref(self.api, v)),
            "holding_tag" if id_ok(v.trim_start_matches('#')) => format!("player != null && player.getMainHandItem().is(net.minecraft.tags.TagKey.create(Registries.ITEM, ResourceLocation.parse(\"{}\")))", tag_ref(self.api, v)),
            "target_in_tag" if id_ok(v.trim_start_matches('#')) => format!("target != null && target.getType().is(net.minecraft.tags.TagKey.create(Registries.ENTITY_TYPE, ResourceLocation.parse(\"{}\")))", tag_ref(self.api, v)),
            "message_contains" => format!("message.toLowerCase().contains(\"{}\".toLowerCase())", js(v)),
            // Zufall in Prozent (Standard)
            _ => format!("level.getRandom().nextFloat() < {:.3}f", num(p, "value", 50.0, 0.0, 100.0) / 100.0),
        }
    }
}

/// Fehlende Eigenschaften eines Plugin-Knotens mit den Vorgaben aus dem Plugin füllen
fn plugin_defaults(n: &BpNode, def: &Value) -> BpNode {
    let mut out = n.clone();
    for pd in def["props"].as_array().cloned().unwrap_or_default() {
        if let Some(k) = pd["key"].as_str() {
            if !out.props.contains_key(k) {
                let v = match &pd["def"] {
                    Value::String(s) => s.clone(),
                    Value::Null => String::new(),
                    v => v.to_string(),
                };
                out.props.insert(k.to_string(), v);
            }
        }
    }
    out
}

/// Wert umwandeln: num (double) | bool | text (String)
fn conv(code: &str, from: &str, to: &str) -> String {
    match (from, to) {
        (a, b) if a == b => code.to_string(),
        ("num", "text") => format!("anvilFmt({code})"),
        ("bool", "text") => format!("String.valueOf({code})"),
        ("num", "bool") => format!("(({code}) != 0)"),
        ("bool", "num") => format!("(({code}) ? 1.0 : 0.0)"),
        ("text", "num") => format!("anvilParse({code})"),
        ("text", "bool") => format!("\"true\".equalsIgnoreCase({code})"),
        _ => code.to_string(),
    }
}

/// Kopf eines Ereignis-Handlers: legt level, player, target, x/y/z, state, stack, message an.
/// Rückgabe: (Ereignisklasse, Kopf, abbrechbar)
fn event_head(kind: &str) -> Option<(&'static str, &'static str, bool)> {
    const PLAYER_CTX: &str = "        final Player player = event.getEntity();\n        if (!(player.level() instanceof ServerLevel level)) return;\n        final LivingEntity target = player;\n        final double x = player.getX(), y = player.getY(), z = player.getZ();\n        final BlockState state = null;\n        final ItemStack stack = player.getMainHandItem();\n        final String message = \"\";\n";
    Some(match kind {
        "ev_join" => ("PlayerEvent.PlayerLoggedInEvent", PLAYER_CTX, false),
        "ev_respawn" => ("PlayerEvent.PlayerRespawnEvent", PLAYER_CTX, false),
        "ev_dimension" => ("PlayerEvent.PlayerChangedDimensionEvent", PLAYER_CTX, false),
        "ev_craft" => (
            "PlayerEvent.ItemCraftedEvent",
            "        final Player player = event.getEntity();\n        if (!(player.level() instanceof ServerLevel level)) return;\n        final LivingEntity target = player;\n        final double x = player.getX(), y = player.getY(), z = player.getZ();\n        final BlockState state = null;\n        final ItemStack stack = event.getCrafting();\n        final String message = \"\";\n",
            false,
        ),
        "ev_jump" => (
            "LivingEvent.LivingJumpEvent",
            "        if (!(event.getEntity() instanceof Player player) || !(player.level() instanceof ServerLevel level)) return;\n        final LivingEntity target = player;\n        final double x = player.getX(), y = player.getY(), z = player.getZ();\n        final BlockState state = null;\n        final ItemStack stack = player.getMainHandItem();\n        final String message = \"\";\n",
            false,
        ),
        "ev_chat" => (
            "ServerChatEvent",
            "        final Player player = event.getPlayer();\n        if (!(player.level() instanceof ServerLevel level)) return;\n        final LivingEntity target = player;\n        final double x = player.getX(), y = player.getY(), z = player.getZ();\n        final BlockState state = null;\n        final ItemStack stack = player.getMainHandItem();\n        final String message = event.getRawText();\n",
            true,
        ),
        "ev_click_block" => (
            "PlayerInteractEvent.RightClickBlock",
            "        if (event.getHand() != InteractionHand.MAIN_HAND || !(event.getLevel() instanceof ServerLevel level)) return;\n        final Player player = event.getEntity();\n        final LivingEntity target = player;\n        final BlockPos pos = event.getPos();\n        final double x = pos.getX() + 0.5, y = pos.getY() + 0.5, z = pos.getZ() + 0.5;\n        final BlockState state = level.getBlockState(pos);\n        final ItemStack stack = event.getItemStack();\n        final String message = \"\";\n",
            true,
        ),
        "ev_click_item" => (
            "PlayerInteractEvent.RightClickItem",
            "        if (!(event.getLevel() instanceof ServerLevel level)) return;\n        final Player player = event.getEntity();\n        final LivingEntity target = player;\n        final double x = player.getX(), y = player.getY(), z = player.getZ();\n        final BlockState state = null;\n        final ItemStack stack = event.getItemStack();\n        final String message = \"\";\n",
            true,
        ),
        "ev_break" => (
            "BlockEvent.BreakEvent",
            "        if (!(event.getLevel() instanceof ServerLevel level)) return;\n        final Player player = event.getPlayer();\n        final LivingEntity target = player;\n        final BlockPos pos = event.getPos();\n        final double x = pos.getX() + 0.5, y = pos.getY() + 0.5, z = pos.getZ() + 0.5;\n        final BlockState state = event.getState();\n        final ItemStack stack = player != null ? player.getMainHandItem() : ItemStack.EMPTY;\n        final String message = \"\";\n",
            true,
        ),
        "ev_place" => (
            "BlockEvent.EntityPlaceEvent",
            "        if (!(event.getLevel() instanceof ServerLevel level)) return;\n        final Player player = event.getEntity() instanceof Player p0 ? p0 : null;\n        final LivingEntity target = player;\n        final BlockPos pos = event.getPos();\n        final double x = pos.getX() + 0.5, y = pos.getY() + 0.5, z = pos.getZ() + 0.5;\n        final BlockState state = event.getPlacedBlock();\n        final ItemStack stack = player != null ? player.getMainHandItem() : ItemStack.EMPTY;\n        final String message = \"\";\n",
            true,
        ),
        "ev_use" => (
            "LivingEntityUseItemEvent.Finish",
            "        if (!(event.getEntity().level() instanceof ServerLevel level)) return;\n        final Player player = event.getEntity() instanceof Player p0 ? p0 : null;\n        final LivingEntity target = event.getEntity();\n        final double x = target.getX(), y = target.getY(), z = target.getZ();\n        final BlockState state = null;\n        final ItemStack stack = event.getItem();\n        final String message = \"\";\n",
            false,
        ),
        "ev_hurt" => (
            "LivingIncomingDamageEvent",
            "        final LivingEntity target = event.getEntity();\n        if (!(target.level() instanceof ServerLevel level)) return;\n        final Player player = event.getSource().getEntity() instanceof Player p0 ? p0 : null;\n        final double x = target.getX(), y = target.getY(), z = target.getZ();\n        final BlockState state = null;\n        final ItemStack stack = player != null ? player.getMainHandItem() : ItemStack.EMPTY;\n        final String message = \"\";\n",
            true,
        ),
        "ev_kill" => (
            "LivingDeathEvent",
            "        final LivingEntity target = event.getEntity();\n        if (!(target.level() instanceof ServerLevel level)) return;\n        final Player player = event.getSource().getEntity() instanceof Player p0 ? p0 : null;\n        final double x = target.getX(), y = target.getY(), z = target.getZ();\n        final BlockState state = null;\n        final ItemStack stack = player != null ? player.getMainHandItem() : ItemStack.EMPTY;\n        final String message = \"\";\n",
            false,
        ),
        "ev_click_entity" => (
            "PlayerInteractEvent.EntityInteract",
            "        if (event.getHand() != InteractionHand.MAIN_HAND || !(event.getLevel() instanceof ServerLevel level)) return;\n        final Player player = event.getEntity();\n        final LivingEntity target = event.getTarget() instanceof LivingEntity t0 ? t0 : null;\n        final double x = event.getTarget().getX(), y = event.getTarget().getY(), z = event.getTarget().getZ();\n        final BlockState state = null;\n        final ItemStack stack = event.getItemStack();\n        final String message = \"\";\n        final EntityType<?> targetType = event.getTarget().getType();\n",
            true,
        ),
        "ev_left_click_block" => (
            "PlayerInteractEvent.LeftClickBlock",
            "        if (!(event.getLevel() instanceof ServerLevel level)) return;\n        final Player player = event.getEntity();\n        final LivingEntity target = player;\n        final BlockPos pos = event.getPos();\n        final double x = pos.getX() + 0.5, y = pos.getY() + 0.5, z = pos.getZ() + 0.5;\n        final BlockState state = level.getBlockState(pos);\n        final ItemStack stack = event.getItemStack();\n        final String message = \"\";\n",
            true,
        ),
        "ev_player_death" => (
            "LivingDeathEvent",
            "        if (!(event.getEntity() instanceof Player player) || !(player.level() instanceof ServerLevel level)) return;\n        final LivingEntity target = player;\n        final double x = player.getX(), y = player.getY(), z = player.getZ();\n        final BlockState state = null;\n        final ItemStack stack = player.getMainHandItem();\n        final String message = \"\";\n",
            false,
        ),
        "ev_leave" => ("PlayerEvent.PlayerLoggedOutEvent", PLAYER_CTX, false),
        "ev_toss" => (
            "net.neoforged.neoforge.event.entity.item.ItemTossEvent",
            "        final Player player = event.getPlayer();\n        if (!(player.level() instanceof ServerLevel level)) return;\n        final LivingEntity target = player;\n        final double x = player.getX(), y = player.getY(), z = player.getZ();\n        final BlockState state = null;\n        final ItemStack stack = event.getEntity().getItem();\n        final String message = \"\";\n",
            true,
        ),
        "ev_player_hurt" => (
            "LivingIncomingDamageEvent",
            "        if (!(event.getEntity() instanceof Player player) || !(player.level() instanceof ServerLevel level)) return;\n        final LivingEntity target = event.getSource().getEntity() instanceof LivingEntity a0 ? a0 : player;\n        final double x = player.getX(), y = player.getY(), z = player.getZ();\n        final BlockState state = null;\n        final ItemStack stack = player.getMainHandItem();\n        final String message = \"\";\n",
            true,
        ),
        "ev_fish" => (
            "net.neoforged.neoforge.event.entity.player.ItemFishedEvent",
            "        final Player player = event.getEntity();\n        if (!(player.level() instanceof ServerLevel level)) return;\n        final LivingEntity target = player;\n        final double x = player.getX(), y = player.getY(), z = player.getZ();\n        final BlockState state = null;\n        final ItemStack stack = event.getDrops().isEmpty() ? ItemStack.EMPTY : event.getDrops().get(0);\n        final String message = \"\";\n",
            true,
        ),
        "ev_pickup" => (
            "ItemEntityPickupEvent.Post",
            "        final Player player = event.getPlayer();\n        if (!(player.level() instanceof ServerLevel level)) return;\n        final LivingEntity target = player;\n        final double x = player.getX(), y = player.getY(), z = player.getZ();\n        final BlockState state = null;\n        final ItemStack stack = event.getOriginalStack();\n        final String message = \"\";\n",
            false,
        ),
        "ev_level_up" => (
            "PlayerXpEvent.LevelChange",
            "        final Player player = event.getEntity();\n        if (event.getLevels() <= 0 || !(player.level() instanceof ServerLevel level)) return;\n        final LivingEntity target = player;\n        final double x = player.getX(), y = player.getY(), z = player.getZ();\n        final BlockState state = null;\n        final ItemStack stack = player.getMainHandItem();\n        final String message = \"\";\n",
            false,
        ),
        _ => return None,
    })
}

/// Filter des Ereignisknotens (welcher Block/welches Item/welche Kreatur)
fn event_filter(api: &BpApi, n: &BpNode) -> Option<String> {
    let t = prop(&n.props, "target");
    if !id_ok(t) {
        return None;
    }
    let t = rid(api, t);
    Some(match n.kind.as_str() {
        "ev_click_block" | "ev_break" | "ev_place" | "ev_left_click_block" => format!("state != null && state.is(anvilBlock(\"{t}\"))"),
        "ev_click_item" | "ev_use" | "ev_craft" | "ev_pickup" | "ev_toss" => format!("stack.is(anvilBpItem(\"{t}\"))"),
        "ev_click_entity" => format!("targetType == anvilEntity(\"{t}\")"),
        "ev_hurt" | "ev_kill" => format!("target.getType() == anvilEntity(\"{t}\")"),
        _ => return None,
    })
}

/// Erzeugt (Importe, Aufrufe in register(), Methoden) für alle Blueprints.
pub fn generate(blueprints: &[Blueprint], api: &BpApi) -> (Vec<&'static str>, String, String) {
    let active: Vec<&Blueprint> = blueprints.iter().filter(|b| b.enabled && !b.nodes.is_empty()).collect();
    let guis: Vec<&crate::gui::GuiDef> = api.guis.iter().filter(|g| crate::gui::valid(g)).collect();
    if active.is_empty() && guis.is_empty() {
        return (vec![], String::new(), String::new());
    }
    let imports = vec![
        "net.minecraft.commands.CommandSourceStack",
        "net.minecraft.core.BlockPos",
        "net.minecraft.core.registries.BuiltInRegistries",
        "net.minecraft.server.MinecraftServer",
        "net.minecraft.server.level.ServerLevel",
        "net.minecraft.world.InteractionHand",
        "net.minecraft.world.entity.Entity",
        "net.minecraft.world.entity.EntityType",
        "net.minecraft.world.entity.LivingEntity",
        "net.minecraft.world.entity.player.Player",
        "net.minecraft.world.level.Level",
        "net.minecraft.world.level.block.state.BlockState",
        "net.minecraft.world.phys.Vec3",
        "net.neoforged.neoforge.common.NeoForge",
        "net.neoforged.neoforge.event.ServerChatEvent",
        "net.neoforged.neoforge.event.entity.living.LivingDeathEvent",
        "net.neoforged.neoforge.event.entity.living.LivingEntityUseItemEvent",
        "net.neoforged.neoforge.event.entity.living.LivingEvent",
        "net.neoforged.neoforge.event.entity.living.LivingIncomingDamageEvent",
        "net.neoforged.neoforge.event.entity.player.PlayerEvent",
        "net.neoforged.neoforge.event.entity.player.PlayerInteractEvent",
        "net.neoforged.neoforge.event.entity.player.ItemEntityPickupEvent",
        "net.neoforged.neoforge.event.entity.player.PlayerXpEvent",
        "net.minecraft.world.scores.Objective",
        "net.minecraft.resources.ResourceKey",
        "net.minecraft.core.registries.Registries",
        "net.minecraft.world.level.levelgen.Heightmap",
        "net.minecraft.world.scores.ScoreHolder",
        "net.minecraft.world.scores.Scoreboard",
        "net.minecraft.world.scores.criteria.ObjectiveCriteria",
        "net.neoforged.neoforge.event.level.BlockEvent",
        "net.neoforged.neoforge.event.tick.ServerTickEvent",
        "net.neoforged.neoforge.event.server.ServerStartedEvent",
    ];
    let mut calls = String::from("        NeoForge.EVENT_BUS.addListener(AnvilContent::anvilTick);\n        NeoForge.EVENT_BUS.addListener(AnvilContent::anvilVarsLoad);\n        NeoForge.EVENT_BUS.addListener(AnvilContent::anvilVarsStop);\n        NeoForge.EVENT_BUS.addListener(AnvilContent::anvilVarsClone);\n");
    let mut methods = String::new();
    let mut timers = String::new();
    let mut starts = String::new();
    let get = if api.get_value { "getValue" } else { "get" };
    let burn = if api.get_value { "level.fuelValues().burnDuration(stack)" } else { "stack.getBurnTime(net.minecraft.world.item.crafting.RecipeType.SMELTING)" };
    let mut hooks: BTreeMap<String, Vec<String>> = BTreeMap::new();
    let mut plugin_events: BTreeMap<String, Vec<String>> = BTreeMap::new();

    // Hilfsfunktionen
    methods.push_str(&format!(
        r##"
    // ---- Blueprints ----
    private record AnvilTask(long at, Runnable run) {{}}
    private static final java.util.List<AnvilTask> ANVIL_TASKS = new java.util.ArrayList<>();

    private static void anvilLater(ServerLevel level, long ticks, Runnable run) {{
        ANVIL_TASKS.add(new AnvilTask(level.getServer().getTickCount() + ticks, run));
    }}

    private static void anvilRun(ServerLevel level, Entity who, double x, double y, double z, String command) {{
        CommandSourceStack source = level.getServer().createCommandSourceStack().withLevel(level).withPosition(new Vec3(x, y, z)).withPermission(4).withSuppressedOutput();
        if (who != null) source = source.withEntity(who).withPosition(who.position());
        level.getServer().getCommands().performPrefixedCommand(source, command);
    }}

    private static net.minecraft.world.level.block.Block anvilBlock(String id) {{
        return BuiltInRegistries.BLOCK.{get}(ResourceLocation.parse(id));
    }}

    private static EntityType<?> anvilEntity(String id) {{
        return BuiltInRegistries.ENTITY_TYPE.{get}(ResourceLocation.parse(id));
    }}

    /** In eine Dimension reisen (sicher auf der Oberfläche landen); back = schon dort → zurück in die Oberwelt */
    private static void anvilTravel(ServerLevel level, Player player, String dim, boolean back) {{
        ResourceKey<Level> key = ResourceKey.create(Registries.DIMENSION, ResourceLocation.parse(dim));
        if (back && level.dimension() == key) key = Level.OVERWORLD;
        ServerLevel to = level.getServer().getLevel(key);
        if (to == null) return;
        int bx = (int) Math.floor(player.getX()), bz = (int) Math.floor(player.getZ());
        if (key == Level.END) {{ bx = 100; bz = 0; }}
        // Sicher ankommen: nie im Boden, nie ins Leere (Einstellungen im Tab „Anreise“)
        BlockPos at = anvilArrive(to, bx, bz);
        anvilRun(level, player, player.getX(), player.getY(), player.getZ(), "execute in " + key.location() + " run tp @s " + (at.getX() + 0.5) + " " + at.getY() + " " + (at.getZ() + 0.5));
    }}

    private static Objective anvilObj(ServerLevel level, String name) {{
        Scoreboard board = level.getServer().getScoreboard();
        Objective o = board.getObjective("anv_" + name);
        if (o == null) o = board.addObjective("anv_" + name, ObjectiveCriteria.DUMMY, Component.literal(name), ObjectiveCriteria.RenderType.INTEGER, true, null);
        return o;
    }}

    private static ScoreHolder anvilHolder(Entity who) {{
        return who != null ? who : ScoreHolder.forNameOnly("#global");
    }}

    // ---- Variablen (Variablen-Tab): Welt + Spieler in <Welt>/data/MODID_variables.json, Sitzung im Speicher ----
    private static final java.util.Map<String, String> ANVIL_VARS = new java.util.concurrent.ConcurrentHashMap<>();
    private static final java.util.Map<String, String> ANVIL_SESSION = new java.util.concurrent.ConcurrentHashMap<>();
    private static boolean anvilVarsDirty = false;

    private static String anvilKey(Entity who, String scope, String name) {{
        return switch (scope) {{
            case "p" -> who == null ? null : "p:" + who.getStringUUID() + ":" + name;
            case "l" -> who == null ? null : "l:" + who.getStringUUID() + ":" + name;
            default -> "w:" + name;
        }};
    }}

    private static String anvilVar(ServerLevel level, Entity who, String scope, String name, String def) {{
        if (scope.equals("s")) return ANVIL_SESSION.getOrDefault(name, def);
        String k = anvilKey(who, scope, name);
        return k == null ? def : ANVIL_VARS.getOrDefault(k, def);
    }}

    private static double anvilParse(String s) {{
        try {{ return Double.parseDouble(s.trim().replace(',', '.')); }} catch (Exception e) {{ return 0; }}
    }}

    private static double anvilNum(ServerLevel level, Entity who, String scope, String name, double def) {{
        String v = anvilVar(level, who, scope, name, null);
        return v == null ? def : anvilParse(v);
    }}

    private static String anvilFmt(double v) {{
        return v == Math.rint(v) && Math.abs(v) < 1.0E15 ? String.valueOf((long) v) : String.valueOf(v);
    }}

    private static String anvilPos(double x, double y, double z) {{
        return anvilFmt(Math.floor(x) + 0.5) + " " + anvilFmt(Math.floor(y)) + " " + anvilFmt(Math.floor(z) + 0.5);
    }}

    private static void anvilPut(ServerLevel level, Entity who, String scope, String name, String value) {{
        if (value == null) value = "";
        if (scope.equals("s")) ANVIL_SESSION.put(name, value);
        else {{
            String k = anvilKey(who, scope, name);
            if (k == null) return;
            ANVIL_VARS.put(k, value);
            anvilVarsDirty = true;
        }}
        // Anzeige am Rand mitziehen
        Objective o = level.getServer().getScoreboard().getObjective("anv_" + name);
        if (o != null) {{
            ScoreHolder h = (scope.equals("p") || scope.equals("l")) && who != null ? who : ScoreHolder.forNameOnly("Welt");
            level.getServer().getScoreboard().getOrCreatePlayerScore(h, o).set((int) Math.round(anvilParse(value)));
        }}
    }}

    private static void anvilPutNum(ServerLevel level, Entity who, String scope, String name, double value) {{
        anvilPut(level, who, scope, name, anvilFmt(value));
    }}

    /** Aktuelle Werte in die Anzeige am Rand schreiben */
    private static void anvilShow(ServerLevel level, String scope, String name, String def) {{
        Objective o = anvilObj(level, name);
        if (scope.equals("p") || scope.equals("l")) {{
            for (Player p : level.getServer().getPlayerList().getPlayers())
                level.getServer().getScoreboard().getOrCreatePlayerScore(p, o).set((int) Math.round(anvilParse(anvilVar(level, p, scope, name, def))));
        }} else level.getServer().getScoreboard().getOrCreatePlayerScore(ScoreHolder.forNameOnly("Welt"), o).set((int) Math.round(anvilParse(anvilVar(level, null, scope, name, def))));
    }}

    private static java.nio.file.Path anvilVarFile(MinecraftServer server) {{
        return server.getWorldPath(net.minecraft.world.level.storage.LevelResource.ROOT).resolve("data").resolve("ANVIL_MODID_variables.json");
    }}

    private static void anvilVarsLoad(ServerStartedEvent event) {{
        ANVIL_VARS.clear();
        ANVIL_SESSION.clear();
        try {{
            java.nio.file.Path f = anvilVarFile(event.getServer());
            if (java.nio.file.Files.exists(f)) {{
                com.google.gson.JsonObject o = com.google.gson.JsonParser.parseString(java.nio.file.Files.readString(f)).getAsJsonObject();
                for (var e : o.entrySet()) ANVIL_VARS.put(e.getKey(), e.getValue().getAsString());
            }}
        }} catch (Exception e) {{
            com.mojang.logging.LogUtils.getLogger().warn("Variablen konnten nicht geladen werden", e);
        }}
    }}

    private static void anvilVarsSave(MinecraftServer server) {{
        if (!anvilVarsDirty) return;
        try {{
            com.google.gson.JsonObject o = new com.google.gson.JsonObject();
            ANVIL_VARS.forEach(o::addProperty);
            java.nio.file.Path f = anvilVarFile(server);
            java.nio.file.Files.createDirectories(f.getParent());
            java.nio.file.Files.writeString(f, o.toString());
            anvilVarsDirty = false;
        }} catch (Exception e) {{
            com.mojang.logging.LogUtils.getLogger().warn("Variablen konnten nicht gespeichert werden", e);
        }}
    }}

    private static void anvilVarsStop(net.neoforged.neoforge.event.server.ServerStoppingEvent event) {{
        anvilVarsSave(event.getServer());
    }}

    /** „Spieler (bis zum Tod)“ beim Sterben zurücksetzen */
    private static void anvilVarsClone(PlayerEvent.Clone event) {{
        if (!event.isWasDeath()) return;
        String prefix = "l:" + event.getOriginal().getStringUUID() + ":";
        if (ANVIL_VARS.keySet().removeIf(k -> k.startsWith(prefix))) anvilVarsDirty = true;
    }}

    private static Item anvilBpItem(String id) {{
        return BuiltInRegistries.ITEM.{get}(ResourceLocation.parse(id));
    }}

    private static double anvilRandom(ServerLevel level, double lo, double hi) {{
        return lo + level.getRandom().nextDouble() * (hi - lo);
    }}

    /** Brennwert eines Items in Ticks (0 = brennt nicht) */
    private static int anvilBurn(ServerLevel level, ItemStack stack) {{
        return stack.isEmpty() ? 0 : {burn};
    }}
"##
    ));

    methods = methods.replace("ANVIL_MODID", &api.modid);
    let extra = RefCell::new(String::new());
    let seq = Cell::new(0usize);
    let mut functions: BTreeMap<String, String> = BTreeMap::new();
    let mut counter = 0;
    for bp in &active {
        let gen = Gen { api, bp, nodes: bp.nodes.iter().map(|n| (n.id.as_str(), n)).collect(), cancellable: false, extra: &extra, seq: &seq };
        for n in bp.nodes.iter().filter(|n| EVENT_KINDS.contains(&n.kind.as_str()) || crate::plugins::is_event_node(&n.kind)) {
            counter += 1;
            let mut stack = HashSet::new();
            match n.kind.as_str() {
                "ev_timer" => {
                    let ticks = (num(&n.props, "seconds", 10.0, 1.0, 86400.0) * 20.0).round() as i64;
                    let body = gen.follow(&n.id, "next", 1, false, &mut stack);
                    timers.push_str(&format!(
                        "        if (now % {ticks}L == 0) {{\n            for (Player player : server.getPlayerList().getPlayers()) {{\n                if (!(player.level() instanceof ServerLevel level)) continue;\n                final LivingEntity target = player;\n                final double x = player.getX(), y = player.getY(), z = player.getZ();\n                final BlockState state = null;\n                final ItemStack stack = player.getMainHandItem();\n                final String message = \"\";\n{body}            }}\n        }}\n"
                    ));
                }
                "ev_function" => {
                    let body = gen.follow(&n.id, "next", 1, true, &mut stack);
                    functions.entry(fn_name(prop(&n.props, "fn"))).or_default().push_str(&body);
                }
                "ev_command" => {
                    let name: String = prop(&n.props, "command").trim_start_matches('/').to_lowercase().chars().filter(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || *c == '_').collect();
                    if name.is_empty() {
                        continue;
                    }
                    let body = gen.follow(&n.id, "next", 0, true, &mut stack);
                    let method = format!("anvilBp{counter}");
                    calls.push_str(&format!("        NeoForge.EVENT_BUS.addListener(AnvilContent::{method});\n"));
                    methods.push_str(&format!(
                        "\n    private static void {method}(net.neoforged.neoforge.event.RegisterCommandsEvent event) {{\n        event.getDispatcher().register(net.minecraft.commands.Commands.literal(\"{name}\").executes(ctx -> {{ {method}Run(ctx.getSource()); return 1; }}));\n    }}\n\n    private static void {method}Run(CommandSourceStack source) {{\n        final ServerLevel level = source.getLevel();\n        final Player player = source.getPlayer();\n        final LivingEntity target = player;\n        final double x = source.getPosition().x, y = source.getPosition().y, z = source.getPosition().z;\n        final BlockState state = null;\n        final ItemStack stack = player != null ? player.getMainHandItem() : ItemStack.EMPTY;\n        final String message = \"\";\n{body}    }}\n"
                    ));
                }
                "ev_block_tick" | "ev_block_use" | "ev_block_redstone" => {
                    let body = gen.follow(&n.id, "next", 1, false, &mut stack);
                    let t = prop(&n.props, "target");
                    let key = if id_ok(t) { t.rsplit(':').next().unwrap_or(t).to_string() } else { "*".to_string() };
                    let method = format!("anvilBh{counter}");
                    methods.push_str(&format!(
                        "\n    private static void {method}(ServerLevel level, BlockPos bpos, Player player) {{\n        final LivingEntity target = player;\n        final double x = bpos.getX() + 0.5, y = bpos.getY() + 0.5, z = bpos.getZ() + 0.5;\n        final BlockState state = level.getBlockState(bpos);\n        final ItemStack stack = player != null ? player.getMainHandItem() : ItemStack.EMPTY;\n        final String message = \"\";\n{body}    }}\n"
                    ));
                    hooks.entry(format!("{}|{key}", &n.kind[9..])).or_default().push(method);
                }
                "ev_start" => {
                    let body = gen.follow(&n.id, "next", 1, false, &mut stack);
                    starts.push_str(&format!(
                        "        {{\n            final ServerLevel level = event.getServer().overworld();\n            final Player player = null;\n            final LivingEntity target = null;\n            final double x = 0, y = level.getSeaLevel(), z = 0;\n            final BlockState state = null;\n            final ItemStack stack = ItemStack.EMPTY;\n            final String message = \"\";\n{body}        }}\n"
                    ));
                }
                kind if kind.contains(':') => {
                    // Ereignis aus einem Plugin: der Plugin-Code ruft anvilPluginEvent(kind, level, player, message) auf
                    let def = crate::plugins::node_def(kind).unwrap_or_default();
                    let filled = plugin_defaults(n, &def);
                    let body = gen.follow(&n.id, "next", 1, false, &mut stack);
                    let filter = match def["filter"].as_str() {
                        Some(key) if !prop(&filled.props, key).trim().is_empty() => format!("        if (!\"{}\".equals(message)) return;\n", js(prop(&filled.props, key).trim())),
                        _ => String::new(),
                    };
                    let method = format!("anvilPe{counter}");
                    methods.push_str(&format!(
                        "\n    private static void {method}(ServerLevel level, Player player, String message) {{\n{filter}        final LivingEntity target = player;\n        final double x = player != null ? player.getX() : 0, y = player != null ? player.getY() : 0, z = player != null ? player.getZ() : 0;\n        final BlockState state = null;\n        final ItemStack stack = player != null ? player.getMainHandItem() : ItemStack.EMPTY;\n{body}    }}\n"
                    ));
                    plugin_events.entry(kind.to_string()).or_default().push(method);
                }
                kind => {
                    let Some((class, head, cancellable)) = event_head(kind) else { continue };
                    let g = Gen { api, bp, nodes: gen.nodes.clone(), cancellable, extra: &extra, seq: &seq };
                    let body = g.follow(&n.id, "next", 0, false, &mut stack);
                    let body = match event_filter(api, n) {
                        Some(f) => format!("        if (!({f})) return;\n{body}"),
                        None => body,
                    };
                    let method = format!("anvilBp{counter}");
                    calls.push_str(&format!("        NeoForge.EVENT_BUS.addListener(AnvilContent::{method});\n"));
                    methods.push_str(&format!("\n    private static void {method}({class} event) {{\n{head}{body}    }}\n"));
                }
            }
        }
    }
    // eigene Funktionen (auch leere, wenn nur aufgerufen)
    for bp in &active {
        for n in bp.nodes.iter().filter(|n| n.kind == "call") {
            functions.entry(fn_name(prop(&n.props, "fn"))).or_default();
        }
    }
    // Oberflächen: Knöpfe rufen Funktionen auf, Schalter und Anzeigen lesen Variablen
    if !guis.is_empty() {
        let mut clicks = String::new();
        let mut values = String::new();
        for g in &guis {
            for (i, e) in g.elements.iter().enumerate() {
                match e.kind.as_str() {
                    "button" if !e.action.trim().is_empty() => {
                        let f = fn_name(&e.action);
                        functions.entry(f.clone()).or_default();
                        clicks.push_str(&format!("            case \"{}#{i}\" -> anvilFn_{f}(level, player, target, x, y, z, state, stack, message);\n", g.id));
                    }
                    "switch" if !e.var.trim().is_empty() => {
                        let cur = var_get(api, &e.var, "player");
                        let put = var_put(api, "", &e.var, "player", &format!("String.valueOf(!\"true\".equals({cur}))"), false);
                        clicks.push_str(&format!("            case \"{}#{i}\" -> {{ {} }}\n", g.id, put.trim()));
                    }
                    _ => {}
                }
            }
            for (k, (_, e)) in crate::gui::var_elements(g).iter().enumerate() {
                let (_, kind, _) = api.var_info(&e.var, "player");
                let expr = match kind.as_str() {
                    "number" => format!("(int) Math.round({})", var_num(api, &e.var, "player")),
                    "logic" => format!("\"true\".equals({}) ? 1 : 0", var_get(api, &e.var, "player")),
                    _ => format!("(int) Math.round(anvilParse({}))", var_get(api, &e.var, "player")),
                };
                values.push_str(&format!("            case \"{}#{k}\" -> {expr};\n", g.id));
            }
        }
        methods.push_str(&format!(
            "\n    static void anvilGuiClick(net.minecraft.server.level.ServerPlayer sp, String key, int el, BlockPos pos) {{\n        if (!(sp.level() instanceof ServerLevel level)) return;\n        final Player player = sp;\n        final LivingEntity target = sp;\n        final double x = pos.getX() + 0.5, y = pos.getY() + 0.5, z = pos.getZ() + 0.5;\n        final BlockState state = level.getBlockState(pos);\n        final ItemStack stack = sp.getMainHandItem();\n        final String message = \"\";\n        switch (key + \"#\" + el) {{\n{clicks}            default -> {{}}\n        }}\n    }}\n\n    static int anvilGuiValue(ServerLevel level, Player player, String key, int k) {{\n        return switch (key + \"#\" + k) {{\n{values}            default -> 0;\n        }};\n    }}\n"
        ));
    }
    for (name, body) in &functions {
        methods.push_str(&format!("\n    private static void anvilFn_{name}({BODY_PARAMS}) {{\n{body}    }}\n"));
    }
    methods.push_str(&extra.into_inner());
    // Hilfsfunktionen aus Plugins (je Plugin-Knoten einmal)
    {
        let mut seen = HashSet::new();
        for n in active.iter().flat_map(|b| b.nodes.iter()).filter(|n| n.kind.contains(':')) {
            if seen.insert(n.kind.clone()) {
                if let Some(m) = crate::plugins::node_def(&n.kind).and_then(|d| d["methods"].as_str().map(String::from)) {
                    methods.push_str(&format!("\n    // Plugin: {}\n    {}\n", n.kind, m.trim().replace('\n', "\n    ")));
                }
            }
        }
    }
    // Block-Ereignisse (Tick, Rechtsklick, Redstone) – aufgerufen von Blöcken mit Fähigkeiten
    {
        let mut cases = String::new();
        for (k, list) in &hooks {
            let calls_: String = list.iter().map(|m| format!("{m}(level, pos, player); ")).collect();
            cases.push_str(&format!("            case \"{}\" -> {{ {calls_}h = true; }}\n", js(k)));
        }
        methods.push_str(&format!(
            "\n    static boolean anvilBlockHook(String kind, String block, ServerLevel level, BlockPos pos, Player player) {{\n        boolean h = false;\n        for (String k : new String[] {{ kind + \"|\" + block, kind + \"|*\" }}) {{\n            switch (k) {{\n{cases}                default -> {{}}\n            }}\n        }}\n        return h;\n    }}\n"
        ));
    }
    // Plugin-Ereignisse
    {
        let mut cases = String::new();
        for (k, list) in &plugin_events {
            let c: String = list.iter().map(|m| format!("{m}(level, player, message); ")).collect();
            cases.push_str(&format!("            case \"{}\" -> {{ {c}}}\n", js(k)));
        }
        methods.push_str(&format!(
            "\n    public static void anvilPluginEvent(String kind, ServerLevel level, Player player, String message) {{\n        if (level == null) return;\n        switch (kind) {{\n{cases}            default -> {{}}\n        }}\n    }}\n"
        ));
    }
    if !starts.is_empty() {
        calls.push_str("        NeoForge.EVENT_BUS.addListener(AnvilContent::anvilStarted);\n");
        methods.push_str(&format!("\n    private static void anvilStarted(ServerStartedEvent event) {{\n{starts}    }}\n"));
    }
    methods.push_str(&format!(
        "\n    private static void anvilTick(ServerTickEvent.Post event) {{\n        MinecraftServer server = event.getServer();\n        long now = server.getTickCount();\n        if (now % 1200L == 0) anvilVarsSave(server);\n        if (!ANVIL_TASKS.isEmpty()) {{\n            java.util.List<AnvilTask> due = new java.util.ArrayList<>();\n            ANVIL_TASKS.removeIf(t -> {{ if (t.at() <= now) {{ due.add(t); return true; }} return false; }});\n            due.forEach(t -> t.run().run());\n        }}\n{timers}    }}\n"
    ));
    (imports, calls, methods)
}
