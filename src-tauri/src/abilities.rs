//! Fähigkeiten für Blöcke: Statt fester Vorlagen (Generator, Akku, Kabel …)
//! bekommt ein normaler Block Fähigkeiten wie Energiespeicher, Inventar,
//! Tick-Logik oder „Verbindet sich“. Was der Block damit macht, steht in
//! Blueprints (Block-Tick, Rechtsklick, Redstone).
//!
//! Jeder Block mit Fähigkeiten bekommt eine eigene Block-Klasse (nur mit den
//! Zuständen, die er braucht) und teilt sich ein Block-Entity mit allen anderen.

use crate::content::BlockDef;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Serialize, Deserialize, Clone, Default, Debug)]
#[serde(rename_all = "camelCase", default)]
pub struct Ability {
    /// energy | inventory | tick | gui | facing | active | light | redstone | connect | recipes | ore | shapes
    pub kind: String,
    pub props: BTreeMap<String, String>,
}

/// Fähigkeiten, die eigenen Java-Code brauchen (ore/shapes/light nutzen die normalen Block-Felder)
const JAVA_KINDS: &[&str] = &["energy", "inventory", "tick", "gui", "facing", "active", "redstone", "connect", "recipes"];

pub fn is_custom(b: &BlockDef) -> bool {
    b.kind == "normal" && b.abilities.iter().any(|a| JAVA_KINDS.contains(&a.kind.as_str()) || a.kind.contains(':'))
}

pub fn get<'a>(b: &'a BlockDef, kind: &str) -> Option<&'a Ability> {
    b.abilities.iter().find(|a| a.kind == kind)
}

pub fn prop(a: Option<&Ability>, key: &str, def: &str) -> String {
    a.and_then(|a| a.props.get(key)).map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).unwrap_or_else(|| def.to_string())
}

fn num(a: Option<&Ability>, key: &str, def: i64, min: i64, max: i64) -> i64 {
    prop(a, key, "").replace(['.', ' '], "").parse::<i64>().unwrap_or(def).clamp(min, max)
}

pub fn has(b: &BlockDef, kind: &str) -> bool {
    get(b, kind).is_some()
}

/// Ausrichtung: "" | horizontal | all (Verbinden schließt Ausrichtung aus)
pub fn facing(b: &BlockDef) -> &'static str {
    if has(b, "connect") {
        return "";
    }
    match get(b, "facing") {
        Some(a) if prop(Some(a), "mode", "horizontal") == "all" => "all",
        Some(_) => "horizontal",
        None => "",
    }
}

/// Licht im eingeschalteten Zustand (0 = Licht wie eingestellt immer)
pub fn light_when_active(b: &BlockDef) -> Option<i64> {
    let l = get(b, "light")?;
    if prop(Some(l), "when", "always") == "active" && has(b, "active") {
        Some(num(Some(l), "level", 15, 1, 15))
    } else {
        None
    }
}

pub fn light_always(b: &BlockDef) -> Option<i64> {
    let l = get(b, "light")?;
    if light_when_active(b).is_some() {
        None
    } else {
        Some(num(Some(l), "level", 15, 0, 15))
    }
}

/// Anzahl der Slots im Block (0 = kein Inventar). Mit Rezepten mindestens 3 (Eingang, Brennstoff, Ausgang).
pub fn slots(b: &BlockDef) -> i64 {
    let inv = get(b, "inventory").map(|a| num(Some(a), "slots", 9, 1, 54)).unwrap_or(0);
    let inv = if has(b, "recipes") { inv.max(3) } else { inv };
    match inv {
        0 => 0,
        1..=3 => 3,
        4..=5 => 5,
        n => ((n + 8) / 9 * 9).min(54),
    }
}

fn camel(id: &str) -> String {
    id.split('_')
        .map(|w| {
            let mut c = w.chars();
            c.next().map(|f| f.to_uppercase().collect::<String>() + c.as_str()).unwrap_or_default()
        })
        .collect()
}

pub fn class_name(b: &BlockDef) -> String {
    format!("AnvilAb{}Block", camel(&b.id))
}

const BSP: &str = "net.minecraft.world.level.block.state.properties.BlockStateProperties";
const SIDE_PROPS: [&str; 6] = ["DOWN", "UP", "NORTH", "SOUTH", "WEST", "EAST"];

