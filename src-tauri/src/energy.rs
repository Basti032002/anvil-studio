//! Strom (Forge Energy / RF): Generatoren, Akkus, Kabel und elektrische Maschinen.
//! Bis 1.21.8 über IEnergyStorage, ab 1.21.9 über EnergyHandler mit Transaktionen.

use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase", default)]
pub struct EnergyDef {
    /// Speicher in FE
    pub capacity: u32,
    /// höchstens so viel FE pro Tick rein/raus
    pub rate: u32,
    /// Generator: FE pro Tick
    pub generate: u32,
    /// Generator: fuel | solar | redstone | always
    pub source: String,
    /// elektrische Maschine: FE pro Tick beim Arbeiten
    pub use_per_tick: u32,
}

impl Default for EnergyDef {
    fn default() -> Self {
        Self { capacity: 10000, rate: 200, generate: 20, source: "fuel".into(), use_per_tick: 20 }
    }
}

pub struct EnergyApi {
    /// ab 1.21.9: EnergyHandler + Transaktionen
    pub handler: bool,
    pub value_io: bool,
    pub props_tools: bool,
    pub materials_v2: bool,
}

/// Gemeinsame Klassen und Hilfsfunktionen (Speicher, Seiten-Zugriff, Nachbarn versorgen)
pub fn helpers(api: &EnergyApi) -> String {
    let (cap_class, journal, send, at, add, take, has) = if api.handler {
        (
            r#"    /** Zugriff von einer Seite (andere Mods, Kabel) */
    public static class AnvilEnergyCap implements net.neoforged.neoforge.transfer.energy.EnergyHandler {
        final AnvilEnergy e;
        final boolean in, out;

        AnvilEnergyCap(AnvilEnergy e, boolean in, boolean out) {
            this.e = e;
            this.in = in;
            this.out = out;
        }

        @Override
        public long getAmountAsLong() {
            return e.energy;
        }

        @Override
        public long getCapacityAsLong() {
            return e.capacity;
        }

        @Override
        public int insert(int amount, net.neoforged.neoforge.transfer.transaction.TransactionContext tx) {
            if (!in || amount <= 0) return 0;
            int n = Math.min(amount, Math.min(e.maxIn, e.capacity - e.energy));
            if (n <= 0) return 0;
            e.journal.updateSnapshots(tx);
            e.energy += n;
            return n;
        }

        @Override
        public int extract(int amount, net.neoforged.neoforge.transfer.transaction.TransactionContext tx) {
            if (!out || amount <= 0) return 0;
            int n = Math.min(amount, Math.min(e.maxOut, e.energy));
            if (n <= 0) return 0;
            e.journal.updateSnapshots(tx);
            e.energy -= n;
            return n;
        }
    }
"#,
            r#"        final net.neoforged.neoforge.transfer.transaction.SnapshotJournal<Integer> journal = new net.neoforged.neoforge.transfer.transaction.SnapshotJournal<>() {
            @Override
            protected Integer createSnapshot() {
                return energy;
            }

            @Override
            protected void revertToSnapshot(Integer snapshot) {
                energy = snapshot;
            }

            @Override
            protected void onRootCommit(Integer original) {
                if (energy != original) changed.run();
            }
        };
"#,
            r#"    /** FE an einen Nachbarn geben, gibt die angenommene Menge zurück */
    static int anvilSendEnergy(Level level, BlockPos to, net.minecraft.core.Direction side, int amount) {
        if (amount <= 0) return 0;
        net.neoforged.neoforge.transfer.energy.EnergyHandler t = level.getCapability(net.neoforged.neoforge.capabilities.Capabilities.Energy.BLOCK, to, side);
        if (t == null) return 0;
        try (net.neoforged.neoforge.transfer.transaction.Transaction tx = net.neoforged.neoforge.transfer.transaction.Transaction.openRoot()) {
            int n = t.insert(amount, tx);
            tx.commit();
            return n;
        }
    }
"#,
            r#"    static int anvilEnergyAt(Level level, BlockPos pos) {
        net.neoforged.neoforge.transfer.energy.EnergyHandler t = level.getCapability(net.neoforged.neoforge.capabilities.Capabilities.Energy.BLOCK, pos, null);
        return t == null ? 0 : t.getAmountAsInt();
    }
"#,
            r#"    static int anvilEnergyAdd(Level level, BlockPos pos, int amount) {
        return anvilSendEnergy(level, pos, null, amount);
    }
