//! Blueprints: Knoten-Graphen (Ereignis → Bedingungen → Aktionen), aus denen
//! Java-Code für NeoForge erzeugt wird. Viele Aktionen laufen über Minecraft-
//! Befehle – deren Syntax ist über die Versionen 1.21.x stabil.

use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashSet};

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct Blueprint {
    pub name: String,
    pub enabled: bool,
    pub nodes: Vec<BpNode>,
    pub links: Vec<BpLink>,
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
}

/// Versionsunterschiede, die der Generator kennt
pub struct BpApi {
    /// ab 1.21.2: Registry#getValue statt #get
    pub get_value: bool,
    pub modid: String,
    /// eigene Block-/Item-/Kreatur-IDs (ohne Namensraum)
    pub own: HashSet<String>,
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
fn text_expr(s: &str) -> String {
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
            Some(format!("anvilGet(level, player, \"{}\")", var_name(v)))
        } else if let Some(v) = token.strip_prefix("global:") {
            Some(format!("anvilGet(level, null, \"{}\")", var_name(v)))
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

pub const EVENT_KINDS: [&str; 21] = [
    "ev_join", "ev_respawn", "ev_dimension", "ev_timer", "ev_click_block", "ev_click_item", "ev_break", "ev_place", "ev_use", "ev_hurt", "ev_kill",
    "ev_jump", "ev_chat", "ev_craft", "ev_start", "ev_click_entity", "ev_player_death", "ev_leave", "ev_pickup", "ev_level_up", "ev_left_click_block",
];

struct Gen<'a> {
    api: &'a BpApi,
    bp: &'a Blueprint,
    nodes: BTreeMap<&'a str, &'a BpNode>,
    cancellable: bool,
}

impl<'a> Gen<'a> {
    /// Code für alle Knoten, die an Ausgang `out` von `from` hängen
    fn follow(&self, from: &str, out: &str, depth: usize, in_lambda: bool, stack: &mut HashSet<String>) -> String {
        let mut links: Vec<&BpLink> = self.bp.links.iter().filter(|l| l.from == from && l.out == out).collect();
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
        if depth > 48 || stack.contains(&n.id) || EVENT_KINDS.contains(&n.kind.as_str()) {
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
                let cond = self.condition(p);
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
            "cancel" => {
                let c = if self.cancellable && !in_lambda { format!("{ind}event.setCanceled(true);\n") } else { String::new() };
                c + &next(stack)
            }
            // ---- Aktionen ----
            "message" => {
                let text = text_expr(prop(p, "text"));
                let c = if prop(p, "to") == "all" {
                    format!("{ind}level.getServer().getPlayerList().broadcastSystemMessage(Component.literal({text}), false);\n")
                } else {
                    format!("{ind}if (player != null) player.displayClientMessage(Component.literal({text}), false);\n")
                };
                c + &next(stack)
            }
            "actionbar" => {
                format!("{ind}if (player != null) player.displayClientMessage(Component.literal({}), true);\n", text_expr(prop(p, "text"))) + &next(stack)
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
                let name = var_name(prop(p, "var"));
                let holder = if prop(p, "scope") == "global" { "null" } else { "player" };
                let v = num(p, "value", 1.0, -1_000_000_000.0, 1_000_000_000.0) as i64;
                let expr = match prop(p, "op") {
                    "add" => format!("anvilGet(level, {holder}, \"{name}\") + {v}"),
                    "sub" => format!("anvilGet(level, {holder}, \"{name}\") - {v}"),
                    "random" => format!("level.getRandom().nextInt({})", v.max(1)),
                    _ => v.to_string(),
                };
                format!("{ind}anvilSet(level, {holder}, \"{name}\", {expr});\n") + &next(stack)
            }
            "var_show" => {
                let name = var_name(prop(p, "var"));
                let slot = if prop(p, "slot") == "list" { "list" } else { "sidebar" };
                format!("{ind}anvilObj(level, \"{name}\");\n{ind}anvilRun(level, null, x, y, z, \"scoreboard objectives setdisplay {slot} anv_{name}\");\n") + &next(stack)
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
                (if c.is_empty() { String::new() } else { run(c) }) + &next(stack)
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
            "difficulty" => {
                let d = match prop(p, "difficulty") {
                    "peaceful" => "peaceful",
                    "easy" => "easy",
                    "hard" => "hard",
                    _ => "normal",
                };
                format!("{ind}anvilRun(level, null, x, y, z, \"difficulty {d}\");\n") + &next(stack)
            }
            _ => next(stack),
        };
        stack.remove(&n.id);
        code
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
                let name = var_name(prop(p, "var"));
                let holder = if prop(p, "scope") == "global" { "null" } else { "player" };
                let cmp = match prop(p, "cmp") {
                    "lt" => "<",
                    "eq" => "==",
                    "le" => "<=",
                    "ge" => ">=",
                    "ne" => "!=",
                    _ => ">",
                };
                format!("anvilGet(level, {holder}, \"{name}\") {cmp} {}", num(p, "value", 0.0, -1_000_000_000.0, 1_000_000_000.0) as i64)
            }
            "has_item" if id_ok(v) => format!("player != null && player.getInventory().countItem(anvilBpItem(\"{}\")) >= {}", rid(self.api, v), num(p, "count", 1.0, 1.0, 2304.0) as i64),
            "level_at_least" => format!("player != null && player.experienceLevel >= {}", num(p, "value", 5.0, 0.0, 100000.0) as i64),
            "in_water" => "target != null && target.isInWater()".into(),
            "on_fire" => "target != null && target.isOnFire()".into(),
            "is_player_target" => "target instanceof Player".into(),
            "message_contains" => format!("message.toLowerCase().contains(\"{}\".toLowerCase())", js(v)),
            // Zufall in Prozent (Standard)
            _ => format!("level.getRandom().nextFloat() < {:.3}f", num(p, "value", 50.0, 0.0, 100.0) / 100.0),
        }
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
        "ev_click_item" | "ev_use" | "ev_craft" | "ev_pickup" => format!("stack.is(anvilBpItem(\"{t}\"))"),
        "ev_click_entity" => format!("targetType == anvilEntity(\"{t}\")"),
        "ev_hurt" | "ev_kill" => format!("target.getType() == anvilEntity(\"{t}\")"),
        _ => return None,
    })
}

