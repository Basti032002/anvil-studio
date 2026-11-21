//! Anreise in eigene Dimensionen: Portale mit Rahmen (wie das Nether-Portal),
//! automatisches Rückportal und sichere Ankunft (nie im Boden, nie ins Leere).

use crate::dimension::DimDef;
use serde_json::{json, Value};

pub struct PortalApi {
    /// ab 1.21.2: Registry#getValue statt #get
    pub get_value: bool,
    /// ab 1.21.9: Properties#noCollision statt #noCollission
    pub lazy_props: bool,
}

pub fn frame(d: &DimDef) -> String {
    let f = d.portal_frame.trim();
    if f.is_empty() { "minecraft:crying_obsidian".into() } else { f.to_string() }
}

pub fn igniter(d: &DimDef) -> String {
    let f = d.portal_igniter.trim();
    if f.is_empty() { "minecraft:flint_and_steel".into() } else { f.to_string() }
}

pub fn block_id(d: &DimDef) -> String {
    format!("{}_portal", d.id)
}

fn color(d: &DimDef) -> (u8, u8, u8) {
    let s = d.portal_color.trim().trim_start_matches('#');
    if s.len() == 6 {
        if let Ok(v) = u32::from_str_radix(s, 16) {
            return ((v >> 16) as u8, (v >> 8) as u8, v as u8);
        }
    }
    (0x8a, 0x3c, 0xff)
}

fn jstr(s: &str) -> String {
    format!("\"{}\"", s.replace('\\', "\\\\").replace('"', "\\\""))
}

/// Ankunft für alle eigenen Dimensionen + sichere Landung (wird auch von Blueprint-Reisen benutzt)
pub fn arrival_java(dims: &[DimDef], modid: &str, resolve: &dyn Fn(&str) -> String) -> String {
    let mut puts = String::new();
    for d in dims {
        let id = format!("{modid}:{}", d.id);
        let fixed = if d.arrival == "fixed" { 1 } else { 0 };
        let block = if d.arrival_block.trim().is_empty() { "minecraft:stone".to_string() } else { resolve(d.arrival_block.trim()) };
        puts.push_str(&format!(
            "        m.put({}, new Object[] {{ {fixed}, {}, {}, {}, {}, {} }});\n",
            jstr(&id),
            d.arrival_x,
            d.arrival_y,
            d.arrival_z,
            if d.arrival_no_platform { 0 } else { 1 },
            jstr(&block)
        ));
    }
    ARRIVAL.replace("@PUTS@", &puts)
}