"#,
            r#"    static int anvilEnergyTake(Level level, BlockPos pos, int amount) {
        net.neoforged.neoforge.transfer.energy.EnergyHandler t = level.getCapability(net.neoforged.neoforge.capabilities.Capabilities.Energy.BLOCK, pos, null);
        if (t == null || amount <= 0) return 0;
        try (net.neoforged.neoforge.transfer.transaction.Transaction tx = net.neoforged.neoforge.transfer.transaction.Transaction.openRoot()) {
            int n = t.extract(amount, tx);
            tx.commit();
            return n;
        }
    }
"#,
            r#"    static boolean anvilHasEnergy(Level level, BlockPos pos, net.minecraft.core.Direction side) {
        return level.getCapability(net.neoforged.neoforge.capabilities.Capabilities.Energy.BLOCK, pos, side) != null;
    }
"#,
        )
    } else {
        (
            r#"    /** Zugriff von einer Seite (andere Mods, Kabel) */
    public static class AnvilEnergyCap implements net.neoforged.neoforge.energy.IEnergyStorage {
        final AnvilEnergy e;
        final boolean in, out;

        AnvilEnergyCap(AnvilEnergy e, boolean in, boolean out) {
            this.e = e;
            this.in = in;
            this.out = out;
        }

        @Override
        public int receiveEnergy(int amount, boolean simulate) {
            if (!in || amount <= 0) return 0;
            int n = Math.min(amount, Math.min(e.maxIn, e.capacity - e.energy));
            if (n > 0 && !simulate) e.add(n);
            return Math.max(0, n);
        }

        @Override
        public int extractEnergy(int amount, boolean simulate) {
            if (!out || amount <= 0) return 0;
            int n = Math.min(amount, Math.min(e.maxOut, e.energy));
            if (n > 0 && !simulate) e.take(n);
            return Math.max(0, n);
        }

        @Override
        public int getEnergyStored() {
            return e.energy;
        }

        @Override
        public int getMaxEnergyStored() {
            return e.capacity;
        }

        @Override
        public boolean canExtract() {
            return out;
        }

        @Override
        public boolean canReceive() {
            return in;
        }
    }
"#,
            "",
            r#"    /** FE an einen Nachbarn geben, gibt die angenommene Menge zurück */
    static int anvilSendEnergy(Level level, BlockPos to, net.minecraft.core.Direction side, int amount) {
        if (amount <= 0) return 0;
        net.neoforged.neoforge.energy.IEnergyStorage t = level.getCapability(net.neoforged.neoforge.capabilities.Capabilities.EnergyStorage.BLOCK, to, side);
        if (t == null || !t.canReceive()) return 0;
        return t.receiveEnergy(amount, false);
    }
"#,
            r#"    static int anvilEnergyAt(Level level, BlockPos pos) {
        net.neoforged.neoforge.energy.IEnergyStorage t = level.getCapability(net.neoforged.neoforge.capabilities.Capabilities.EnergyStorage.BLOCK, pos, null);
        return t == null ? 0 : t.getEnergyStored();
    }
"#,
            r#"    static int anvilEnergyAdd(Level level, BlockPos pos, int amount) {
        return anvilSendEnergy(level, pos, null, amount);
    }
"#,
            r#"    static int anvilEnergyTake(Level level, BlockPos pos, int amount) {
        net.neoforged.neoforge.energy.IEnergyStorage t = level.getCapability(net.neoforged.neoforge.capabilities.Capabilities.EnergyStorage.BLOCK, pos, null);
        if (t == null || amount <= 0) return 0;
        return t.extractEnergy(amount, false);
    }
"#,
            r#"    static boolean anvilHasEnergy(Level level, BlockPos pos, net.minecraft.core.Direction side) {
        return level.getCapability(net.neoforged.neoforge.capabilities.Capabilities.EnergyStorage.BLOCK, pos, side) != null;
    }