/// Erzeugt (Importe, Aufrufe in register(), Methoden) für alle Blueprints.
pub fn generate(blueprints: &[Blueprint], api: &BpApi) -> (Vec<&'static str>, String, String) {
    let active: Vec<&Blueprint> = blueprints.iter().filter(|b| b.enabled && !b.nodes.is_empty()).collect();
    if active.is_empty() {
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
    let mut calls = String::from("        NeoForge.EVENT_BUS.addListener(AnvilContent::anvilTick);\n");
    let mut methods = String::new();
    let mut timers = String::new();
    let mut starts = String::new();
    let get = if api.get_value { "getValue" } else { "get" };

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
        int by = to.getHeight(Heightmap.Types.MOTION_BLOCKING_NO_LEAVES, bx, bz);
        if (by < -60 || key == Level.NETHER) by = 70;
        if (key == Level.END) {{ bx = 100; by = 50; bz = 0; }}
        if (to.getBlockState(new BlockPos(bx, by - 1, bz)).isAir()) to.setBlockAndUpdate(new BlockPos(bx, by - 1, bz), net.minecraft.world.level.block.Blocks.STONE.defaultBlockState());
        anvilRun(level, player, player.getX(), player.getY(), player.getZ(), "execute in " + key.location() + " run tp @s " + (bx + 0.5) + " " + by + " " + (bz + 0.5));
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

    private static int anvilGet(ServerLevel level, Entity who, String name) {{
        var info = level.getServer().getScoreboard().getPlayerScoreInfo(anvilHolder(who), anvilObj(level, name));
        return info == null ? 0 : info.value();
    }}

    private static void anvilSet(ServerLevel level, Entity who, String name, int value) {{
        level.getServer().getScoreboard().getOrCreatePlayerScore(anvilHolder(who), anvilObj(level, name)).set(value);
    }}

    private static Item anvilBpItem(String id) {{
        return BuiltInRegistries.ITEM.{get}(ResourceLocation.parse(id));
    }}
"##
    ));

    let mut counter = 0;
    for bp in &active {
        let gen = Gen { api, bp, nodes: bp.nodes.iter().map(|n| (n.id.as_str(), n)).collect(), cancellable: false };
        for n in bp.nodes.iter().filter(|n| EVENT_KINDS.contains(&n.kind.as_str())) {
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
                "ev_start" => {
                    let body = gen.follow(&n.id, "next", 1, false, &mut stack);
                    starts.push_str(&format!(
                        "        {{\n            final ServerLevel level = event.getServer().overworld();\n            final Player player = null;\n            final LivingEntity target = null;\n            final double x = 0, y = level.getSeaLevel(), z = 0;\n            final BlockState state = null;\n            final ItemStack stack = ItemStack.EMPTY;\n            final String message = \"\";\n{body}        }}\n"
                    ));
                }
                kind => {
                    let Some((class, head, cancellable)) = event_head(kind) else { continue };
                    let g = Gen { api, bp, nodes: gen.nodes.clone(), cancellable };
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
    if !starts.is_empty() {
        calls.push_str("        NeoForge.EVENT_BUS.addListener(AnvilContent::anvilStarted);\n");
        methods.push_str(&format!("\n    private static void anvilStarted(ServerStartedEvent event) {{\n{starts}    }}\n"));
    }
    methods.push_str(&format!(
        "\n    private static void anvilTick(ServerTickEvent.Post event) {{\n        MinecraftServer server = event.getServer();\n        long now = server.getTickCount();\n        if (!ANVIL_TASKS.isEmpty()) {{\n            java.util.List<AnvilTask> due = new java.util.ArrayList<>();\n            ANVIL_TASKS.removeIf(t -> {{ if (t.at() <= now) {{ due.add(t); return true; }} return false; }});\n            due.forEach(t -> t.run().run());\n        }}\n{timers}    }}\n"
    ));
    (imports, calls, methods)
}