const ARRIVAL: &str = r#"
    // ---- Anreise: sicher ankommen (nie im Boden, nie ins Leere) ----
    /** Dimension → { fest?, x, y, z, Plattform?, Plattform-Block } */
    private static final java.util.Map<String, Object[]> ANVIL_ARRIVAL = anvilArrivalSettings();

    private static java.util.Map<String, Object[]> anvilArrivalSettings() {
        java.util.Map<String, Object[]> m = new java.util.HashMap<>();
@PUTS@        return m;
    }

    private static boolean anvilStandable(ServerLevel l, BlockPos p) {
        BlockState feet = l.getBlockState(p), head = l.getBlockState(p.above()), floor = l.getBlockState(p.below());
        return feet.getCollisionShape(l, p).isEmpty() && head.getCollisionShape(l, p.above()).isEmpty()
            && feet.getFluidState().isEmpty() && head.getFluidState().isEmpty()
            && floor.getFluidState().isEmpty() && floor.isFaceSturdy(l, p.below(), net.minecraft.core.Direction.UP);
    }

    /** Freie Stelle in einer Spalte suchen: von oben nach unten, mit Decke (Nether, Höhlen) erst unter der Decke */
    private static BlockPos anvilColumn(ServerLevel l, int x, int z) {
        l.getChunk(x >> 4, z >> 4);
        int min = l.dimensionType().minY();
        int top = min + Math.min(l.dimensionType().height(), l.dimensionType().logicalHeight()) - 2;
        boolean ceiling = l.dimensionType().hasCeiling();
        boolean solidAbove = false;
        BlockPos.MutableBlockPos m = new BlockPos.MutableBlockPos();
        for (int y = top; y > min + 1; y--) {
            m.set(x, y, z);
            if (!l.getBlockState(m).getCollisionShape(l, m).isEmpty()) { solidAbove = true; continue; }
            if ((!ceiling || solidAbove) && anvilStandable(l, m)) return m.immutable();
        }
        return null;
    }

    /** Wo man in einer Dimension ankommt (Füße). Baut bei Bedarf eine kleine Plattform. */
    public static BlockPos anvilArrive(ServerLevel to, int x, int z) {
        Object[] a = ANVIL_ARRIVAL.get(to.dimension().location().toString());
        boolean platform = a == null || (int) a[4] == 1;
        String block = a == null ? "minecraft:stone" : (String) a[5];
        int min = to.dimensionType().minY(), max = min + to.dimensionType().height() - 3;
        if (a != null && (int) a[0] == 1) {
            BlockPos p = new BlockPos((int) a[1], Math.max(min + 2, Math.min(max, (int) a[2])), (int) a[3]);
            to.getChunk(p.getX() >> 4, p.getZ() >> 4);
            if (!anvilStandable(to, p)) anvilPlatform(to, p, block, platform);
            return p;
        }
        BlockPos p = anvilColumn(to, x, z);
        for (int r = 8; p == null && r <= 96; r += 8) {
            for (int i = 0; i < 8 && p == null; i++) {
                double ang = Math.PI * 2 * i / 8;
                p = anvilColumn(to, x + (int) Math.round(Math.cos(ang) * r), z + (int) Math.round(Math.sin(ang) * r));
            }
        }
        if (p != null) return p;
        // Nichts gefunden (z. B. schwebende Inseln über dem Nichts): Plattform in mittlerer Höhe
        int y = Math.max(min + 2, Math.min(max, Math.max(to.getSeaLevel() + 1, min + to.dimensionType().height() / 2)));
        BlockPos q = new BlockPos(x, y, z);
        anvilPlatform(to, q, block, true);
        return q;
    }

    private static void anvilPlatform(ServerLevel l, BlockPos feet, String block, boolean floor) {
        net.minecraft.world.level.block.Block b = BuiltInRegistries.BLOCK.@GET@(ResourceLocation.parse(block));
        if (b == null || b == net.minecraft.world.level.block.Blocks.AIR) b = net.minecraft.world.level.block.Blocks.STONE;
        for (int dx = -1; dx <= 1; dx++) for (int dz = -1; dz <= 1; dz++) {
            BlockPos f = feet.offset(dx, -1, dz);
            if (floor && l.getBlockState(f).getCollisionShape(l, f).isEmpty()) l.setBlockAndUpdate(f, b.defaultBlockState());
            for (int dy = 0; dy <= 1; dy++) {
                BlockPos c = feet.offset(dx, dy, dz);
                if (!l.getBlockState(c).isAir()) l.setBlockAndUpdate(c, net.minecraft.world.level.block.Blocks.AIR.defaultBlockState());
            }
        }
    }
"#;