"#,
        )
    };
    format!(
        r#"
    // ---- Strom (Forge Energy) ----
    /** Energiespeicher eines Blocks */
    public static class AnvilEnergy {{
        int energy, capacity, maxIn, maxOut;
        final Runnable changed;
{journal}
        public AnvilEnergy(int capacity, int maxIn, int maxOut, Runnable changed) {{
            this.capacity = Math.max(0, capacity);
            this.maxIn = Math.max(0, maxIn);
            this.maxOut = Math.max(0, maxOut);
            this.changed = changed;
        }}

        public int get() {{
            return energy;
        }}

        public int capacity() {{
            return capacity;
        }}

        public void set(int e) {{
            energy = Math.max(0, Math.min(capacity, e));
        }}

        public int add(int n) {{
            int a = Math.max(0, Math.min(capacity - energy, n));
            energy += a;
            if (a > 0) changed.run();
            return a;
        }}

        public int take(int n) {{
            int a = Math.max(0, Math.min(energy, n));
            energy -= a;
            if (a > 0) changed.run();
            return a;
        }}

        /** Für Oberflächen: Wert in 16-Bit-Stücken (Datenplätze sind klein) */
        public int slot(int i) {{
            return switch (i) {{
                case 0 -> energy & 0xFFFF;
                case 1 -> energy >>> 16;
                case 2 -> capacity & 0xFFFF;
                default -> capacity >>> 16;
            }};
        }}
    }}

{cap_class}
{send}
{at}
{add}
{take}
{has}
    /** An alle Nachbarn verteilen (höchstens rate pro Tick) */
    static void anvilPushAll(Level level, BlockPos pos, AnvilEnergy e, int rate) {{
        int left = Math.min(rate, e.get());
        for (net.minecraft.core.Direction d : net.minecraft.core.Direction.values()) {{
            if (left <= 0) return;
            int n = anvilSendEnergy(level, pos.relative(d), d.getOpposite(), left);
            e.take(n);
            left -= n;
        }}
    }}

    static String anvilFe(int v) {{
        return v >= 1_000_000 ? String.format("%.1fM", v / 1_000_000.0) : v >= 10_000 ? String.format("%.1fk", v / 1000.0) : String.valueOf(v);
    }}
"#
    )
}

/// Speichern/Laden: (Schlüssel, Ausdruck zum Lesen, Anweisung zum Setzen mit {v})
pub fn save_load(api: &EnergyApi, fields: &[(&str, &str, &str)], items: bool) -> String {
    if api.value_io {
        let load: String = fields.iter().map(|(k, _, set)| format!("            {};\n", set.replace("{v}", &format!("input.getIntOr(\"{k}\", 0)")))).collect();
        let save: String = fields.iter().map(|(k, get, _)| format!("            output.putInt(\"{k}\", {get});\n")).collect();
        let il = if items { "            items = NonNullList.withSize(3, ItemStack.EMPTY);\n            ContainerHelper.loadAllItems(input, items);\n" } else { "" };
        let is = if items { "            ContainerHelper.saveAllItems(output, items);\n" } else { "" };
        format!(
            "        @Override\n        protected void loadAdditional(net.minecraft.world.level.storage.ValueInput input) {{\n            super.loadAdditional(input);\n{il}{load}        }}\n\n        @Override\n        protected void saveAdditional(net.minecraft.world.level.storage.ValueOutput output) {{\n            super.saveAdditional(output);\n{is}{save}        }}\n"
        )
    } else {
        let get = |k: &str| if api.props_tools { format!("tag.getIntOr(\"{k}\", 0)") } else { format!("tag.getInt(\"{k}\")") };
        let load: String = fields.iter().map(|(k, _, set)| format!("            {};\n", set.replace("{v}", &get(k)))).collect();
        let save: String = fields.iter().map(|(k, g, _)| format!("            tag.putInt(\"{k}\", {g});\n")).collect();
        let il = if items { "            items = NonNullList.withSize(3, ItemStack.EMPTY);\n            ContainerHelper.loadAllItems(tag, items, registries);\n" } else { "" };
        let is = if items { "            ContainerHelper.saveAllItems(tag, items, registries);\n" } else { "" };
        format!(
            "        @Override\n        protected void loadAdditional(net.minecraft.nbt.CompoundTag tag, net.minecraft.core.HolderLookup.Provider registries) {{\n            super.loadAdditional(tag, registries);\n{il}{load}        }}\n\n        @Override\n        protected void saveAdditional(net.minecraft.nbt.CompoundTag tag, net.minecraft.core.HolderLookup.Provider registries) {{\n            super.saveAdditional(tag, registries);\n{is}{save}        }}\n"
        )
    }
}