/// Block-Klasse für einen Block mit Fähigkeiten. `shape`: Java-Ausdruck für ein eigenes Modell (je Richtung) oder leer.
pub fn block_class(b: &BlockDef, shapes: &[(&str, String)], on_remove: &str) -> String {
    let cls = class_name(b);
    let face = facing(b);
    let active = has(b, "active");
    let emit = get(b, "redstone").map(|a| prop(Some(a), "emit", "false") == "true").unwrap_or(false);
    let connect = has(b, "connect");
    let mut props: Vec<String> = vec![];
    let mut defaults = String::new();
    match face {
        "horizontal" => {
            props.push(format!("{BSP}.HORIZONTAL_FACING"));
            defaults.push_str(&format!(".setValue({BSP}.HORIZONTAL_FACING, net.minecraft.core.Direction.NORTH)"));
        }
        "all" => {
            props.push(format!("{BSP}.FACING"));
            defaults.push_str(&format!(".setValue({BSP}.FACING, net.minecraft.core.Direction.NORTH)"));
        }
        _ => {}
    }
    if active {
        props.push(format!("{BSP}.LIT"));
        defaults.push_str(&format!(".setValue({BSP}.LIT, false)"));
    }
    if emit {
        props.push(format!("{BSP}.POWER"));
        defaults.push_str(&format!(".setValue({BSP}.POWER, 0)"));
    }
    if connect {
        for s in SIDE_PROPS {
            props.push(format!("{BSP}.{s}"));
            defaults.push_str(&format!(".setValue({BSP}.{s}, false)"));
        }
    }
    let state_def = if props.is_empty() {
        String::new()
    } else {
        format!(
            "\n        @Override\n        protected void createBlockStateDefinition(net.minecraft.world.level.block.state.StateDefinition.Builder<net.minecraft.world.level.block.Block, BlockState> builder) {{\n            builder.add({});\n        }}\n",
            props.join(", ")
        )
    };
    let place = {
        let mut s = String::from("BlockState s = defaultBlockState();\n");
        match face {
            "horizontal" => s.push_str(&format!("            s = s.setValue({BSP}.HORIZONTAL_FACING, context.getHorizontalDirection().getOpposite());\n")),
            "all" => s.push_str(&format!("            s = s.setValue({BSP}.FACING, context.getNearestLookingDirection().getOpposite());\n")),
            _ => {}
        }
        if connect {
            s.push_str("            s = anvilAbConnect(context.getLevel(), context.getClickedPos(), s);\n");
        }
        s.push_str("            return s;");
        s
    };
    let signal = if emit {
        format!(
            "\n        @Override\n        protected boolean isSignalSource(BlockState state) {{\n            return true;\n        }}\n\n        @Override\n        protected int getSignal(BlockState state, net.minecraft.world.level.BlockGetter level, BlockPos pos, net.minecraft.core.Direction direction) {{\n            return state.getValue({BSP}.POWER);\n        }}\n"
        )
    } else {
        String::new()
    };
    let shape = if connect {
        "\n        @Override\n        protected net.minecraft.world.phys.shapes.VoxelShape getShape(BlockState state, net.minecraft.world.level.BlockGetter level, BlockPos pos, net.minecraft.world.phys.shapes.CollisionContext context) {\n            return anvilAbCableShape(state);\n        }\n".to_string()
    } else if !shapes.is_empty() {
        let body = if face == "horizontal" && shapes.len() == 4 {
            format!(
                "return switch (state.getValue({BSP}.HORIZONTAL_FACING)) {{\n                case EAST -> {};\n                case SOUTH -> {};\n                case WEST -> {};\n                default -> {};\n            }};",
                shapes[1].1, shapes[2].1, shapes[3].1, shapes[0].1
            )
        } else {
            format!("return {};", shapes[0].1)
        };
        format!("\n        @Override\n        protected net.minecraft.world.phys.shapes.VoxelShape getShape(BlockState state, net.minecraft.world.level.BlockGetter level, BlockPos pos, net.minecraft.world.phys.shapes.CollisionContext context) {{\n            {body}\n        }}\n")
    } else {
        String::new()
    };
    format!(
        r#"
    /** Block mit Fähigkeiten: {id} */
    public static class {cls} extends BaseEntityBlock {{
        public static final MapCodec<{cls}> CODEC = simpleCodec({cls}::new);

        public {cls}(BlockBehaviour.Properties properties) {{
            super(properties);
            registerDefaultState(stateDefinition.any(){defaults});
        }}

        @Override
        protected MapCodec<? extends BaseEntityBlock> codec() {{
            return CODEC;
        }}
{state_def}
        @Override
        public BlockState getStateForPlacement(net.minecraft.world.item.context.BlockPlaceContext context) {{
            {place}
        }}

        @Override
        protected RenderShape getRenderShape(BlockState state) {{
            return RenderShape.MODEL;
        }}

        @Override
        public BlockEntity newBlockEntity(BlockPos pos, BlockState state) {{
            return new AnvilAbilityBlockEntity(pos, state);
        }}

        @Override
        public <T extends BlockEntity> net.minecraft.world.level.block.entity.BlockEntityTicker<T> getTicker(Level level, BlockState state, BlockEntityType<T> type) {{
            return level.isClientSide() ? null : createTickerHelper(type, ABILITY_BE.get(), AnvilAbilityBlockEntity::serverTick);
        }}

        @Override
        protected InteractionResult useWithoutItem(BlockState state, Level level, BlockPos pos, Player player, BlockHitResult hit) {{
            return anvilAbUse(state, level, pos, player);
        }}
{signal}{shape}{on_remove}    }}
"#,
        id = b.id
    )
}