/// Portal-Blöcke, Anzünden, Reisen und Rückportal
pub fn portal_java(dims: &[DimDef], modid: &str, resolve: &dyn Fn(&str) -> String, api: &PortalApi) -> (String, String, String) {
    let portals: Vec<&DimDef> = dims.iter().filter(|d| d.portal).collect();
    if portals.is_empty() {
        return (String::new(), String::new(), String::new());
    }
    let mut fields = String::new();
    let mut table = String::new();
    for d in &portals {
        let id = block_id(d);
        let up = id.to_uppercase();
        let no_col = if api.lazy_props { ".noCollision()" } else { ".noCollission()" };
        let props = format!("BlockBehaviour.Properties.of(){no_col}.strength(-1.0F, 3600000.0F).lightLevel(s -> 11).noLootTable().sound(SoundType.GLASS).noOcclusion()");
        let props = if api.lazy_props { format!("() -> {props}") } else { props };
        fields.push_str(&format!(
            "    public static final DeferredBlock<AnvilPortalBlock> {up} = BLOCKS.registerBlock(\"{id}\", p -> new AnvilPortalBlock(p, {dim}), {props});\n",
            dim = jstr(&format!("{modid}:{}", d.id)),
        ));
        table.push_str(&format!(
            "        m.put({dim}, new String[] {{ {frame}, {ign}, {block} }});\n",
            dim = jstr(&format!("{modid}:{}", d.id)),
            frame = jstr(&resolve(&frame(d))),
            ign = jstr(&resolve(&igniter(d))),
            block = jstr(&format!("{modid}:{id}")),
        ));
    }
    let calls = "        NeoForge.EVENT_BUS.addListener(AnvilContent::anvilPortalLight);\n        NeoForge.EVENT_BUS.addListener(AnvilContent::anvilPortalTick);\n        NeoForge.EVENT_BUS.addListener(AnvilContent::anvilPortalBreak);\n".to_string();
    let get = if api.get_value { "getValue" } else { "get" };
    let methods = PORTAL.replace("@TABLE@", &table).replace("@GET@", get);
    (fields, calls, methods)
}