pub struct PowerBlock {
    pub id: String,
    /// battery | generator | cable
    pub kind: String,
    pub e: EnergyDef,
    pub gui: String,
}

/// Generator-, Akku- und Kabel-Blöcke mit gemeinsamem Block-Entity
pub fn power_java(api: &EnergyApi, blocks: &[PowerBlock], be_ctor: &str, on_remove: &str) -> (String, String) {
    let mut cfg = String::new();
    for b in blocks {
        let src = match b.e.source.as_str() {
            "solar" | "redstone" | "always" => b.e.source.as_str(),
            _ => "fuel",
        };
        cfg.push_str(&format!(
            "java.util.Map.entry(\"{}\", new AnvilPower(\"{}\", {}, {}, {}, \"{src}\", \"{}\")), ",
            b.id,
            b.kind,
            b.e.capacity.clamp(1, 2_000_000_000),
            b.e.rate.clamp(1, 1_000_000_000),
            b.e.generate.min(1_000_000_000),
            b.gui
        ));
    }
    let cfg = cfg.trim_end_matches(", ");
    let burn = if api.materials_v2 { "level.fuelValues().burnDuration(stack)" } else { "stack.getBurnTime(net.minecraft.world.item.crafting.RecipeType.SMELTING)" };
    let fields = format!("    public static final DeferredHolder<BlockEntityType<?>, BlockEntityType<AnvilPowerBlockEntity>> POWER_BE = BLOCK_ENTITIES.register(\"power\", () -> {be_ctor});\n\n");
    let cap = if api.handler { "net.neoforged.neoforge.capabilities.Capabilities.Energy.BLOCK" } else { "net.neoforged.neoforge.capabilities.Capabilities.EnergyStorage.BLOCK" };
    let saves = save_load(api, &[("AnvilLit", "litTime", "litTime = {v}"), ("AnvilLitTotal", "litDuration", "litDuration = {v}"), ("AnvilEnergy", "energy.get()", "energy.set({v})")], true);
    let methods = format!(
        r##"
    public record AnvilPower(String kind, int capacity, int rate, int gen, String source, String gui) {{}}

    static final java.util.Map<String, AnvilPower> ANVIL_POWER = java.util.Map.ofEntries({cfg});

    static AnvilPower anvilPower(net.minecraft.world.level.block.Block block) {{
        return ANVIL_POWER.getOrDefault(anvilBlockKey(block), new AnvilPower("battery", 10000, 100, 0, "fuel", ""));
    }}

    static void anvilPowerRegisterCaps(net.neoforged.neoforge.capabilities.RegisterCapabilitiesEvent event) {{
        event.registerBlockEntity({cap}, POWER_BE.get(), (be, side) -> be.cap(side));
    }}

    /** Gemeinsame Bedienung: Oberfläche öffnen, Brennstoff einlegen oder Füllstand zeigen */
    static InteractionResult anvilPowerUse(BlockState state, Level level, BlockPos pos, Player player) {{
        if (level.isClientSide() || !(level.getBlockEntity(pos) instanceof AnvilPowerBlockEntity be)) return InteractionResult.SUCCESS;
        AnvilPower cfg = anvilPower(state.getBlock());
        ItemStack hand = player.getMainHandItem();
        if (cfg.kind().equals("generator") && cfg.source().equals("fuel") && !hand.isEmpty() && AnvilPowerBlockEntity.burnTime(level, hand) > 0) {{
            ItemStack slot = be.items.get(1);
            if (slot.isEmpty()) {{
                be.items.set(1, hand.split(hand.getCount()));
            }} else if (ItemStack.isSameItemSameComponents(slot, hand)) {{
                int n = Math.min(hand.getCount(), slot.getMaxStackSize() - slot.getCount());
                slot.grow(n);
                hand.shrink(n);
            }}
            be.setChanged();
            return InteractionResult.SUCCESS;
        }}
        if (!cfg.gui().isEmpty() && player instanceof net.minecraft.server.level.ServerPlayer sp && anvilPowerGui(sp, cfg.gui(), be, be.guiData, pos, state.getBlock().getName())) {{
            return InteractionResult.SUCCESS;
        }}
        String extra = cfg.kind().equals("generator") ? (be.producing ? " · +" + cfg.gen() + " FE/t" : " · idle") : "";
        player.displayClientMessage(Component.literal(state.getBlock().getName().getString() + ": " + anvilFe(be.energy.get()) + " / " + anvilFe(be.energy.capacity()) + " FE" + extra), true);
        return InteractionResult.SUCCESS;
    }}

    /** Generator: erzeugt Strom und gibt ihn an alle Nachbarn ab */
    public static class AnvilGeneratorBlock extends BaseEntityBlock {{
        public static final MapCodec<AnvilGeneratorBlock> CODEC = simpleCodec(AnvilGeneratorBlock::new);

        public AnvilGeneratorBlock(BlockBehaviour.Properties properties) {{
            super(properties);
        }}

        @Override
        protected MapCodec<? extends BaseEntityBlock> codec() {{
            return CODEC;
        }}

        @Override
        protected RenderShape getRenderShape(BlockState state) {{
            return RenderShape.MODEL;
        }}

        @Override
        public BlockEntity newBlockEntity(BlockPos pos, BlockState state) {{
            return new AnvilPowerBlockEntity(pos, state);
        }}

        @Override
        public <T extends BlockEntity> net.minecraft.world.level.block.entity.BlockEntityTicker<T> getTicker(Level level, BlockState state, BlockEntityType<T> type) {{
            return level.isClientSide() ? null : createTickerHelper(type, POWER_BE.get(), AnvilPowerBlockEntity::serverTick);
        }}

        @Override
        protected InteractionResult useWithoutItem(BlockState state, Level level, BlockPos pos, Player player, BlockHitResult hit) {{
            return anvilPowerUse(state, level, pos, player);
        }}
{on_remove}    }}

    /** Akku: nimmt an allen Seiten Strom an und gibt ihn vorne wieder ab */
    public static class AnvilBatteryBlock extends BaseEntityBlock {{
        public static final MapCodec<AnvilBatteryBlock> CODEC = simpleCodec(AnvilBatteryBlock::new);

        public AnvilBatteryBlock(BlockBehaviour.Properties properties) {{
            super(properties);
            registerDefaultState(stateDefinition.any().setValue(net.minecraft.world.level.block.HorizontalDirectionalBlock.FACING, net.minecraft.core.Direction.NORTH));
        }}

        @Override
        protected MapCodec<? extends BaseEntityBlock> codec() {{
            return CODEC;
        }}

        @Override
        protected void createBlockStateDefinition(net.minecraft.world.level.block.state.StateDefinition.Builder<net.minecraft.world.level.block.Block, BlockState> builder) {{
            builder.add(net.minecraft.world.level.block.HorizontalDirectionalBlock.FACING);
        }}

        @Override
        public BlockState getStateForPlacement(net.minecraft.world.item.context.BlockPlaceContext context) {{
            return defaultBlockState().setValue(net.minecraft.world.level.block.HorizontalDirectionalBlock.FACING, context.getHorizontalDirection().getOpposite());
        }}

        @Override
        protected RenderShape getRenderShape(BlockState state) {{
            return RenderShape.MODEL;
        }}

        @Override
        public BlockEntity newBlockEntity(BlockPos pos, BlockState state) {{
            return new AnvilPowerBlockEntity(pos, state);
        }}

        @Override
        public <T extends BlockEntity> net.minecraft.world.level.block.entity.BlockEntityTicker<T> getTicker(Level level, BlockState state, BlockEntityType<T> type) {{
            return level.isClientSide() ? null : createTickerHelper(type, POWER_BE.get(), AnvilPowerBlockEntity::serverTick);
        }}

        @Override
        protected InteractionResult useWithoutItem(BlockState state, Level level, BlockPos pos, Player player, BlockHitResult hit) {{
            return anvilPowerUse(state, level, pos, player);
        }}
{on_remove}    }}

    /** Kabel: verbindet sich mit allem, was Strom hat, und gleicht den Füllstand aus */
    public static class AnvilCableBlock extends BaseEntityBlock {{
        public static final MapCodec<AnvilCableBlock> CODEC = simpleCodec(AnvilCableBlock::new);
        static final net.minecraft.world.level.block.state.properties.BooleanProperty[] SIDES = {{
            net.minecraft.world.level.block.state.properties.BlockStateProperties.DOWN,
            net.minecraft.world.level.block.state.properties.BlockStateProperties.UP,
            net.minecraft.world.level.block.state.properties.BlockStateProperties.NORTH,
            net.minecraft.world.level.block.state.properties.BlockStateProperties.SOUTH,
            net.minecraft.world.level.block.state.properties.BlockStateProperties.WEST,
            net.minecraft.world.level.block.state.properties.BlockStateProperties.EAST
        }};
        private static final net.minecraft.world.phys.shapes.VoxelShape CORE = net.minecraft.world.level.block.Block.box(5, 5, 5, 11, 11, 11);

        public AnvilCableBlock(BlockBehaviour.Properties properties) {{
            super(properties);
            BlockState s = stateDefinition.any();
            for (var p : SIDES) s = s.setValue(p, false);
            registerDefaultState(s);
        }}

        @Override
        protected MapCodec<? extends BaseEntityBlock> codec() {{
            return CODEC;
        }}

        @Override
        protected void createBlockStateDefinition(net.minecraft.world.level.block.state.StateDefinition.Builder<net.minecraft.world.level.block.Block, BlockState> builder) {{
            builder.add(SIDES);
        }}

        static BlockState connect(Level level, BlockPos pos, BlockState state) {{
            for (net.minecraft.core.Direction d : net.minecraft.core.Direction.values()) {{
                BlockPos np = pos.relative(d);
                boolean c = level.getBlockState(np).getBlock() instanceof AnvilCableBlock || anvilHasEnergy(level, np, d.getOpposite());
                state = state.setValue(SIDES[d.ordinal()], c);
            }}
            return state;
        }}

        @Override
        public BlockState getStateForPlacement(net.minecraft.world.item.context.BlockPlaceContext context) {{
            return connect(context.getLevel(), context.getClickedPos(), defaultBlockState());
        }}

        @Override
        protected net.minecraft.world.phys.shapes.VoxelShape getShape(BlockState state, net.minecraft.world.level.BlockGetter level, BlockPos pos, net.minecraft.world.phys.shapes.CollisionContext context) {{
            net.minecraft.world.phys.shapes.VoxelShape s = CORE;
            if (state.getValue(SIDES[0])) s = net.minecraft.world.phys.shapes.Shapes.or(s, net.minecraft.world.level.block.Block.box(5, 0, 5, 11, 5, 11));
            if (state.getValue(SIDES[1])) s = net.minecraft.world.phys.shapes.Shapes.or(s, net.minecraft.world.level.block.Block.box(5, 11, 5, 11, 16, 11));
            if (state.getValue(SIDES[2])) s = net.minecraft.world.phys.shapes.Shapes.or(s, net.minecraft.world.level.block.Block.box(5, 5, 0, 11, 11, 5));
            if (state.getValue(SIDES[3])) s = net.minecraft.world.phys.shapes.Shapes.or(s, net.minecraft.world.level.block.Block.box(5, 5, 11, 11, 11, 16));
            if (state.getValue(SIDES[4])) s = net.minecraft.world.phys.shapes.Shapes.or(s, net.minecraft.world.level.block.Block.box(0, 5, 5, 5, 11, 11));
            if (state.getValue(SIDES[5])) s = net.minecraft.world.phys.shapes.Shapes.or(s, net.minecraft.world.level.block.Block.box(11, 5, 5, 16, 11, 11));
            return s;
        }}

        @Override
        protected RenderShape getRenderShape(BlockState state) {{
            return RenderShape.MODEL;
        }}

        @Override
        public BlockEntity newBlockEntity(BlockPos pos, BlockState state) {{
            return new AnvilPowerBlockEntity(pos, state);
        }}

        @Override
        public <T extends BlockEntity> net.minecraft.world.level.block.entity.BlockEntityTicker<T> getTicker(Level level, BlockState state, BlockEntityType<T> type) {{
            return level.isClientSide() ? null : createTickerHelper(type, POWER_BE.get(), AnvilPowerBlockEntity::serverTick);
        }}

        @Override
        protected InteractionResult useWithoutItem(BlockState state, Level level, BlockPos pos, Player player, BlockHitResult hit) {{
            return anvilPowerUse(state, level, pos, player);
        }}
    }}

    public static class AnvilPowerBlockEntity extends net.minecraft.world.level.block.entity.BaseContainerBlockEntity {{
        NonNullList<ItemStack> items = NonNullList.withSize(3, ItemStack.EMPTY);
        int litTime, litDuration;
        boolean producing;
        final AnvilEnergy energy;
        final AnvilPower cfg;
        final net.minecraft.world.inventory.ContainerData guiData = new net.minecraft.world.inventory.ContainerData() {{
            @Override
            public int get(int index) {{
                return switch (index) {{
                    case 0 -> litTime;
                    case 1 -> litDuration;
                    case 2, 3 -> 0;
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

        public AnvilPowerBlockEntity(BlockPos pos, BlockState state) {{
            super(POWER_BE.get(), pos, state);
            cfg = anvilPower(state.getBlock());
            int in = cfg.kind().equals("generator") ? 0 : cfg.rate();
            energy = new AnvilEnergy(cfg.capacity(), in, cfg.rate(), this::setChanged);
        }}

        /** Seitenzugriff: Akku gibt nur vorne ab und nimmt vorne nichts an */
        public AnvilEnergyCap cap(net.minecraft.core.Direction side) {{
            if (cfg.kind().equals("battery") && side != null) {{
                boolean front = getBlockState().hasProperty(net.minecraft.world.level.block.HorizontalDirectionalBlock.FACING) && getBlockState().getValue(net.minecraft.world.level.block.HorizontalDirectionalBlock.FACING) == side;
                return new AnvilEnergyCap(energy, !front, front);
            }}
            return new AnvilEnergyCap(energy, !cfg.kind().equals("generator"), true);
        }}

        static int burnTime(Level level, ItemStack stack) {{
            return stack.isEmpty() ? 0 : {burn};
        }}

        @Override
        public int getContainerSize() {{
            return 3;
        }}

        @Override
        protected NonNullList<ItemStack> getItems() {{
            return items;
        }}

        @Override
        protected void setItems(NonNullList<ItemStack> items) {{
            this.items = items;
        }}

        @Override
        protected Component getDefaultName() {{
            return getBlockState().getBlock().getName();
        }}

        @Override
        protected net.minecraft.world.inventory.AbstractContainerMenu createMenu(int id, net.minecraft.world.entity.player.Inventory inventory) {{
            return new net.minecraft.world.inventory.FurnaceMenu(id, inventory, this, new net.minecraft.world.inventory.SimpleContainerData(4));
        }}

        public static void serverTick(Level level, BlockPos pos, BlockState state, AnvilPowerBlockEntity be) {{
            AnvilPower cfg = be.cfg;
            switch (cfg.kind()) {{
                case "generator" -> {{
                    boolean on = switch (cfg.source()) {{
                        case "solar" -> (level.getDayTime() % 24000L < 12300L || level.getDayTime() % 24000L > 23850L) && level.canSeeSky(pos.above()) && !level.isRaining();
                        case "redstone" -> level.hasNeighborSignal(pos);
                        case "always" -> true;
                        default -> false;
                    }};
                    if (cfg.source().equals("fuel")) {{
                        if (be.litTime > 0) be.litTime--;
                        if (be.litTime <= 0 && be.energy.get() < be.energy.capacity()) {{
                            ItemStack fuel = be.items.get(1);
                            int burn = burnTime(level, fuel);
                            if (burn > 0) {{
                                be.litTime = be.litDuration = burn;
                                boolean bucket = fuel.is(net.minecraft.world.item.Items.LAVA_BUCKET);
                                fuel.shrink(1);
                                if (bucket) be.items.set(1, new ItemStack(net.minecraft.world.item.Items.BUCKET));
                                be.setChanged();
                            }}
                        }}
                        on = be.litTime > 0;
                    }}
                    be.producing = on && be.energy.get() < be.energy.capacity();
                    if (on) be.energy.add(cfg.gen());
                    anvilPushAll(level, pos, be.energy, cfg.rate());
                }}
                case "battery" -> {{
                    if (state.hasProperty(net.minecraft.world.level.block.HorizontalDirectionalBlock.FACING)) {{
                        net.minecraft.core.Direction d = state.getValue(net.minecraft.world.level.block.HorizontalDirectionalBlock.FACING);
                        be.energy.take(anvilSendEnergy(level, pos.relative(d), d.getOpposite(), Math.min(cfg.rate(), be.energy.get())));
                    }}
                }}
                case "cable" -> {{
                    if (level.getGameTime() % 10 == pos.asLong() % 10 && state.getBlock() instanceof AnvilCableBlock) {{
                        BlockState c = AnvilCableBlock.connect(level, pos, state);
                        if (c != state) level.setBlock(pos, c, 3);
                    }}
                    for (net.minecraft.core.Direction d : net.minecraft.core.Direction.values()) {{
                        if (be.energy.get() <= 0) break;
                        BlockPos np = pos.relative(d);
                        if (level.getBlockEntity(np) instanceof AnvilPowerBlockEntity other && other.cfg.kind().equals("cable")) {{
                            int diff = (be.energy.get() - other.energy.get()) / 2;
                            if (diff > 0) be.energy.take(other.energy.add(Math.min(diff, cfg.rate())));
                        }} else {{
                            be.energy.take(anvilSendEnergy(level, np, d.getOpposite(), Math.min(cfg.rate(), be.energy.get())));
                        }}
                    }}
                }}
                default -> {{}}
            }}
        }}

{saves}    }}
"##
    );
    (fields, methods)
}

/// Seiten-Modelle für Kabel (Kern + Arm nach Norden, gedreht per Blockstate)
pub fn cable_models(tex: &str) -> (serde_json::Value, serde_json::Value, serde_json::Value) {
    use serde_json::json;
    let faces = |uv: [i32; 4]| {
        let mut m = serde_json::Map::new();
        for f in ["north", "south", "east", "west", "up", "down"] {
            m.insert(f.into(), json!({ "uv": uv, "texture": "#t" }));
        }
        serde_json::Value::Object(m)
    };
    let core = json!({ "parent": "minecraft:block/block", "textures": { "t": tex, "particle": tex }, "elements": [{ "from": [5, 5, 5], "to": [11, 11, 11], "faces": faces([5, 5, 11, 11]) }] });
    let side = json!({ "parent": "minecraft:block/block", "textures": { "t": tex, "particle": tex }, "elements": [{ "from": [5, 5, 0], "to": [11, 11, 5], "faces": faces([5, 0, 11, 5]) }] });
    let inv = json!({ "parent": "minecraft:block/block", "textures": { "t": tex, "particle": tex }, "elements": [{ "from": [5, 5, 0], "to": [11, 11, 16], "faces": faces([5, 0, 11, 16]) }],
        "display": { "gui": { "rotation": [30, 225, 0], "scale": [0.8, 0.8, 0.8] } } });
    (core, side, inv)
}

pub fn cable_blockstate(m: &str) -> serde_json::Value {
    use serde_json::json;
    json!({ "multipart": [
        { "apply": { "model": format!("{m}_core") } },
        { "when": { "north": "true" }, "apply": { "model": format!("{m}_side") } },
        { "when": { "east": "true" }, "apply": { "model": format!("{m}_side"), "y": 90 } },
        { "when": { "south": "true" }, "apply": { "model": format!("{m}_side"), "y": 180 } },
        { "when": { "west": "true" }, "apply": { "model": format!("{m}_side"), "y": 270 } },
        { "when": { "up": "true" }, "apply": { "model": format!("{m}_side"), "x": 270 } },
        { "when": { "down": "true" }, "apply": { "model": format!("{m}_side"), "x": 90 } }
    ] })
}