/// Gemeinsamer Teil: Konfiguration, Block-Entity, Bedienung, Fähigkeiten-Helfer
pub fn shared_java(blocks: &[&BlockDef], api: &crate::energy::EnergyApi, be_ctor: &str, has_guis: bool, burn: &str) -> (String, String) {
    let mut cfg = String::new();
    let mut recipes = String::new();
    for b in blocks {
        let e = get(b, "energy");
        let (cap, inp, out) = if e.is_some() { (num(e, "capacity", 10000, 1, 2_000_000_000), num(e, "in", 100, 0, 1_000_000_000), num(e, "out", 100, 0, 1_000_000_000)) } else { (0, 0, 0) };
        let mut sides: String = prop(e, "sides", "bbbbbb").chars().filter(|c| "bion".contains(*c)).take(6).collect();
        while sides.len() < 6 {
            sides.push('b');
        }
        let push = e.is_some() && prop(e, "push", "true") == "true";
        let tick = get(b, "tick").map(|a| num(Some(a), "ticks", 20, 1, 72000)).unwrap_or(0);
        let gui = prop(get(b, "gui"), "gui", "");
        let r = get(b, "recipes");
        let use_fe = if r.is_some() && e.is_some() { num(r, "use", 20, 0, 1_000_000) } else { 0 };
        let fuel = r.is_some() && e.is_none() && prop(r, "fuel", "true") == "true";
        let connect = if has(b, "connect") { prop(get(b, "connect"), "to", "energy") } else { String::new() };
        let connect = match connect.as_str() {
            "same" | "inventory" | "energy" | "" => connect,
            _ => "energy".into(),
        };
        cfg.push_str(&format!(
            "java.util.Map.entry(\"{}\", new AnvilAb({cap}, {inp}, {out}, \"{sides}\", {push}, {}, {tick}, \"{}\", {use_fe}, {fuel}, {}, \"{connect}\", \"{}\")), ",
            b.id,
            slots(b),
            gui.replace(['"', '\\'], ""),
            r.is_some(),
            facing(b)
        ));
        if r.is_some() {
            for m in &b.machine.recipes {
                let ok = |s: &str| !s.trim().is_empty() && s.trim().chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || "_:/.-#".contains(c));
                if ok(&m.input) && ok(&m.output) {
                    recipes.push_str(&format!(
                        "        new AnvilAbRecipe(\"{}\", \"{}\", {}, \"{}\", {}, {}),\n",
                        b.id,
                        m.input.trim(),
                        m.input_count.clamp(1, 64),
                        m.output.trim(),
                        m.output_count.clamp(1, 64),
                        m.time.clamp(1, 72000)
                    ));
                }
            }
        }
    }
    let cfg = cfg.trim_end_matches(", ");
    // Fähigkeiten aus Plugins: je Block ein Abschnitt für Tick und Rechtsklick
    let (mut p_tick, mut p_use, mut p_methods) = (String::new(), String::new(), String::new());
    let mut seen = std::collections::HashSet::new();
    for b in blocks {
        let (mut t, mut u) = (String::new(), String::new());
        for a in b.abilities.iter().filter(|a| a.kind.contains(':')) {
            let Some(def) = crate::plugins::ability_def(&a.kind) else { continue };
            let defaults: BTreeMap<String, String> = def["props"].as_array().map(|ps| ps.iter().filter_map(|x| Some((x["key"].as_str()?.to_string(), x["def"].as_str().map(String::from).unwrap_or_else(|| x["def"].to_string())))).collect()).unwrap_or_default();
            let fill = |ty: &str, key: &str| -> Option<String> {
                if ty == "modid" || ty == "block" {
                    return Some(if ty == "block" { format!("\"{}\"", b.id) } else { String::new() });
                }
                let v = a.props.get(key).cloned().or_else(|| defaults.get(key).cloned()).unwrap_or_default();
                crate::plugins::literal(ty, &v)
            };
            let every = def["every"].as_u64().unwrap_or(1).clamp(1, 72000);
            if let Some(code) = def["tick"].as_str().and_then(|tp| crate::plugins::expand(tp, fill)) {
                t.push_str(&format!("            if (be.ticks % {every} == 0) {{ // {}\n                {}\n            }}\n", a.kind, code.trim().replace('\n', "\n                ")));
            }
            if let Some(code) = def["use"].as_str().and_then(|tp| crate::plugins::expand(tp, fill)) {
                u.push_str(&format!("            {{ // {}\n                {}\n            }}\n", a.kind, code.trim().replace('\n', "\n                ")));
            }
            if seen.insert(a.kind.clone()) {
                if let Some(m) = def["methods"].as_str() {
                    p_methods.push_str(&format!("\n    // Plugin-Fähigkeit: {}\n    {}\n", a.kind, m.trim().replace('\n', "\n    ")));
                }
            }
        }
        if !t.is_empty() {
            p_tick.push_str(&format!("            case \"{}\" -> {{\n{t}            }}\n", b.id));
        }
        if !u.is_empty() {
            p_use.push_str(&format!("            case \"{}\" -> {{\n{u}            }}\n", b.id));
        }
    }
    let cap = if api.handler { "net.neoforged.neoforge.capabilities.Capabilities.Energy.BLOCK" } else { "net.neoforged.neoforge.capabilities.Capabilities.EnergyStorage.BLOCK" };
    let saves = crate::energy::save_load_n(
        api,
        &[
            ("AnvilEnergy", "energy.get()", "energy.set({v})"),
            ("AnvilProgress", "progress", "progress = {v}"),
            ("AnvilTotal", "total", "total = {v}"),
            ("AnvilLit", "litTime", "litTime = {v}"),
            ("AnvilLitTotal", "litDuration", "litDuration = {v}"),
        ],
        "items.size()",
    );
    let gui_open = if has_guis {
        "        if (!cfg.gui().isEmpty() && player instanceof net.minecraft.server.level.ServerPlayer sp && ANVIL_GUIS.containsKey(cfg.gui())) {\n            anvilOpenGui(sp, cfg.gui(), be, be.guiData, pos, state.getBlock().getName());\n            return InteractionResult.SUCCESS;\n        }\n"
    } else {
        ""
    };
    let fields = format!("    public static final DeferredHolder<BlockEntityType<?>, BlockEntityType<AnvilAbilityBlockEntity>> ABILITY_BE = BLOCK_ENTITIES.register(\"ability\", () -> {be_ctor});\n\n");
    let methods = format!(
        r##"
    // ---- Blöcke mit Fähigkeiten ----
    /** cap/in/out: Strom; sides: vorne, hinten, links, rechts, oben, unten (b=beides, i=rein, o=raus, n=nichts) */
    public record AnvilAb(int cap, int in, int out, String sides, boolean push, int slots, int tick, String gui, int use, boolean fuel, boolean recipes, String connect, String facing) {{}}

    record AnvilAbRecipe(String block, String input, int inputCount, String output, int outputCount, int time) {{}}

    static final java.util.Map<String, AnvilAb> ANVIL_AB = java.util.Map.ofEntries({cfg});

    static final AnvilAbRecipe[] ANVIL_AB_RECIPES = {{
{recipes}    }};

    /** Fähigkeiten aus Plugins: Tick */
    static void anvilAbPluginTick(String block, ServerLevel level, BlockPos pos, BlockState state, AnvilAbilityBlockEntity be) {{
        switch (block) {{
{p_tick}            default -> {{}}
        }}
    }}

    /** Fähigkeiten aus Plugins: Rechtsklick (true = erledigt) */
    static boolean anvilAbPluginUse(String block, ServerLevel level, BlockPos pos, BlockState state, Player player) {{
        switch (block) {{
{p_use}            default -> {{}}
        }}
        return false;
    }}
{p_methods}
    static AnvilAb anvilAb(net.minecraft.world.level.block.Block block) {{
        return ANVIL_AB.getOrDefault(anvilBlockKey(block), new AnvilAb(0, 0, 0, "bbbbbb", false, 0, 0, "", 0, false, false, "", ""));
    }}

    static void anvilAbRegisterCaps(net.neoforged.neoforge.capabilities.RegisterCapabilitiesEvent event) {{
        event.registerBlockEntity({cap}, ABILITY_BE.get(), (be, side) -> be.cap(side));
    }}

    /** Vorderseite des Blocks (ohne Ausrichtung: Norden) */
    static net.minecraft.core.Direction anvilAbFront(BlockState state) {{
        if (state.hasProperty({BSP}.HORIZONTAL_FACING)) return state.getValue({BSP}.HORIZONTAL_FACING);
        if (state.hasProperty({BSP}.FACING)) return state.getValue({BSP}.FACING);
        return net.minecraft.core.Direction.NORTH;
    }}

    /** Welche Seiten-Regel gilt für diese Richtung? */
    static char anvilAbSide(BlockState state, String sides, net.minecraft.core.Direction d) {{
        if (d == null) return 'b';
        net.minecraft.core.Direction f = anvilAbFront(state);
        int i;
        if (d == f) i = 0;
        else if (d == f.getOpposite()) i = 1;
        else if (f.getAxis().isVertical()) i = 2;
        else if (d == net.minecraft.core.Direction.UP) i = 4;
        else if (d == net.minecraft.core.Direction.DOWN) i = 5;
        else if (d == f.getCounterClockWise()) i = 2;
        else i = 3;
        return sides.length() > i ? sides.charAt(i) : 'b';
    }}

    static final {BSP_TY}[] ANVIL_AB_SIDES = {{ {BSP}.DOWN, {BSP}.UP, {BSP}.NORTH, {BSP}.SOUTH, {BSP}.WEST, {BSP}.EAST }};

    /** Verbindungen zu den Nachbarn neu bestimmen (Kabel-Form) */
    static BlockState anvilAbConnect(Level level, BlockPos pos, BlockState state) {{
        if (!state.hasProperty({BSP}.NORTH)) return state;
        AnvilAb cfg = anvilAb(state.getBlock());
        for (net.minecraft.core.Direction d : net.minecraft.core.Direction.values()) {{
            BlockPos np = pos.relative(d);
            BlockState ns = level.getBlockState(np);
            boolean c = ns.is(state.getBlock()) || switch (cfg.connect()) {{
                case "same" -> false;
                case "inventory" -> level.getBlockEntity(np) instanceof net.minecraft.world.Container;
                default -> anvilHasEnergy(level, np, d.getOpposite());
            }};
            state = state.setValue(ANVIL_AB_SIDES[d.ordinal()], c);
        }}
        return state;
    }}

    static net.minecraft.world.phys.shapes.VoxelShape anvilAbCableShape(BlockState state) {{
        net.minecraft.world.phys.shapes.VoxelShape s = net.minecraft.world.level.block.Block.box(5, 5, 5, 11, 11, 11);
        if (state.getValue({BSP}.DOWN)) s = net.minecraft.world.phys.shapes.Shapes.or(s, net.minecraft.world.level.block.Block.box(5, 0, 5, 11, 5, 11));
        if (state.getValue({BSP}.UP)) s = net.minecraft.world.phys.shapes.Shapes.or(s, net.minecraft.world.level.block.Block.box(5, 11, 5, 11, 16, 11));
        if (state.getValue({BSP}.NORTH)) s = net.minecraft.world.phys.shapes.Shapes.or(s, net.minecraft.world.level.block.Block.box(5, 5, 0, 11, 11, 5));
        if (state.getValue({BSP}.SOUTH)) s = net.minecraft.world.phys.shapes.Shapes.or(s, net.minecraft.world.level.block.Block.box(5, 5, 11, 11, 11, 16));
        if (state.getValue({BSP}.WEST)) s = net.minecraft.world.phys.shapes.Shapes.or(s, net.minecraft.world.level.block.Block.box(0, 5, 5, 5, 11, 11));
        if (state.getValue({BSP}.EAST)) s = net.minecraft.world.phys.shapes.Shapes.or(s, net.minecraft.world.level.block.Block.box(11, 5, 5, 16, 11, 11));
        return s;
    }}

    /** Rechtsklick: zuerst Blueprints („Block wird benutzt“), dann Oberfläche, Inventar oder Füllstand */
    static InteractionResult anvilAbUse(BlockState state, Level level, BlockPos pos, Player player) {{
        if (level.isClientSide() || !(level instanceof ServerLevel sl) || !(level.getBlockEntity(pos) instanceof AnvilAbilityBlockEntity be)) return InteractionResult.SUCCESS;
        AnvilAb cfg = be.cfg;
        if (anvilBlockHook("use", anvilBlockKey(state.getBlock()), sl, pos, player)) return InteractionResult.SUCCESS;
        if (anvilAbPluginUse(anvilBlockKey(state.getBlock()), sl, pos, state, player)) return InteractionResult.SUCCESS;
{gui_open}        if (cfg.slots() > 0) {{
            player.openMenu(be);
            return InteractionResult.SUCCESS;
        }}
        if (cfg.cap() > 0) {{
            player.displayClientMessage(Component.literal(state.getBlock().getName().getString() + ": " + anvilFe(be.energy.get()) + " / " + anvilFe(be.energy.capacity()) + " FE"), true);
            return InteractionResult.SUCCESS;
        }}
        return InteractionResult.PASS;
    }}

    public static class AnvilAbilityBlockEntity extends net.minecraft.world.level.block.entity.BaseContainerBlockEntity {{
        NonNullList<ItemStack> items;
        final AnvilAb cfg;
        final AnvilEnergy energy;
        int progress, total, litTime, litDuration;
        long ticks;
        boolean lastRedstone;
        final net.minecraft.world.inventory.ContainerData guiData = new net.minecraft.world.inventory.ContainerData() {{
            @Override
            public int get(int index) {{
                return switch (index) {{
                    case 0 -> litTime;
                    case 1 -> litDuration;
                    case 2 -> progress;
                    case 3 -> total;
                    default -> energy.slot(index - 4);
                }};
            }}

            @Override
            public void set(int index, int value) {{}}

            @Override
            public int getCount() {{
                return 8;
            }}
        }};

        public AnvilAbilityBlockEntity(BlockPos pos, BlockState state) {{
            super(ABILITY_BE.get(), pos, state);
            cfg = anvilAb(state.getBlock());
            items = NonNullList.withSize(Math.max(0, cfg.slots()), ItemStack.EMPTY);
            energy = new AnvilEnergy(cfg.cap(), cfg.in(), cfg.out(), this::setChanged);
        }}

        public AnvilEnergyCap cap(net.minecraft.core.Direction side) {{
            if (cfg.cap() <= 0) return null;
            char c = anvilAbSide(getBlockState(), cfg.sides(), side);
            if (c == 'n') return null;
            return new AnvilEnergyCap(energy, c == 'b' || c == 'i', c == 'b' || c == 'o');
        }}

        /** Strom im Block (für Blueprints) */
        public int energyGet() {{
            return energy.get();
        }}

        public int energyAdd(int n) {{
            return energy.add(n);
        }}

        public int energyTake(int n) {{
            return energy.take(n);
        }}

        static int burnTime(Level level, ItemStack stack) {{
            return stack.isEmpty() ? 0 : {burn};
        }}

        @Override
        public int getContainerSize() {{
            return items.size();
        }}

        @Override
        protected NonNullList<ItemStack> getItems() {{
            return items;
        }}

        @Override
        protected void setItems(NonNullList<ItemStack> items) {{
            if (items.size() == this.items.size()) this.items = items;
        }}

        @Override
        protected Component getDefaultName() {{
            return getBlockState().getBlock().getName();
        }}

        @Override
        protected net.minecraft.world.inventory.AbstractContainerMenu createMenu(int id, net.minecraft.world.entity.player.Inventory inventory) {{
            int n = items.size();
            if (n == 3) return new net.minecraft.world.inventory.FurnaceMenu(id, inventory, this, guiData);
            if (n == 5) return new net.minecraft.world.inventory.HopperMenu(id, inventory, this);
            int rows = Math.max(1, Math.min(6, n / 9));
            net.minecraft.world.inventory.MenuType<net.minecraft.world.inventory.ChestMenu> type = switch (rows) {{
                case 1 -> net.minecraft.world.inventory.MenuType.GENERIC_9x1;
                case 2 -> net.minecraft.world.inventory.MenuType.GENERIC_9x2;
                case 4 -> net.minecraft.world.inventory.MenuType.GENERIC_9x4;
                case 5 -> net.minecraft.world.inventory.MenuType.GENERIC_9x5;
                case 6 -> net.minecraft.world.inventory.MenuType.GENERIC_9x6;
                default -> net.minecraft.world.inventory.MenuType.GENERIC_9x3;
            }};
            return new net.minecraft.world.inventory.ChestMenu(type, id, inventory, this, rows);
        }}

        private static AnvilAbRecipe find(String key, ItemStack input) {{
            for (AnvilAbRecipe r : ANVIL_AB_RECIPES) {{
                if (r.block().equals(key) && anvilMatches(input, r.input()) && input.getCount() >= r.inputCount()) return r;
            }}
            return null;
        }}

        /** Rezepte verarbeiten: Eingang (Slot 1) → Ausgang (Slot 3), mit Strom, Brennstoff (Slot 2) oder von selbst */
        private boolean process(Level level, String key) {{
            if (items.size() < 3) return false;
            if (litTime > 0 && cfg.fuel()) litTime--;
            AnvilAbRecipe r = find(key, items.get(0));
            ItemStack out = items.get(2);
            ItemStack result = r == null ? ItemStack.EMPTY : anvilStack(r.output(), r.outputCount());
            boolean fits = !result.isEmpty() && (out.isEmpty() || (ItemStack.isSameItemSameComponents(out, result) && out.getCount() + result.getCount() <= out.getMaxStackSize()));
            if (!fits) {{
                if (progress > 0) {{
                    progress = 0;
                    setChanged();
                }}
                return false;
            }}
            boolean run;
            if (cfg.cap() > 0) {{
                run = energy.get() >= cfg.use();
                if (run) energy.take(cfg.use());
            }} else if (cfg.fuel()) {{
                if (litTime <= 0) {{
                    ItemStack fuel = items.get(1);
                    int burn = burnTime(level, fuel);
                    if (burn > 0) {{
                        litTime = litDuration = burn;
                        boolean bucket = fuel.is(net.minecraft.world.item.Items.LAVA_BUCKET);
                        fuel.shrink(1);
                        if (bucket) items.set(1, new ItemStack(net.minecraft.world.item.Items.BUCKET));
                    }}
                }}
                run = litTime > 0;
            }} else run = true;
            if (run) {{
                total = r.time();
                progress++;
                if (progress >= total) {{
                    progress = 0;
                    items.get(0).shrink(r.inputCount());
                    if (out.isEmpty()) items.set(2, result);
                    else out.grow(result.getCount());
                }}
            }} else if (progress > 0) progress = Math.max(0, progress - 2);
            setChanged();
            return run;
        }}

        /** Strom an die Nachbarn abgeben; eigene Blöcke werden nach Füllstand ausgeglichen */
        private void push(Level level, BlockPos pos, BlockState state) {{
            int left = Math.min(cfg.out(), energy.get());
            for (net.minecraft.core.Direction d : net.minecraft.core.Direction.values()) {{
                if (left <= 0) return;
                char c = anvilAbSide(state, cfg.sides(), d);
                if (c != 'b' && c != 'o') continue;
                BlockPos np = pos.relative(d);
                int n;
                if (level.getBlockEntity(np) instanceof AnvilAbilityBlockEntity o && o.cfg.cap() > 0) {{
                    long mine = (long) energy.get() * o.energy.capacity(), theirs = (long) o.energy.get() * energy.capacity();
                    if (mine <= theirs) continue;
                    int want = (int) Math.min(left, (mine - theirs) / Math.max(1, energy.capacity() + o.energy.capacity()) + 1);
                    n = anvilSendEnergy(level, np, d.getOpposite(), want);
                }} else n = anvilSendEnergy(level, np, d.getOpposite(), left);
                energy.take(n);
                left -= n;
            }}
        }}

        public static void serverTick(Level level, BlockPos pos, BlockState state, AnvilAbilityBlockEntity be) {{
            if (!(level instanceof ServerLevel sl)) return;
            AnvilAb cfg = be.cfg;
            String key = anvilBlockKey(state.getBlock());
            be.ticks++;
            if (!cfg.connect().isEmpty() && (level.getGameTime() + pos.asLong()) % 10 == 0) {{
                BlockState c = anvilAbConnect(level, pos, state);
                if (c != state) {{
                    level.setBlock(pos, c, 3);
                    state = c;
                }}
            }}
            if (cfg.recipes()) {{
                boolean working = be.process(level, key);
                if (state.hasProperty({BSP}.LIT) && state.getValue({BSP}.LIT) != working) {{
                    state = state.setValue({BSP}.LIT, working);
                    level.setBlock(pos, state, 3);
                }}
            }}
            if (cfg.push() && cfg.cap() > 0 && be.energy.get() > 0) be.push(level, pos, state);
            boolean rs = level.hasNeighborSignal(pos);
            if (rs != be.lastRedstone) {{
                be.lastRedstone = rs;
                anvilBlockHook("redstone", key, sl, pos, null);
            }}
            if (cfg.tick() > 0 && be.ticks % cfg.tick() == 0) anvilBlockHook("tick", key, sl, pos, null);
            anvilAbPluginTick(key, sl, pos, state, be);
        }}

{saves}    }}
"##,
        BSP_TY = "net.minecraft.world.level.block.state.properties.BooleanProperty",
    );
    (fields, methods)
}