const PORTAL: &str = r#"
    // ---- Portale (Anreise): Rahmen bauen, anzünden, durchgehen ----
    /** Dimension → { Rahmen-Block, Anzünd-Item, Portal-Block } */
    private static final java.util.Map<String, String[]> ANVIL_PORTALS = anvilPortalTable();
    private static final java.util.Map<java.util.UUID, Integer> ANVIL_PORTAL_TIME = new java.util.HashMap<>();
    /** gerade angekommen: erst wieder reisen, wenn man das Portal verlassen hat */
    private static final java.util.Set<java.util.UUID> ANVIL_PORTAL_WAIT = new java.util.HashSet<>();

    private static java.util.Map<String, String[]> anvilPortalTable() {
        java.util.Map<String, String[]> m = new java.util.HashMap<>();
@TABLE@        return m;
    }

    public static class AnvilPortalBlock extends net.minecraft.world.level.block.Block {
        public static final net.minecraft.world.level.block.state.properties.EnumProperty<net.minecraft.core.Direction.Axis> AXIS = net.minecraft.world.level.block.state.properties.BlockStateProperties.HORIZONTAL_AXIS;
        public final String dim;

        public AnvilPortalBlock(BlockBehaviour.Properties properties, String dim) {
            super(properties);
            this.dim = dim;
            registerDefaultState(stateDefinition.any().setValue(AXIS, net.minecraft.core.Direction.Axis.X));
        }

        @Override
        protected void createBlockStateDefinition(net.minecraft.world.level.block.state.StateDefinition.Builder<net.minecraft.world.level.block.Block, BlockState> builder) {
            builder.add(AXIS);
        }

        @Override
        public void animateTick(BlockState state, Level level, BlockPos pos, net.minecraft.util.RandomSource random) {
            if (random.nextInt(3) != 0) return;
            double x = pos.getX() + random.nextDouble(), y = pos.getY() + random.nextDouble(), z = pos.getZ() + random.nextDouble();
            level.addParticle(net.minecraft.core.particles.ParticleTypes.PORTAL, x, y, z, (random.nextDouble() - 0.5) * 0.5, (random.nextDouble() - 0.5) * 0.5, (random.nextDouble() - 0.5) * 0.5);
        }
    }

    private static String anvilKeyOf(net.minecraft.world.level.block.Block b) {
        return BuiltInRegistries.BLOCK.getKey(b).toString();
    }

    private static net.minecraft.world.level.block.Block anvilBlockOf(String id) {
        return BuiltInRegistries.BLOCK.@GET@(ResourceLocation.parse(id));
    }

    private static void anvilCmd(ServerLevel level, Player player, String command) {
        net.minecraft.commands.CommandSourceStack source = level.getServer().createCommandSourceStack().withLevel(level).withPosition(player.position()).withPermission(4).withSuppressedOutput().withEntity(player);
        level.getServer().getCommands().performPrefixedCommand(source, command);
    }

    /** Rahmen um eine freie Stelle suchen und mit Portal füllen (Innenmaß 2×3 bis 21×21) */
    private static boolean anvilPortalFill(ServerLevel l, BlockPos start, String frame, BlockState portal) {
        if (!l.getBlockState(start).isAir()) return false;
        for (net.minecraft.core.Direction.Axis ax : new net.minecraft.core.Direction.Axis[] { net.minecraft.core.Direction.Axis.X, net.minecraft.core.Direction.Axis.Z }) {
            net.minecraft.core.Direction right = ax == net.minecraft.core.Direction.Axis.X ? net.minecraft.core.Direction.EAST : net.minecraft.core.Direction.SOUTH;
            net.minecraft.core.Direction left = right.getOpposite();
            BlockPos b = start;
            for (int n = 0; n < 22 && l.getBlockState(b.below()).isAir(); n++) b = b.below();
            if (!anvilKeyOf(l.getBlockState(b.below()).getBlock()).equals(frame)) continue;
            for (int n = 0; n < 22 && l.getBlockState(b.relative(left)).isAir(); n++) b = b.relative(left);
            if (!anvilKeyOf(l.getBlockState(b.relative(left)).getBlock()).equals(frame)) continue;
            int w = 0;
            while (w < 22 && l.getBlockState(b.relative(right, w)).isAir()) w++;
            if (w < 2 || w > 21 || !anvilKeyOf(l.getBlockState(b.relative(right, w)).getBlock()).equals(frame)) continue;
            boolean ok = true;
            for (int x = 0; x < w && ok; x++) ok = anvilKeyOf(l.getBlockState(b.relative(right, x).below()).getBlock()).equals(frame);
            if (!ok) continue;
            int h = 0;
            while (h < 22) {
                boolean rowAir = true;
                for (int x = 0; x < w; x++) if (!l.getBlockState(b.relative(right, x).above(h)).isAir()) rowAir = false;
                if (!rowAir) break;
                if (!anvilKeyOf(l.getBlockState(b.relative(left).above(h)).getBlock()).equals(frame)) { ok = false; break; }
                if (!anvilKeyOf(l.getBlockState(b.relative(right, w).above(h)).getBlock()).equals(frame)) { ok = false; break; }
                h++;
            }
            if (!ok || h < 3 || h > 21) continue;
            for (int x = 0; x < w && ok; x++) ok = anvilKeyOf(l.getBlockState(b.relative(right, x).above(h)).getBlock()).equals(frame);
            if (!ok) continue;
            BlockState s = portal.setValue(AnvilPortalBlock.AXIS, ax);
            for (int x = 0; x < w; x++) for (int y = 0; y < h; y++) l.setBlock(b.relative(right, x).above(y), s, 18);
            return true;
        }
        return false;
    }

    private static void anvilPortalLight(net.neoforged.neoforge.event.entity.player.PlayerInteractEvent.RightClickBlock event) {
        if (!(event.getLevel() instanceof ServerLevel level)) return;
        String item = BuiltInRegistries.ITEM.getKey(event.getItemStack().getItem()).toString();
        String clicked = anvilKeyOf(level.getBlockState(event.getPos()).getBlock());
        for (String[] p : ANVIL_PORTALS.values()) {
            if (!p[1].equals(item) || !p[0].equals(clicked)) continue;
            BlockPos at = event.getPos().relative(event.getFace() != null ? event.getFace() : net.minecraft.core.Direction.UP);
            if (anvilPortalFill(level, at, p[0], anvilBlockOf(p[2]).defaultBlockState())) {
                event.setCanceled(true);
                Player player = event.getEntity();
                anvilCmd(level, player, "playsound minecraft:block.portal.trigger block @a " + at.getX() + " " + at.getY() + " " + at.getZ() + " 0.6 1.4");
                if (!player.getAbilities().instabuild && event.getItemStack().isDamageableItem()) event.getItemStack().setDamageValue(event.getItemStack().getDamageValue() + 1);
                else if (!player.getAbilities().instabuild && !event.getItemStack().isDamageableItem()) event.getItemStack().shrink(1);
                return;
            }
        }
    }

    /** Rahmen oder Portal abgebaut → alle verbundenen Portal-Blöcke entfernen */
    private static void anvilPortalBreak(net.neoforged.neoforge.event.level.BlockEvent.BreakEvent event) {
        if (!(event.getLevel() instanceof ServerLevel level)) return;
        BlockPos start = event.getPos();
        java.util.ArrayDeque<BlockPos> todo = new java.util.ArrayDeque<>();
        for (net.minecraft.core.Direction d : net.minecraft.core.Direction.values()) todo.add(start.relative(d));
        if (event.getState().getBlock() instanceof AnvilPortalBlock) todo.add(start);
        java.util.Set<BlockPos> seen = new java.util.HashSet<>();
        while (!todo.isEmpty() && seen.size() < 2000) {
            BlockPos p = todo.poll();
            if (!seen.add(p) || !(level.getBlockState(p).getBlock() instanceof AnvilPortalBlock)) continue;
            level.setBlock(p, net.minecraft.world.level.block.Blocks.AIR.defaultBlockState(), 18);
            for (net.minecraft.core.Direction d : net.minecraft.core.Direction.values()) todo.add(p.relative(d));
        }
    }

    private static void anvilPortalTick(net.neoforged.neoforge.event.tick.PlayerTickEvent.Post event) {
        Player player = event.getEntity();
        if (!(player.level() instanceof ServerLevel level)) return;
        java.util.UUID id = player.getUUID();
        BlockState here = level.getBlockState(player.blockPosition());
        if (!(here.getBlock() instanceof AnvilPortalBlock portal)) {
            ANVIL_PORTAL_TIME.remove(id);
            ANVIL_PORTAL_WAIT.remove(id);
            return;
        }
        if (ANVIL_PORTAL_WAIT.contains(id) || player.isPassenger()) return;
        int t = ANVIL_PORTAL_TIME.merge(id, 1, Integer::sum);
        if (t < (player.getAbilities().instabuild ? 10 : 60)) return;
        ANVIL_PORTAL_TIME.remove(id);
        ANVIL_PORTAL_WAIT.add(id);
        String[] p = ANVIL_PORTALS.get(portal.dim);
        if (p == null) return;
        ResourceKey<Level> key = ResourceKey.create(Registries.DIMENSION, ResourceLocation.parse(portal.dim));
        if (level.dimension() == key) key = Level.OVERWORLD;
        ServerLevel to = level.getServer().getLevel(key);
        if (to == null) return;
        int x = player.blockPosition().getX(), z = player.blockPosition().getZ();
        BlockPos dest = anvilFindPortal(to, x, z, portal);
        if (dest == null) {
            BlockPos feet = anvilArrive(to, x, z);
            dest = anvilBuildPortal(to, feet, p[0], here.getBlock().defaultBlockState());
        }
        anvilCmd(level, player, "execute in " + key.location() + " run tp @s " + (dest.getX() + 0.5) + " " + dest.getY() + " " + (dest.getZ() + 0.5));
        anvilCmd(to, player, "playsound minecraft:block.portal.travel ambient @s ~ ~ ~ 0.4 1");
    }

    /** Vorhandenes Portal in der Nähe des Ziels suchen */
    private static BlockPos anvilFindPortal(ServerLevel l, int x, int z, AnvilPortalBlock portal) {
        int min = l.dimensionType().minY(), max = min + l.dimensionType().height();
        BlockPos.MutableBlockPos m = new BlockPos.MutableBlockPos();
        BlockPos best = null;
        double bestD = Double.MAX_VALUE;
        for (int cx = (x - 16) >> 4; cx <= (x + 16) >> 4; cx++) for (int cz = (z - 16) >> 4; cz <= (z + 16) >> 4; cz++) l.getChunk(cx, cz);
        for (int dx = -16; dx <= 16; dx++) for (int dz = -16; dz <= 16; dz++) for (int y = min; y < max; y++) {
            m.set(x + dx, y, z + dz);
            if (l.getBlockState(m).getBlock() != portal || l.getBlockState(m.below()).getBlock() == portal) continue;
            double d = dx * dx + dz * dz;
            if (d < bestD) { bestD = d; best = m.immutable(); }
        }
        return best;
    }

    /** Rückportal bauen: Rahmen 4×5 mit Portal 2×3, davor und dahinter etwas Boden */
    private static BlockPos anvilBuildPortal(ServerLevel l, BlockPos feet, String frame, BlockState portal) {
        net.minecraft.world.level.block.Block f = anvilBlockOf(frame);
        if (f == null || f == net.minecraft.world.level.block.Blocks.AIR) f = net.minecraft.world.level.block.Blocks.CRYING_OBSIDIAN;
        BlockState air = net.minecraft.world.level.block.Blocks.AIR.defaultBlockState();
        for (int dx = -1; dx <= 2; dx++) for (int dz = -1; dz <= 1; dz++) {
            if (dz == 0) continue;
            BlockPos g = feet.offset(dx, -1, dz);
            if (l.getBlockState(g).getCollisionShape(l, g).isEmpty()) l.setBlockAndUpdate(g, f.defaultBlockState());
            for (int dy = 0; dy <= 2; dy++) l.setBlockAndUpdate(feet.offset(dx, dy, dz), air);
        }
        for (int dx = -1; dx <= 2; dx++) for (int dy = -1; dy <= 3; dy++) {
            boolean edge = dx == -1 || dx == 2 || dy == -1 || dy == 3;
            l.setBlock(feet.offset(dx, dy, 0), edge ? f.defaultBlockState() : portal.setValue(AnvilPortalBlock.AXIS, net.minecraft.core.Direction.Axis.X), 18);
        }
        return feet;
    }