/// Hilfen für Blueprint-Knoten rund um Blöcke (funktionieren auch ohne Fähigkeiten-Blöcke über Capabilities)
pub fn bp_helpers(has_class: bool, tag_or: bool, value_io: bool) -> String {
    let _ = value_io;
    let (add, take, get, cap) = if has_class {
        (
            "if (level.getBlockEntity(pos) instanceof AnvilAbilityBlockEntity be) return be.energyAdd(n);\n        return anvilEnergyAdd(level, pos, n);",
            "if (level.getBlockEntity(pos) instanceof AnvilAbilityBlockEntity be) return be.energyTake(n);\n        return anvilEnergyTake(level, pos, n);",
            "if (level.getBlockEntity(pos) instanceof AnvilAbilityBlockEntity be) return be.energyGet();\n        return anvilEnergyAt(level, pos);",
            "if (level.getBlockEntity(pos) instanceof AnvilAbilityBlockEntity be) return be.energy.capacity();\n        return 0;",
        )
    } else {
        ("return anvilEnergyAdd(level, pos, n);", "return anvilEnergyTake(level, pos, n);", "return anvilEnergyAt(level, pos);", "return 0;")
    };
    let push = if has_class {
        "if (level.getBlockEntity(pos) instanceof AnvilAbilityBlockEntity be) {\n            int left = Math.min(n, be.energyGet());\n            for (net.minecraft.core.Direction d : net.minecraft.core.Direction.values()) {\n                if (left <= 0) break;\n                if (front && d != anvilAbFront(be.getBlockState())) continue;\n                int s = anvilSendEnergy(level, pos.relative(d), d.getOpposite(), left);\n                be.energyTake(s);\n                left -= s;\n            }\n        }"
    } else {
        ""
    };
    let get_d = if tag_or { "t.getDoubleOr(\"anvil_\" + name, 0)" } else { "t.getDouble(\"anvil_\" + name)" };
    format!(
        r#"
    // ---- Blueprint: Block-Knoten ----
    static int anvilBlkAdd(Level level, BlockPos pos, int n) {{
        if (n <= 0) return 0;
        {add}
    }}

    static int anvilBlkTake(Level level, BlockPos pos, int n) {{
        if (n <= 0) return 0;
        {take}
    }}

    static int anvilBlkEnergy(Level level, BlockPos pos) {{
        {get}
    }}

    static int anvilBlkCapacity(Level level, BlockPos pos) {{
        {cap}
    }}

    static void anvilBlkPush(Level level, BlockPos pos, int n, boolean front) {{
        {push}
    }}

    static void anvilBlkLit(Level level, BlockPos pos, boolean on) {{
        BlockState s = level.getBlockState(pos);
        if (s.hasProperty({BSP}.LIT) && s.getValue({BSP}.LIT) != on) level.setBlock(pos, s.setValue({BSP}.LIT, on), 3);
    }}

    static boolean anvilBlkIsLit(Level level, BlockPos pos) {{
        BlockState s = level.getBlockState(pos);
        return s.hasProperty({BSP}.LIT) && s.getValue({BSP}.LIT);
    }}

    static void anvilBlkSignal(Level level, BlockPos pos, int power) {{
        BlockState s = level.getBlockState(pos);
        int p = Math.max(0, Math.min(15, power));
        if (s.hasProperty({BSP}.POWER) && s.getValue({BSP}.POWER) != p) level.setBlock(pos, s.setValue({BSP}.POWER, p), 3);
    }}

    /** Block-Variablen: im Block gespeichert (bleiben beim Neustart erhalten) */
    static double anvilBlkVar(Level level, BlockPos pos, String name) {{
        net.minecraft.world.level.block.entity.BlockEntity be = level.getBlockEntity(pos);
        if (be == null) return 0;
        net.minecraft.nbt.CompoundTag t = be.getPersistentData();
        return {get_d};
    }}

    static void anvilBlkSetVar(Level level, BlockPos pos, String name, double v) {{
        net.minecraft.world.level.block.entity.BlockEntity be = level.getBlockEntity(pos);
        if (be == null) return;
        be.getPersistentData().putDouble("anvil_" + name, v);
        be.setChanged();
    }}

    static ItemStack anvilBlkSlot(Level level, BlockPos pos, int slot) {{
        if (level.getBlockEntity(pos) instanceof net.minecraft.world.Container c && slot >= 0 && slot < c.getContainerSize()) return c.getItem(slot);
        return ItemStack.EMPTY;
    }}

    /** Aus einem Slot nehmen – nur wenn genug drin ist */
    static boolean anvilBlkTakeSlot(Level level, BlockPos pos, int slot, int count) {{
        if (!(level.getBlockEntity(pos) instanceof net.minecraft.world.Container c) || slot < 0 || slot >= c.getContainerSize()) return false;
        ItemStack s = c.getItem(slot);
        if (s.getCount() < count) return false;
        boolean bucket = s.is(net.minecraft.world.item.Items.LAVA_BUCKET) && count == 1;
        s.shrink(count);
        if (bucket && s.isEmpty()) c.setItem(slot, new ItemStack(net.minecraft.world.item.Items.BUCKET));
        c.setChanged();
        return true;
    }}

    static boolean anvilBlkPutSlot(Level level, BlockPos pos, int slot, ItemStack add) {{
        if (add.isEmpty() || !(level.getBlockEntity(pos) instanceof net.minecraft.world.Container c) || slot < 0 || slot >= c.getContainerSize()) return false;
        ItemStack s = c.getItem(slot);
        if (s.isEmpty()) c.setItem(slot, add);
        else if (ItemStack.isSameItemSameComponents(s, add) && s.getCount() + add.getCount() <= s.getMaxStackSize()) s.grow(add.getCount());
        else return false;
        c.setChanged();
        return true;
    }}

    static boolean anvilBlkIsDay(Level level) {{
        long t = level.getDayTime() % 24000L;
        return t < 12300L || t > 23850L;
    }}
"#
    )
}