"#;

/// Blockzustand, Modell und animierte Textur für jedes Portal
pub fn portal_assets(d: &DimDef, modid: &str) -> (Value, Value, Vec<u8>, Value) {
    let id = block_id(d);
    let m = format!("{modid}:block/{id}");
    let blockstate = json!({ "variants": {
        "axis=x": { "model": m },
        "axis=z": { "model": m, "y": 90 }
    } });
    let tex = format!("{modid}:block/{id}");
    let face = json!({ "texture": "#portal", "tintindex": -1 });
    let model = json!({
        "parent": "minecraft:block/block",
        "render_type": "minecraft:translucent",
        "ambientocclusion": false,
        "textures": { "particle": tex, "portal": tex },
        "elements": [{ "from": [0, 0, 6], "to": [16, 16, 10], "faces": { "north": face, "south": face } }]
    });
    let (r, g, b) = color(d);
    const FRAMES: u32 = 16;
    let png = crate::content::png_rgba_pub(16, 16 * FRAMES, |x, y| {
        let f = (y / 16) as f64;
        let (fx, fy) = (x as f64 - 7.5, (y % 16) as f64 - 7.5);
        let ang = fy.atan2(fx);
        let dist = (fx * fx + fy * fy).sqrt();
        let swirl = ((ang * 3.0 + dist * 0.9 - f * std::f64::consts::PI * 2.0 / FRAMES as f64 * 3.0).sin() + 1.0) / 2.0;
        let noise = (((x * 7 + (y % 16) * 13 + (y / 16) * 5) % 11) as f64) / 11.0;
        let k = 0.55 + 0.35 * swirl + 0.1 * noise;
        let ch = |c: u8| ((c as f64) * k + 40.0 * swirl).min(255.0) as u8;
        [ch(r), ch(g), ch(b), 190]
    });
    let mcmeta = json!({ "animation": { "frametime": 2 } });
    (blockstate, model, png, mcmeta)
}