/// Blockstate für einen Block mit Fähigkeiten. `m`: Modell-Name, `on`: Modell für „an“ (falls An/Aus)
pub fn blockstate(b: &BlockDef, m: &str) -> serde_json::Value {
    use serde_json::json;
    if has(b, "connect") {
        return crate::energy::cable_blockstate(m);
    }
    let face = facing(b);
    let active = has(b, "active");
    let emit = get(b, "redstone").map(|a| prop(Some(a), "emit", "false") == "true").unwrap_or(false);
    let dirs: Vec<(&str, Option<i64>, Option<i64>)> = match face {
        "horizontal" => vec![("north", None, None), ("east", None, Some(90)), ("south", None, Some(180)), ("west", None, Some(270))],
        "all" => vec![("north", None, None), ("east", None, Some(90)), ("south", None, Some(180)), ("west", None, Some(270)), ("up", Some(270), None), ("down", Some(90), None)],
        _ => vec![("", None, None)],
    };
    let lits: Vec<Option<bool>> = if active { vec![Some(false), Some(true)] } else { vec![None] };
    let powers: Vec<Option<u32>> = if emit { (0..16).map(Some).collect() } else { vec![None] };
    let mut variants = serde_json::Map::new();
    for (d, x, y) in &dirs {
        for l in &lits {
            for p in &powers {
                let mut key: Vec<String> = vec![];
                if !d.is_empty() {
                    key.push(format!("facing={d}"));
                }
                if let Some(l) = l {
                    key.push(format!("lit={l}"));
                }
                if let Some(p) = p {
                    key.push(format!("power={p}"));
                }
                let model = if *l == Some(true) { format!("{m}_on") } else { m.to_string() };
                let mut v = json!({ "model": model });
                if let Some(x) = x {
                    v["x"] = json!(x);
                }
                if let Some(y) = y {
                    v["y"] = json!(y);
                }
                variants.insert(key.join(","), v);
            }
        }
    }
    json!({ "variants": variants })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ab(kind: &str, props: &[(&str, &str)]) -> Ability {
        Ability { kind: kind.into(), props: props.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect() }
    }

    #[test]
    fn custom_and_slots() {
        let mut b = BlockDef { id: "panel".into(), ..Default::default() };
        assert!(!is_custom(&b));
        b.abilities.push(ab("ore", &[]));
        assert!(!is_custom(&b));
        b.abilities.push(ab("recipes", &[]));
        assert!(is_custom(&b));
        assert_eq!(slots(&b), 3);
        b.abilities.push(ab("inventory", &[("slots", "10")]));
        assert_eq!(slots(&b), 18);
    }

    #[test]
    fn blockstate_variants() {
        let b = BlockDef {
            id: "x".into(),
            abilities: vec![ab("facing", &[]), ab("active", &[]), ab("redstone", &[("emit", "true")])],
            ..Default::default()
        };
        let s = blockstate(&b, "m:block/x");
        let v = s["variants"].as_object().unwrap();
        assert_eq!(v.len(), 4 * 2 * 16);
        assert_eq!(v["facing=east,lit=true,power=3"]["model"], "m:block/x_on");
        let code = block_class(&b, &[], "");
        assert!(code.contains("HORIZONTAL_FACING") && code.contains(".LIT") && code.contains(".POWER"));
    }
}
