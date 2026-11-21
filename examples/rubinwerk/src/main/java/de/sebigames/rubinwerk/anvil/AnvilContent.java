// =============================================================================
// AUTOMATISCH ERZEUGT von Anvil Studio – Änderungen in dieser Datei werden beim
// nächsten Speichern im Inhalte-Editor überschrieben. Eigenen Code bitte in
// andere Klassen schreiben.
// =============================================================================
package de.sebigames.rubinwerk.anvil;

import java.util.*;
import net.minecraft.core.registries.Registries;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceKey;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.tags.BlockTags;
import net.minecraft.tags.TagKey;
import net.minecraft.util.valueproviders.UniformInt;
import net.minecraft.world.food.FoodProperties;
import net.minecraft.world.item.*;
import net.minecraft.world.item.crafting.Ingredient;
import net.minecraft.world.level.block.*;
import net.minecraft.world.level.block.state.BlockBehaviour;
import net.minecraft.world.level.block.state.properties.BlockSetType;
import net.minecraft.world.level.material.MapColor;
import net.neoforged.bus.api.IEventBus;
import net.neoforged.neoforge.registries.DeferredBlock;
import net.neoforged.neoforge.registries.DeferredHolder;
import net.neoforged.neoforge.registries.DeferredItem;
import net.neoforged.neoforge.registries.DeferredRegister;
import net.minecraft.Util;
import net.neoforged.neoforge.common.SimpleTier;
import net.minecraft.core.BlockPos;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.entity.BlockEntityType;
import com.mojang.serialization.MapCodec;
import net.minecraft.core.NonNullList;
import net.minecraft.world.Container;
import net.minecraft.world.Containers;
import net.minecraft.world.ContainerHelper;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.player.Inventory;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.inventory.AbstractContainerMenu;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.core.Holder;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.world.effect.MobEffect;
import net.neoforged.neoforge.common.NeoForge;
import net.minecraft.world.item.ItemStack;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.phys.Vec3;
import net.neoforged.neoforge.event.ServerChatEvent;
import net.neoforged.neoforge.event.entity.living.LivingDeathEvent;
import net.neoforged.neoforge.event.entity.living.LivingEntityUseItemEvent;
import net.neoforged.neoforge.event.entity.living.LivingEvent;
import net.neoforged.neoforge.event.entity.living.LivingIncomingDamageEvent;
import net.neoforged.neoforge.event.entity.player.PlayerEvent;
import net.neoforged.neoforge.event.entity.player.PlayerInteractEvent;
import net.neoforged.neoforge.event.entity.player.ItemEntityPickupEvent;
import net.neoforged.neoforge.event.entity.player.PlayerXpEvent;
import net.minecraft.world.scores.Objective;
import net.minecraft.world.level.levelgen.Heightmap;
import net.minecraft.world.scores.ScoreHolder;
import net.minecraft.world.scores.Scoreboard;
import net.minecraft.world.scores.criteria.ObjectiveCriteria;
import net.neoforged.neoforge.event.level.BlockEvent;
import net.neoforged.neoforge.event.tick.ServerTickEvent;
import net.neoforged.neoforge.event.server.ServerStartedEvent;
import net.minecraft.world.item.alchemy.Potions;
import net.neoforged.neoforge.event.brewing.RegisterBrewingRecipesEvent;

@SuppressWarnings("unused")
public final class AnvilContent {
    public static final String MODID = "rubinwerk";

    public static final DeferredRegister.Blocks BLOCKS = DeferredRegister.createBlocks(MODID);
    public static final DeferredRegister.Items ITEMS = DeferredRegister.createItems(MODID);
    public static final DeferredRegister<CreativeModeTab> TABS = DeferredRegister.create(Registries.CREATIVE_MODE_TAB, MODID);
    public static final DeferredRegister<ArmorMaterial> ARMOR_MATERIALS = DeferredRegister.create(Registries.ARMOR_MATERIAL, MODID);

    public static final DeferredBlock<DropExperienceBlock> RUBY_ORE = BLOCKS.registerBlock("ruby_ore", p -> new DropExperienceBlock(UniformInt.of(3, 7), p), BlockBehaviour.Properties.of().mapColor(MapColor.STONE).strength(3.0f, 3.0f).sound(SoundType.STONE).requiresCorrectToolForDrops());
    public static final DeferredItem<BlockItem> RUBY_ORE_ITEM = ITEMS.registerSimpleBlockItem("ruby_ore", RUBY_ORE);

    public static final DeferredBlock<DropExperienceBlock> DEEPSLATE_RUBY_ORE = BLOCKS.registerBlock("deepslate_ruby_ore", p -> new DropExperienceBlock(UniformInt.of(3, 7), p), BlockBehaviour.Properties.of().mapColor(MapColor.DEEPSLATE).strength(4.5f, 3.0f).sound(SoundType.DEEPSLATE).requiresCorrectToolForDrops());
    public static final DeferredItem<BlockItem> DEEPSLATE_RUBY_ORE_ITEM = ITEMS.registerSimpleBlockItem("deepslate_ruby_ore", DEEPSLATE_RUBY_ORE);

    public static final DeferredBlock<Block> RUBY_BLOCK = BLOCKS.registerSimpleBlock("ruby_block", BlockBehaviour.Properties.of().mapColor(MapColor.METAL).strength(5.0f, 6.0f).sound(SoundType.METAL).lightLevel(state -> 3).requiresCorrectToolForDrops());
    public static final DeferredItem<BlockItem> RUBY_BLOCK_ITEM = ITEMS.registerSimpleBlockItem("ruby_block", RUBY_BLOCK);

    public static final DeferredBlock<Block> RUBY_BRICKS = BLOCKS.registerSimpleBlock("ruby_bricks", BlockBehaviour.Properties.of().mapColor(MapColor.STONE).strength(2.0f, 6.0f).sound(SoundType.STONE).requiresCorrectToolForDrops());
    public static final DeferredItem<BlockItem> RUBY_BRICKS_ITEM = ITEMS.registerSimpleBlockItem("ruby_bricks", RUBY_BRICKS);

    public static final DeferredBlock<StairBlock> RUBY_BRICKS_STAIRS = BLOCKS.registerBlock("ruby_bricks_stairs", p -> new StairBlock(RUBY_BRICKS.get().defaultBlockState(), p), BlockBehaviour.Properties.of().mapColor(MapColor.STONE).strength(2.0f, 6.0f).sound(SoundType.STONE).requiresCorrectToolForDrops());
    public static final DeferredItem<BlockItem> RUBY_BRICKS_STAIRS_ITEM = ITEMS.registerSimpleBlockItem("ruby_bricks_stairs", RUBY_BRICKS_STAIRS);

    public static final DeferredBlock<SlabBlock> RUBY_BRICKS_SLAB = BLOCKS.registerBlock("ruby_bricks_slab", SlabBlock::new, BlockBehaviour.Properties.of().mapColor(MapColor.STONE).strength(2.0f, 6.0f).sound(SoundType.STONE).requiresCorrectToolForDrops());
    public static final DeferredItem<BlockItem> RUBY_BRICKS_SLAB_ITEM = ITEMS.registerSimpleBlockItem("ruby_bricks_slab", RUBY_BRICKS_SLAB);

    public static final DeferredBlock<WallBlock> RUBY_BRICKS_WALL = BLOCKS.registerBlock("ruby_bricks_wall", WallBlock::new, BlockBehaviour.Properties.of().mapColor(MapColor.STONE).strength(2.0f, 6.0f).sound(SoundType.STONE).requiresCorrectToolForDrops());
    public static final DeferredItem<BlockItem> RUBY_BRICKS_WALL_ITEM = ITEMS.registerSimpleBlockItem("ruby_bricks_wall", RUBY_BRICKS_WALL);

    public static final DeferredBlock<RedstoneLampBlock> RUBY_LAMP = BLOCKS.registerBlock("ruby_lamp", RedstoneLampBlock::new, BlockBehaviour.Properties.of().mapColor(MapColor.NONE).strength(0.3f, 0.3f).sound(SoundType.GLASS).lightLevel(state -> state.getValue(RedstoneLampBlock.LIT) ? 15 : 0).noOcclusion());
    public static final DeferredItem<BlockItem> RUBY_LAMP_ITEM = ITEMS.registerSimpleBlockItem("ruby_lamp", RUBY_LAMP);

    public static final DeferredBlock<AnvilMachineBlock> RUBY_PRESS = BLOCKS.registerBlock("ruby_press", AnvilMachineBlock::new, BlockBehaviour.Properties.of().mapColor(MapColor.METAL).strength(3.5f, 6.0f).sound(SoundType.METAL).requiresCorrectToolForDrops());
    public static final DeferredItem<BlockItem> RUBY_PRESS_ITEM = ITEMS.registerSimpleBlockItem("ruby_press", RUBY_PRESS);

    public static final DeferredBlock<AnvilGeneratorBlock> RUBY_GENERATOR = BLOCKS.registerBlock("ruby_generator", AnvilGeneratorBlock::new, BlockBehaviour.Properties.of().mapColor(MapColor.METAL).strength(3.5f, 6.0f).sound(SoundType.METAL).requiresCorrectToolForDrops());
    public static final DeferredItem<BlockItem> RUBY_GENERATOR_ITEM = ITEMS.registerSimpleBlockItem("ruby_generator", RUBY_GENERATOR);

    public static final DeferredBlock<AnvilGeneratorBlock> RUBY_SOLAR_PANEL = BLOCKS.registerBlock("ruby_solar_panel", AnvilGeneratorBlock::new, BlockBehaviour.Properties.of().mapColor(MapColor.METAL).strength(2.0f, 4.0f).sound(SoundType.METAL).requiresCorrectToolForDrops());
    public static final DeferredItem<BlockItem> RUBY_SOLAR_PANEL_ITEM = ITEMS.registerSimpleBlockItem("ruby_solar_panel", RUBY_SOLAR_PANEL);

    public static final DeferredBlock<AnvilBatteryBlock> RUBY_BATTERY = BLOCKS.registerBlock("ruby_battery", AnvilBatteryBlock::new, BlockBehaviour.Properties.of().mapColor(MapColor.METAL).strength(3.0f, 6.0f).sound(SoundType.METAL).requiresCorrectToolForDrops());
    public static final DeferredItem<BlockItem> RUBY_BATTERY_ITEM = ITEMS.registerSimpleBlockItem("ruby_battery", RUBY_BATTERY);

    public static final DeferredBlock<AnvilCableBlock> RUBY_CABLE = BLOCKS.registerBlock("ruby_cable", AnvilCableBlock::new, BlockBehaviour.Properties.of().mapColor(MapColor.METAL).strength(0.5f, 1.0f).sound(SoundType.METAL).requiresCorrectToolForDrops());
    public static final DeferredItem<BlockItem> RUBY_CABLE_ITEM = ITEMS.registerSimpleBlockItem("ruby_cable", RUBY_CABLE);

    public static final DeferredItem<Item> RUBY = ITEMS.registerSimpleItem("ruby", new Item.Properties().stacksTo(64).rarity(Rarity.UNCOMMON));

    public static final DeferredItem<Item> RUBY_DUST = ITEMS.registerSimpleItem("ruby_dust", new Item.Properties().stacksTo(64));

    public static final DeferredItem<Item> RUBY_WAND = ITEMS.registerSimpleItem("ruby_wand", new Item.Properties().stacksTo(1).rarity(Rarity.EPIC));

    private static final Tier TOOL_RUBY_SWORD = new SimpleTier(BlockTags.INCORRECT_FOR_IRON_TOOL, 900, 7.5f, 0.0f, 18, () -> Ingredient.of(TagKey.create(Registries.ITEM, ResourceLocation.fromNamespaceAndPath(MODID, "repairs_ruby_sword"))));
    public static final DeferredItem<SwordItem> RUBY_SWORD = ITEMS.registerItem("ruby_sword", p -> new SwordItem(TOOL_RUBY_SWORD, p), new Item.Properties().attributes(SwordItem.createAttributes(TOOL_RUBY_SWORD, 6, -2.4f)));

    private static final Tier TOOL_RUBY_PICKAXE = new SimpleTier(BlockTags.INCORRECT_FOR_IRON_TOOL, 900, 7.5f, 0.0f, 18, () -> Ingredient.of(TagKey.create(Registries.ITEM, ResourceLocation.fromNamespaceAndPath(MODID, "repairs_ruby_pickaxe"))));
    public static final DeferredItem<PickaxeItem> RUBY_PICKAXE = ITEMS.registerItem("ruby_pickaxe", p -> new PickaxeItem(TOOL_RUBY_PICKAXE, p), new Item.Properties().attributes(DiggerItem.createAttributes(TOOL_RUBY_PICKAXE, 3.0f, -2.8f)));

    private static final Tier TOOL_RUBY_AXE = new SimpleTier(BlockTags.INCORRECT_FOR_IRON_TOOL, 900, 7.5f, 0.0f, 18, () -> Ingredient.of(TagKey.create(Registries.ITEM, ResourceLocation.fromNamespaceAndPath(MODID, "repairs_ruby_axe"))));
    public static final DeferredItem<AxeItem> RUBY_AXE = ITEMS.registerItem("ruby_axe", p -> new AxeItem(TOOL_RUBY_AXE, p), new Item.Properties().attributes(DiggerItem.createAttributes(TOOL_RUBY_AXE, 8.0f, -3.1f)));

    private static final Tier TOOL_RUBY_SHOVEL = new SimpleTier(BlockTags.INCORRECT_FOR_IRON_TOOL, 900, 7.5f, 0.0f, 18, () -> Ingredient.of(TagKey.create(Registries.ITEM, ResourceLocation.fromNamespaceAndPath(MODID, "repairs_ruby_shovel"))));
    public static final DeferredItem<ShovelItem> RUBY_SHOVEL = ITEMS.registerItem("ruby_shovel", p -> new ShovelItem(TOOL_RUBY_SHOVEL, p), new Item.Properties().attributes(DiggerItem.createAttributes(TOOL_RUBY_SHOVEL, 3.5f, -3.0f)));

    private static final Tier TOOL_RUBY_HOE = new SimpleTier(BlockTags.INCORRECT_FOR_IRON_TOOL, 900, 7.5f, 0.0f, 18, () -> Ingredient.of(TagKey.create(Registries.ITEM, ResourceLocation.fromNamespaceAndPath(MODID, "repairs_ruby_hoe"))));
    public static final DeferredItem<HoeItem> RUBY_HOE = ITEMS.registerItem("ruby_hoe", p -> new HoeItem(TOOL_RUBY_HOE, p), new Item.Properties().attributes(DiggerItem.createAttributes(TOOL_RUBY_HOE, 0.0f, -1.0f)));

    public static final DeferredRegister<BlockEntityType<?>> BLOCK_ENTITIES = DeferredRegister.create(Registries.BLOCK_ENTITY_TYPE, MODID);
    public static final DeferredHolder<BlockEntityType<?>, BlockEntityType<AnvilMachineBlockEntity>> MACHINE_BE = BLOCK_ENTITIES.register("machine", () -> BlockEntityType.Builder.of(AnvilMachineBlockEntity::new, RUBY_PRESS.get()).build(null));

    public static final DeferredHolder<BlockEntityType<?>, BlockEntityType<AnvilPowerBlockEntity>> POWER_BE = BLOCK_ENTITIES.register("power", () -> BlockEntityType.Builder.of(AnvilPowerBlockEntity::new, RUBY_GENERATOR.get(), RUBY_SOLAR_PANEL.get(), RUBY_BATTERY.get(), RUBY_CABLE.get()).build(null));

    public static final DeferredRegister<net.minecraft.world.inventory.MenuType<?>> MENUS = DeferredRegister.create(Registries.MENU, MODID);
    public static final DeferredHolder<net.minecraft.world.inventory.MenuType<?>, net.minecraft.world.inventory.MenuType<AnvilGuiMenu>> GUI_MENU = MENUS.register("gui", () -> net.neoforged.neoforge.common.extensions.IMenuTypeExtension.create(AnvilGuiMenu::new));

    public static final DeferredHolder<CreativeModeTab, CreativeModeTab> TAB = TABS.register("anvil_tab", () -> CreativeModeTab.builder()
            .title(Component.translatable("itemGroup.rubinwerk.anvil"))
            .icon(() -> RUBY.get().getDefaultInstance())
            .displayItems((parameters, output) -> {
                output.accept(RUBY_ORE_ITEM.get());
                output.accept(DEEPSLATE_RUBY_ORE_ITEM.get());
                output.accept(RUBY_BLOCK_ITEM.get());
                output.accept(RUBY_BRICKS_ITEM.get());
                output.accept(RUBY_BRICKS_STAIRS_ITEM.get());
                output.accept(RUBY_BRICKS_SLAB_ITEM.get());
                output.accept(RUBY_BRICKS_WALL_ITEM.get());
                output.accept(RUBY_LAMP_ITEM.get());
                output.accept(RUBY_PRESS_ITEM.get());
                output.accept(RUBY_GENERATOR_ITEM.get());
                output.accept(RUBY_SOLAR_PANEL_ITEM.get());
                output.accept(RUBY_BATTERY_ITEM.get());
                output.accept(RUBY_CABLE_ITEM.get());
                output.accept(RUBY.get());
                output.accept(RUBY_DUST.get());
                output.accept(RUBY_WAND.get());
                output.accept(RUBY_SWORD.get());
                output.accept(RUBY_PICKAXE.get());
                output.accept(RUBY_AXE.get());
                output.accept(RUBY_SHOVEL.get());
                output.accept(RUBY_HOE.get());
            })
            .build());

    private AnvilContent() {}

    /** Wird aus der Hauptklasse der Mod aufgerufen. */
    public static void register(IEventBus modEventBus) {
        ARMOR_MATERIALS.register(modEventBus);
        BLOCKS.register(modEventBus);
        ITEMS.register(modEventBus);
        TABS.register(modEventBus);
        AnvilDevReload.init();
        BLOCK_ENTITIES.register(modEventBus);
        modEventBus.addListener(AnvilContent::anvilRegisterCaps);
        MENUS.register(modEventBus);
        NeoForge.EVENT_BUS.addListener(AnvilContent::anvilTick);
        NeoForge.EVENT_BUS.addListener(AnvilContent::anvilVarsLoad);
        NeoForge.EVENT_BUS.addListener(AnvilContent::anvilVarsStop);
        NeoForge.EVENT_BUS.addListener(AnvilContent::anvilVarsClone);
        NeoForge.EVENT_BUS.addListener(AnvilContent::anvilBp1);
        NeoForge.EVENT_BUS.addListener(AnvilContent::anvilBp2);
        NeoForge.EVENT_BUS.addListener(AnvilContent::anvilBp3);
        NeoForge.EVENT_BUS.addListener(AnvilContent::anvilBp4);
        NeoForge.EVENT_BUS.addListener(AnvilContent::anvilBp6);
        NeoForge.EVENT_BUS.addListener(AnvilContent::registerBrewing);
    }

    // ---- Strom (Forge Energy) ----
    /** Energiespeicher eines Blocks */
    public static class AnvilEnergy {
        int energy, capacity, maxIn, maxOut;
        final Runnable changed;

        public AnvilEnergy(int capacity, int maxIn, int maxOut, Runnable changed) {
            this.capacity = Math.max(0, capacity);
            this.maxIn = Math.max(0, maxIn);
            this.maxOut = Math.max(0, maxOut);
            this.changed = changed;
        }

        public int get() {
            return energy;
        }

        public int capacity() {
            return capacity;
        }

        public void set(int e) {
            energy = Math.max(0, Math.min(capacity, e));
        }

        public int add(int n) {
            int a = Math.max(0, Math.min(capacity - energy, n));
            energy += a;
            if (a > 0) changed.run();
            return a;
        }

        public int take(int n) {
            int a = Math.max(0, Math.min(energy, n));
            energy -= a;
            if (a > 0) changed.run();
            return a;
        }

        /** Für Oberflächen: Wert in 16-Bit-Stücken (Datenplätze sind klein) */
        public int slot(int i) {
            return switch (i) {
                case 0 -> energy & 0xFFFF;
                case 1 -> energy >>> 16;
                case 2 -> capacity & 0xFFFF;
                default -> capacity >>> 16;
            };
        }
    }

    /** Zugriff von einer Seite (andere Mods, Kabel) */
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

    /** FE an einen Nachbarn geben, gibt die angenommene Menge zurück */
    static int anvilSendEnergy(Level level, BlockPos to, net.minecraft.core.Direction side, int amount) {
        if (amount <= 0) return 0;
        net.neoforged.neoforge.energy.IEnergyStorage t = level.getCapability(net.neoforged.neoforge.capabilities.Capabilities.EnergyStorage.BLOCK, to, side);
        if (t == null || !t.canReceive()) return 0;
        return t.receiveEnergy(amount, false);
    }

    static int anvilEnergyAt(Level level, BlockPos pos) {
        net.neoforged.neoforge.energy.IEnergyStorage t = level.getCapability(net.neoforged.neoforge.capabilities.Capabilities.EnergyStorage.BLOCK, pos, null);
        return t == null ? 0 : t.getEnergyStored();
    }

    static int anvilEnergyAdd(Level level, BlockPos pos, int amount) {
        return anvilSendEnergy(level, pos, null, amount);
    }

    static int anvilEnergyTake(Level level, BlockPos pos, int amount) {
        net.neoforged.neoforge.energy.IEnergyStorage t = level.getCapability(net.neoforged.neoforge.capabilities.Capabilities.EnergyStorage.BLOCK, pos, null);
        if (t == null || amount <= 0) return 0;
        return t.extractEnergy(amount, false);
    }

    static boolean anvilHasEnergy(Level level, BlockPos pos, net.minecraft.core.Direction side) {
        return level.getCapability(net.neoforged.neoforge.capabilities.Capabilities.EnergyStorage.BLOCK, pos, side) != null;
    }

    /** An alle Nachbarn verteilen (höchstens rate pro Tick) */
    static void anvilPushAll(Level level, BlockPos pos, AnvilEnergy e, int rate) {
        int left = Math.min(rate, e.get());
        for (net.minecraft.core.Direction d : net.minecraft.core.Direction.values()) {
            if (left <= 0) return;
            int n = anvilSendEnergy(level, pos.relative(d), d.getOpposite(), left);
            e.take(n);
            left -= n;
        }
    }

    static String anvilFe(int v) {
        return v >= 1_000_000 ? String.format("%.1fM", v / 1_000_000.0) : v >= 10_000 ? String.format("%.1fk", v / 1000.0) : String.valueOf(v);
    }

    /** Passt der Stapel zu "ns:id" oder "#ns:tag"? Leer passt nur zu leer. */
    static boolean anvilMatches(ItemStack stack, String ingredient) {
        if (ingredient == null || ingredient.isEmpty()) return stack.isEmpty();
        if (stack.isEmpty()) return false;
        if (ingredient.startsWith("#")) {
            return stack.is(net.minecraft.tags.TagKey.create(net.minecraft.core.registries.Registries.ITEM, net.minecraft.resources.ResourceLocation.parse(ingredient.substring(1))));
        }
        return net.minecraft.core.registries.BuiltInRegistries.ITEM.getKey(stack.getItem()).toString().equals(ingredient);
    }

    static ItemStack anvilStack(String id, int count) {
        net.minecraft.world.item.Item item = net.minecraft.core.registries.BuiltInRegistries.ITEM.get(net.minecraft.resources.ResourceLocation.parse(id));
        return item == net.minecraft.world.item.Items.AIR ? ItemStack.EMPTY : new ItemStack(item, Math.max(1, count));
    }

    static String anvilBlockKey(net.minecraft.world.level.block.Block block) {
        return net.minecraft.core.registries.BuiltInRegistries.BLOCK.getKey(block).getPath();
    }

    record AnvilMachineRecipe(String block, String input, int inputCount, String output, int outputCount, int time) {}

    static final AnvilMachineRecipe[] ANVIL_MACHINE_RECIPES = {
        new AnvilMachineRecipe("ruby_press", "rubinwerk:ruby", 1, "rubinwerk:ruby_dust", 2, 100),
        new AnvilMachineRecipe("ruby_press", "minecraft:raw_iron", 1, "minecraft:iron_ingot", 2, 160),
        new AnvilMachineRecipe("ruby_press", "minecraft:raw_gold", 1, "minecraft:gold_ingot", 2, 160),
    };

    static final java.util.Set<String> ANVIL_MACHINE_FUEL = java.util.Set.of();

    /** Maschine: verarbeitet Eingabe → Ausgabe über die Zeit (Ofen-Oberfläche). */
    public static class AnvilMachineBlock extends BaseEntityBlock {
        public static final MapCodec<AnvilMachineBlock> CODEC = simpleCodec(AnvilMachineBlock::new);

        public AnvilMachineBlock(BlockBehaviour.Properties properties) {
            super(properties);
        }

        @Override
        protected MapCodec<? extends BaseEntityBlock> codec() {
            return CODEC;
        }

        @Override
        protected RenderShape getRenderShape(BlockState state) {
            return RenderShape.MODEL;
        }

        @Override
        public BlockEntity newBlockEntity(BlockPos pos, BlockState state) {
            return new AnvilMachineBlockEntity(pos, state);
        }

        @Override
        public <T extends BlockEntity> net.minecraft.world.level.block.entity.BlockEntityTicker<T> getTicker(Level level, BlockState state, BlockEntityType<T> type) {
            return level.isClientSide() ? null : createTickerHelper(type, MACHINE_BE.get(), AnvilMachineBlockEntity::serverTick);
        }

        @Override
        protected InteractionResult useWithoutItem(BlockState state, Level level, BlockPos pos, Player player, BlockHitResult hit) {
            if (!level.isClientSide() && level.getBlockEntity(pos) instanceof AnvilMachineBlockEntity machine) {
                String anvilGui = ANVIL_MACHINE_GUI.get(anvilBlockKey(state.getBlock()));
                if (anvilGui != null && player instanceof net.minecraft.server.level.ServerPlayer sp) anvilOpenGui(sp, anvilGui, machine, machine.guiData, pos, state.getBlock().getName());
                else player.openMenu(machine);
            }
            return InteractionResult.SUCCESS;
        }
        @Override
        protected void onRemove(BlockState state, Level level, BlockPos pos, BlockState newState, boolean moved) {
            if (!state.is(newState.getBlock()) && level.getBlockEntity(pos) instanceof Container container) Containers.dropContents(level, pos, container);
            super.onRemove(state, level, pos, newState, moved);
        }
    }

    public static class AnvilMachineBlockEntity extends net.minecraft.world.level.block.entity.BaseContainerBlockEntity {
        private NonNullList<ItemStack> items = NonNullList.withSize(3, ItemStack.EMPTY);
        private int litTime, litDuration, progress, total;
        private final net.minecraft.world.inventory.ContainerData data = new net.minecraft.world.inventory.ContainerData() {
            @Override
            public int get(int index) {
                return switch (index) {
                    case 0 -> litTime;
                    case 1 -> litDuration;
                    case 2 -> progress;
                    default -> total;
                };
            }

            @Override
            public void set(int index, int value) {
                switch (index) {
                    case 0 -> litTime = value;
                    case 1 -> litDuration = value;
                    case 2 -> progress = value;
                    default -> total = value;
                }
            }

            @Override
            public int getCount() {
                return 4;
            }
        };
        /** Für eigene Oberflächen: zusätzlich Strom (Plätze 4–7) */
        final net.minecraft.world.inventory.ContainerData guiData = new net.minecraft.world.inventory.ContainerData() {
            @Override
            public int get(int index) {
                return index < 4 ? data.get(index) : energy.slot(index - 4);
            }

            @Override
            public void set(int index, int value) {
                if (index < 4) data.set(index, value);
            }

            @Override
            public int getCount() {
                return 8;
            }
        };
        final AnvilEnergy energy;
        static final java.util.Map<String, int[]> ENERGY = java.util.Map.ofEntries(java.util.Map.entry("ruby_press", new int[] { 20000, 400, 20 }));

        public AnvilMachineBlockEntity(BlockPos pos, BlockState state) {
            super(MACHINE_BE.get(), pos, state);
            int[] cfg = ENERGY.getOrDefault(anvilBlockKey(state.getBlock()), new int[] { 0, 0, 0 });
            energy = new AnvilEnergy(cfg[0], cfg[1], 0, this::setChanged);
        }

        public AnvilEnergyCap cap(net.minecraft.core.Direction side) {
            return energy.capacity() > 0 ? new AnvilEnergyCap(energy, true, false) : null;
        }


        @Override
        public int getContainerSize() {
            return 3;
        }

        @Override
        protected NonNullList<ItemStack> getItems() {
            return items;
        }

        @Override
        protected void setItems(NonNullList<ItemStack> items) {
            this.items = items;
        }

        @Override
        protected Component getDefaultName() {
            return getBlockState().getBlock().getName();
        }

        @Override
        protected AbstractContainerMenu createMenu(int id, Inventory inventory) {
            return new net.minecraft.world.inventory.FurnaceMenu(id, inventory, this, data);
        }

        private static AnvilMachineRecipe find(String key, ItemStack input) {
            for (AnvilMachineRecipe r : ANVIL_MACHINE_RECIPES) {
                if (r.block().equals(key) && anvilMatches(input, r.input()) && input.getCount() >= r.inputCount()) return r;
            }
            return null;
        }

        private static int burnTime(Level level, ItemStack stack) {
            return stack.isEmpty() ? 0 : stack.getBurnTime(net.minecraft.world.item.crafting.RecipeType.SMELTING);
        }

        public static void serverTick(Level level, BlockPos pos, BlockState state, AnvilMachineBlockEntity be) {
            String key = anvilBlockKey(state.getBlock());
            boolean needsFuel = ANVIL_MACHINE_FUEL.contains(key);
            boolean changed = false;
            if (be.litTime > 0) be.litTime--;
            AnvilMachineRecipe r = find(key, be.items.get(0));
            ItemStack out = be.items.get(2);
            ItemStack result = r == null ? ItemStack.EMPTY : anvilStack(r.output(), r.outputCount());
            boolean fits = !result.isEmpty() && (out.isEmpty() || (ItemStack.isSameItemSameComponents(out, result) && out.getCount() + result.getCount() <= out.getMaxStackSize()));
            if (fits) {
                int[] ecfg = ENERGY.get(key);
                if (ecfg != null) {
                    if (be.energy.get() >= ecfg[2]) {
                        be.energy.take(ecfg[2]);
                        be.litTime = be.litDuration = 1;
                    } else be.litTime = 0;
                } else if (!needsFuel) {
                    be.litTime = be.litDuration = 1;
                } else if (be.litTime <= 0) {
                    ItemStack fuel = be.items.get(1);
                    int burn = burnTime(level, fuel);
                    if (burn > 0) {
                        be.litTime = be.litDuration = burn;
                        boolean bucket = fuel.is(net.minecraft.world.item.Items.LAVA_BUCKET);
                        fuel.shrink(1);
                        if (bucket) be.items.set(1, new ItemStack(net.minecraft.world.item.Items.BUCKET));
                        changed = true;
                    }
                }
                if (be.litTime > 0) {
                    be.total = r.time();
                    be.progress++;
                    if (be.progress >= be.total) {
                        be.progress = 0;
                        be.items.get(0).shrink(r.inputCount());
                        if (out.isEmpty()) be.items.set(2, result);
                        else out.grow(result.getCount());
                    }
                    changed = true;
                } else if (be.progress > 0) {
                    be.progress = Math.max(0, be.progress - 2);
                    changed = true;
                }
            } else if (be.progress > 0) {
                be.progress = 0;
                changed = true;
            }
            if (changed) be.setChanged();
        }

        @Override
        protected void loadAdditional(net.minecraft.nbt.CompoundTag tag, net.minecraft.core.HolderLookup.Provider registries) {
            super.loadAdditional(tag, registries);
            items = NonNullList.withSize(3, ItemStack.EMPTY);
            ContainerHelper.loadAllItems(tag, items, registries);
            litTime = tag.getInt("AnvilLit");
            litDuration = tag.getInt("AnvilLitTotal");
            progress = tag.getInt("AnvilProgress");
            total = tag.getInt("AnvilTotal");
            energy.set(tag.getInt("AnvilEnergy"));
        }

        @Override
        protected void saveAdditional(net.minecraft.nbt.CompoundTag tag, net.minecraft.core.HolderLookup.Provider registries) {
            super.saveAdditional(tag, registries);
            ContainerHelper.saveAllItems(tag, items, registries);
            tag.putInt("AnvilLit", litTime);
            tag.putInt("AnvilLitTotal", litDuration);
            tag.putInt("AnvilProgress", progress);
            tag.putInt("AnvilTotal", total);
            tag.putInt("AnvilEnergy", energy.get());
        }
    }

    private static Holder<MobEffect> anvilEffect(String id) {
        return BuiltInRegistries.MOB_EFFECT.getHolder(ResourceLocation.parse(id)).orElseThrow();
    }

    private static Item anvilItem(String id) {
        return BuiltInRegistries.ITEM.get(ResourceLocation.parse(id));
    }

    private static SoundEvent anvilSound(String id) {
        return BuiltInRegistries.SOUND_EVENT.get(ResourceLocation.parse(id));
    }

    public record AnvilPower(String kind, int capacity, int rate, int gen, String source, String gui) {}

    static final java.util.Map<String, AnvilPower> ANVIL_POWER = java.util.Map.ofEntries(java.util.Map.entry("ruby_generator", new AnvilPower("generator", 40000, 400, 40, "fuel", "rubin_generator")), java.util.Map.entry("ruby_solar_panel", new AnvilPower("generator", 8000, 100, 15, "solar", "")), java.util.Map.entry("ruby_battery", new AnvilPower("battery", 250000, 1000, 0, "fuel", "rubin_akku")), java.util.Map.entry("ruby_cable", new AnvilPower("cable", 1000, 1000, 0, "fuel", "")));

    static AnvilPower anvilPower(net.minecraft.world.level.block.Block block) {
        return ANVIL_POWER.getOrDefault(anvilBlockKey(block), new AnvilPower("battery", 10000, 100, 0, "fuel", ""));
    }

    static void anvilPowerRegisterCaps(net.neoforged.neoforge.capabilities.RegisterCapabilitiesEvent event) {
        event.registerBlockEntity(net.neoforged.neoforge.capabilities.Capabilities.EnergyStorage.BLOCK, POWER_BE.get(), (be, side) -> be.cap(side));
    }

    /** Gemeinsame Bedienung: Oberfläche öffnen, Brennstoff einlegen oder Füllstand zeigen */
    static InteractionResult anvilPowerUse(BlockState state, Level level, BlockPos pos, Player player) {
        if (level.isClientSide() || !(level.getBlockEntity(pos) instanceof AnvilPowerBlockEntity be)) return InteractionResult.SUCCESS;
        AnvilPower cfg = anvilPower(state.getBlock());
        ItemStack hand = player.getMainHandItem();
        if (cfg.kind().equals("generator") && cfg.source().equals("fuel") && !hand.isEmpty() && AnvilPowerBlockEntity.burnTime(level, hand) > 0) {
            ItemStack slot = be.items.get(1);
            if (slot.isEmpty()) {
                be.items.set(1, hand.split(hand.getCount()));
            } else if (ItemStack.isSameItemSameComponents(slot, hand)) {
                int n = Math.min(hand.getCount(), slot.getMaxStackSize() - slot.getCount());
                slot.grow(n);
                hand.shrink(n);
            }
            be.setChanged();
            return InteractionResult.SUCCESS;
        }
        if (!cfg.gui().isEmpty() && player instanceof net.minecraft.server.level.ServerPlayer sp && anvilPowerGui(sp, cfg.gui(), be, be.guiData, pos, state.getBlock().getName())) {
            return InteractionResult.SUCCESS;
        }
        String extra = cfg.kind().equals("generator") ? (be.producing ? " · +" + cfg.gen() + " FE/t" : " · idle") : "";
        player.displayClientMessage(Component.literal(state.getBlock().getName().getString() + ": " + anvilFe(be.energy.get()) + " / " + anvilFe(be.energy.capacity()) + " FE" + extra), true);
        return InteractionResult.SUCCESS;
    }

    /** Generator: erzeugt Strom und gibt ihn an alle Nachbarn ab */
    public static class AnvilGeneratorBlock extends BaseEntityBlock {
        public static final MapCodec<AnvilGeneratorBlock> CODEC = simpleCodec(AnvilGeneratorBlock::new);

        public AnvilGeneratorBlock(BlockBehaviour.Properties properties) {
            super(properties);
        }

        @Override
        protected MapCodec<? extends BaseEntityBlock> codec() {
            return CODEC;
        }

        @Override
        protected RenderShape getRenderShape(BlockState state) {
            return RenderShape.MODEL;
        }

        @Override
        public BlockEntity newBlockEntity(BlockPos pos, BlockState state) {
            return new AnvilPowerBlockEntity(pos, state);
        }

        @Override
        public <T extends BlockEntity> net.minecraft.world.level.block.entity.BlockEntityTicker<T> getTicker(Level level, BlockState state, BlockEntityType<T> type) {
            return level.isClientSide() ? null : createTickerHelper(type, POWER_BE.get(), AnvilPowerBlockEntity::serverTick);
        }

        @Override
        protected InteractionResult useWithoutItem(BlockState state, Level level, BlockPos pos, Player player, BlockHitResult hit) {
            return anvilPowerUse(state, level, pos, player);
        }
        @Override
        protected void onRemove(BlockState state, Level level, BlockPos pos, BlockState newState, boolean moved) {
            if (!state.is(newState.getBlock()) && level.getBlockEntity(pos) instanceof Container container) Containers.dropContents(level, pos, container);
            super.onRemove(state, level, pos, newState, moved);
        }
    }

    /** Akku: nimmt an allen Seiten Strom an und gibt ihn vorne wieder ab */
    public static class AnvilBatteryBlock extends BaseEntityBlock {
        public static final MapCodec<AnvilBatteryBlock> CODEC = simpleCodec(AnvilBatteryBlock::new);

        public AnvilBatteryBlock(BlockBehaviour.Properties properties) {
            super(properties);
            registerDefaultState(stateDefinition.any().setValue(net.minecraft.world.level.block.HorizontalDirectionalBlock.FACING, net.minecraft.core.Direction.NORTH));
        }

        @Override
        protected MapCodec<? extends BaseEntityBlock> codec() {
            return CODEC;
        }

        @Override
        protected void createBlockStateDefinition(net.minecraft.world.level.block.state.StateDefinition.Builder<net.minecraft.world.level.block.Block, BlockState> builder) {
            builder.add(net.minecraft.world.level.block.HorizontalDirectionalBlock.FACING);
        }

        @Override
        public BlockState getStateForPlacement(net.minecraft.world.item.context.BlockPlaceContext context) {
            return defaultBlockState().setValue(net.minecraft.world.level.block.HorizontalDirectionalBlock.FACING, context.getHorizontalDirection().getOpposite());
        }

        @Override
        protected RenderShape getRenderShape(BlockState state) {
            return RenderShape.MODEL;
        }

        @Override
        public BlockEntity newBlockEntity(BlockPos pos, BlockState state) {
            return new AnvilPowerBlockEntity(pos, state);
        }

        @Override
        public <T extends BlockEntity> net.minecraft.world.level.block.entity.BlockEntityTicker<T> getTicker(Level level, BlockState state, BlockEntityType<T> type) {
            return level.isClientSide() ? null : createTickerHelper(type, POWER_BE.get(), AnvilPowerBlockEntity::serverTick);
        }

        @Override
        protected InteractionResult useWithoutItem(BlockState state, Level level, BlockPos pos, Player player, BlockHitResult hit) {
            return anvilPowerUse(state, level, pos, player);
        }
        @Override
        protected void onRemove(BlockState state, Level level, BlockPos pos, BlockState newState, boolean moved) {
            if (!state.is(newState.getBlock()) && level.getBlockEntity(pos) instanceof Container container) Containers.dropContents(level, pos, container);
            super.onRemove(state, level, pos, newState, moved);
        }
    }

    /** Kabel: verbindet sich mit allem, was Strom hat, und gleicht den Füllstand aus */
    public static class AnvilCableBlock extends BaseEntityBlock {
        public static final MapCodec<AnvilCableBlock> CODEC = simpleCodec(AnvilCableBlock::new);
        static final net.minecraft.world.level.block.state.properties.BooleanProperty[] SIDES = {
            net.minecraft.world.level.block.state.properties.BlockStateProperties.DOWN,
            net.minecraft.world.level.block.state.properties.BlockStateProperties.UP,
            net.minecraft.world.level.block.state.properties.BlockStateProperties.NORTH,
            net.minecraft.world.level.block.state.properties.BlockStateProperties.SOUTH,
            net.minecraft.world.level.block.state.properties.BlockStateProperties.WEST,
            net.minecraft.world.level.block.state.properties.BlockStateProperties.EAST
        };
        private static final net.minecraft.world.phys.shapes.VoxelShape CORE = net.minecraft.world.level.block.Block.box(5, 5, 5, 11, 11, 11);

        public AnvilCableBlock(BlockBehaviour.Properties properties) {
            super(properties);
            BlockState s = stateDefinition.any();
            for (var p : SIDES) s = s.setValue(p, false);
            registerDefaultState(s);
        }

        @Override
        protected MapCodec<? extends BaseEntityBlock> codec() {
            return CODEC;
        }

        @Override
        protected void createBlockStateDefinition(net.minecraft.world.level.block.state.StateDefinition.Builder<net.minecraft.world.level.block.Block, BlockState> builder) {
            builder.add(SIDES);
        }

        static BlockState connect(Level level, BlockPos pos, BlockState state) {
            for (net.minecraft.core.Direction d : net.minecraft.core.Direction.values()) {
                BlockPos np = pos.relative(d);
                boolean c = level.getBlockState(np).getBlock() instanceof AnvilCableBlock || anvilHasEnergy(level, np, d.getOpposite());
                state = state.setValue(SIDES[d.ordinal()], c);
            }
            return state;
        }

        @Override
        public BlockState getStateForPlacement(net.minecraft.world.item.context.BlockPlaceContext context) {
            return connect(context.getLevel(), context.getClickedPos(), defaultBlockState());
        }

        @Override
        protected net.minecraft.world.phys.shapes.VoxelShape getShape(BlockState state, net.minecraft.world.level.BlockGetter level, BlockPos pos, net.minecraft.world.phys.shapes.CollisionContext context) {
            net.minecraft.world.phys.shapes.VoxelShape s = CORE;
            if (state.getValue(SIDES[0])) s = net.minecraft.world.phys.shapes.Shapes.or(s, net.minecraft.world.level.block.Block.box(5, 0, 5, 11, 5, 11));
            if (state.getValue(SIDES[1])) s = net.minecraft.world.phys.shapes.Shapes.or(s, net.minecraft.world.level.block.Block.box(5, 11, 5, 11, 16, 11));
            if (state.getValue(SIDES[2])) s = net.minecraft.world.phys.shapes.Shapes.or(s, net.minecraft.world.level.block.Block.box(5, 5, 0, 11, 11, 5));
            if (state.getValue(SIDES[3])) s = net.minecraft.world.phys.shapes.Shapes.or(s, net.minecraft.world.level.block.Block.box(5, 5, 11, 11, 11, 16));
            if (state.getValue(SIDES[4])) s = net.minecraft.world.phys.shapes.Shapes.or(s, net.minecraft.world.level.block.Block.box(0, 5, 5, 5, 11, 11));
            if (state.getValue(SIDES[5])) s = net.minecraft.world.phys.shapes.Shapes.or(s, net.minecraft.world.level.block.Block.box(11, 5, 5, 16, 11, 11));
            return s;
        }

        @Override
        protected RenderShape getRenderShape(BlockState state) {
            return RenderShape.MODEL;
        }

        @Override
        public BlockEntity newBlockEntity(BlockPos pos, BlockState state) {
            return new AnvilPowerBlockEntity(pos, state);
        }

        @Override
        public <T extends BlockEntity> net.minecraft.world.level.block.entity.BlockEntityTicker<T> getTicker(Level level, BlockState state, BlockEntityType<T> type) {
            return level.isClientSide() ? null : createTickerHelper(type, POWER_BE.get(), AnvilPowerBlockEntity::serverTick);
        }

        @Override
        protected InteractionResult useWithoutItem(BlockState state, Level level, BlockPos pos, Player player, BlockHitResult hit) {
            return anvilPowerUse(state, level, pos, player);
        }
    }

    public static class AnvilPowerBlockEntity extends net.minecraft.world.level.block.entity.BaseContainerBlockEntity {
        NonNullList<ItemStack> items = NonNullList.withSize(3, ItemStack.EMPTY);
        int litTime, litDuration;
        boolean producing;
        final AnvilEnergy energy;
        final AnvilPower cfg;
        final net.minecraft.world.inventory.ContainerData guiData = new net.minecraft.world.inventory.ContainerData() {
            @Override
            public int get(int index) {
                return switch (index) {
                    case 0 -> litTime;
                    case 1 -> litDuration;
                    case 2, 3 -> 0;
                    default -> energy.slot(index - 4);
                };
            }

            @Override
            public void set(int index, int value) {}

            @Override
            public int getCount() {
                return 8;
            }
        };

        public AnvilPowerBlockEntity(BlockPos pos, BlockState state) {
            super(POWER_BE.get(), pos, state);
            cfg = anvilPower(state.getBlock());
            int in = cfg.kind().equals("generator") ? 0 : cfg.rate();
            energy = new AnvilEnergy(cfg.capacity(), in, cfg.rate(), this::setChanged);
        }

        /** Seitenzugriff: Akku gibt nur vorne ab und nimmt vorne nichts an */
        public AnvilEnergyCap cap(net.minecraft.core.Direction side) {
            if (cfg.kind().equals("battery") && side != null) {
                boolean front = getBlockState().hasProperty(net.minecraft.world.level.block.HorizontalDirectionalBlock.FACING) && getBlockState().getValue(net.minecraft.world.level.block.HorizontalDirectionalBlock.FACING) == side;
                return new AnvilEnergyCap(energy, !front, front);
            }
            return new AnvilEnergyCap(energy, !cfg.kind().equals("generator"), true);
        }

        static int burnTime(Level level, ItemStack stack) {
            return stack.isEmpty() ? 0 : stack.getBurnTime(net.minecraft.world.item.crafting.RecipeType.SMELTING);
        }

        @Override
        public int getContainerSize() {
            return 3;
        }

        @Override
        protected NonNullList<ItemStack> getItems() {
            return items;
        }

        @Override
        protected void setItems(NonNullList<ItemStack> items) {
            this.items = items;
        }

        @Override
        protected Component getDefaultName() {
            return getBlockState().getBlock().getName();
        }

        @Override
        protected net.minecraft.world.inventory.AbstractContainerMenu createMenu(int id, net.minecraft.world.entity.player.Inventory inventory) {
            return new net.minecraft.world.inventory.FurnaceMenu(id, inventory, this, new net.minecraft.world.inventory.SimpleContainerData(4));
        }

        public static void serverTick(Level level, BlockPos pos, BlockState state, AnvilPowerBlockEntity be) {
            AnvilPower cfg = be.cfg;
            switch (cfg.kind()) {
                case "generator" -> {
                    boolean on = switch (cfg.source()) {
                        case "solar" -> (level.getDayTime() % 24000L < 12300L || level.getDayTime() % 24000L > 23850L) && level.canSeeSky(pos.above()) && !level.isRaining();
                        case "redstone" -> level.hasNeighborSignal(pos);
                        case "always" -> true;
                        default -> false;
                    };
                    if (cfg.source().equals("fuel")) {
                        if (be.litTime > 0) be.litTime--;
                        if (be.litTime <= 0 && be.energy.get() < be.energy.capacity()) {
                            ItemStack fuel = be.items.get(1);
                            int burn = burnTime(level, fuel);
                            if (burn > 0) {
                                be.litTime = be.litDuration = burn;
                                boolean bucket = fuel.is(net.minecraft.world.item.Items.LAVA_BUCKET);
                                fuel.shrink(1);
                                if (bucket) be.items.set(1, new ItemStack(net.minecraft.world.item.Items.BUCKET));
                                be.setChanged();
                            }
                        }
                        on = be.litTime > 0;
                    }
                    be.producing = on && be.energy.get() < be.energy.capacity();
                    if (on) be.energy.add(cfg.gen());
                    anvilPushAll(level, pos, be.energy, cfg.rate());
                }
                case "battery" -> {
                    if (state.hasProperty(net.minecraft.world.level.block.HorizontalDirectionalBlock.FACING)) {
                        net.minecraft.core.Direction d = state.getValue(net.minecraft.world.level.block.HorizontalDirectionalBlock.FACING);
                        be.energy.take(anvilSendEnergy(level, pos.relative(d), d.getOpposite(), Math.min(cfg.rate(), be.energy.get())));
                    }
                }
                case "cable" -> {
                    if (level.getGameTime() % 10 == pos.asLong() % 10 && state.getBlock() instanceof AnvilCableBlock) {
                        BlockState c = AnvilCableBlock.connect(level, pos, state);
                        if (c != state) level.setBlock(pos, c, 3);
                    }
                    for (net.minecraft.core.Direction d : net.minecraft.core.Direction.values()) {
                        if (be.energy.get() <= 0) break;
                        BlockPos np = pos.relative(d);
                        if (level.getBlockEntity(np) instanceof AnvilPowerBlockEntity other && other.cfg.kind().equals("cable")) {
                            int diff = (be.energy.get() - other.energy.get()) / 2;
                            if (diff > 0) be.energy.take(other.energy.add(Math.min(diff, cfg.rate())));
                        } else {
                            be.energy.take(anvilSendEnergy(level, np, d.getOpposite(), Math.min(cfg.rate(), be.energy.get())));
                        }
                    }
                }
                default -> {}
            }
        }

        @Override
        protected void loadAdditional(net.minecraft.nbt.CompoundTag tag, net.minecraft.core.HolderLookup.Provider registries) {
            super.loadAdditional(tag, registries);
            items = NonNullList.withSize(3, ItemStack.EMPTY);
            ContainerHelper.loadAllItems(tag, items, registries);
            litTime = tag.getInt("AnvilLit");
            litDuration = tag.getInt("AnvilLitTotal");
            energy.set(tag.getInt("AnvilEnergy"));
        }

        @Override
        protected void saveAdditional(net.minecraft.nbt.CompoundTag tag, net.minecraft.core.HolderLookup.Provider registries) {
            super.saveAdditional(tag, registries);
            ContainerHelper.saveAllItems(tag, items, registries);
            tag.putInt("AnvilLit", litTime);
            tag.putInt("AnvilLitTotal", litDuration);
            tag.putInt("AnvilEnergy", energy.get());
        }
    }

    static boolean anvilPowerGui(net.minecraft.server.level.ServerPlayer sp, String key, net.minecraft.world.Container c, net.minecraft.world.inventory.ContainerData data, BlockPos pos, Component title) {
        if (!ANVIL_GUIS.containsKey(key)) return false;
        anvilOpenGui(sp, key, c, data, pos, title);
        return true;
    }

    private static void anvilRegisterCaps(net.neoforged.neoforge.capabilities.RegisterCapabilitiesEvent event) {
        event.registerBlockEntity(net.neoforged.neoforge.capabilities.Capabilities.EnergyStorage.BLOCK, POWER_BE.get(), (be, side) -> be.cap(side));
        event.registerBlockEntity(net.neoforged.neoforge.capabilities.Capabilities.EnergyStorage.BLOCK, MACHINE_BE.get(), (be, side) -> be.cap(side));
    }

    // ---- Eigene Oberflächen (GUI-Editor) ----
    public record AnvilGuiEl(String kind, int x, int y, int w, int h, String text, int color, int data, long max, String item) {}

    public record AnvilGui(int w, int h, String style, String title, int vars, AnvilGuiEl[] els) {}

    public static final java.util.Map<String, AnvilGui> ANVIL_GUIS = java.util.Map.ofEntries(
        java.util.Map.entry("rubin_presse", new AnvilGui(176, 166, "light", "Ruby Press", 0, new AnvilGuiEl[] {
            new AnvilGuiEl("slot_in", 55, 16, 18, 18, "", 0xFF404040, -1, 100, ""),
            new AnvilGuiEl("slot_fuel", 55, 52, 18, 18, "", 0xFF404040, -1, 100, ""),
            new AnvilGuiEl("flame", 57, 36, 14, 14, "", 0xFF404040, -1, 100, ""),
            new AnvilGuiEl("arrow", 79, 34, 24, 17, "", 0xFF404040, -1, 100, ""),
            new AnvilGuiEl("slot_out", 111, 31, 26, 26, "", 0xFF404040, -1, 100, ""),
            new AnvilGuiEl("energy", 12, 16, 12, 54, "", 0xFFD01C3A, -2, 1000, ""),
            new AnvilGuiEl("value", 30, 70, 100, 9, "", 0xFF404040, -2, 100, ""),
            new AnvilGuiEl("player_inv", 7, 83, 162, 76, "", 0xFF404040, -1, 100, ""),
        })),
        java.util.Map.entry("rubin_generator", new AnvilGui(176, 166, "light", "Ruby Generator", 0, new AnvilGuiEl[] {
            new AnvilGuiEl("slot_fuel", 79, 50, 18, 18, "", 0xFF404040, -1, 100, ""),
            new AnvilGuiEl("flame", 81, 32, 14, 14, "", 0xFF404040, -1, 100, ""),
            new AnvilGuiEl("energy", 150, 16, 14, 58, "", 0xFFD01C3A, -2, 100, ""),
            new AnvilGuiEl("value", 8, 20, 120, 9, "", 0xFF404040, -2, 100, ""),
            new AnvilGuiEl("text", 8, 64, 70, 9, "+40 FE/t", 0xFF2F9E44, -1, 100, ""),
            new AnvilGuiEl("player_inv", 7, 83, 162, 76, "", 0xFF404040, -1, 100, ""),
        })),
        java.util.Map.entry("rubin_akku", new AnvilGui(176, 90, "dark", "Ruby Battery Cell", 0, new AnvilGuiEl[] {
            new AnvilGuiEl("energy", 12, 20, 152, 22, "", 0xFF6FCF5A, -2, 100, ""),
            new AnvilGuiEl("value", 12, 50, 152, 9, "", 0xFFFFFFFF, -2, 100, ""),
            new AnvilGuiEl("text", 12, 66, 152, 9, "Output: front side", 0xFF9D9D9D, -1, 100, ""),
        })),
        java.util.Map.entry("rubin_zentrale", new AnvilGui(200, 124, "dark", "Ruby Control", 4, new AnvilGuiEl[] {
            new AnvilGuiEl("panel", 8, 20, 184, 40, "", 0xFF3A1820, -1, 100, ""),
            new AnvilGuiEl("item", 16, 32, 16, 16, "", 0xFF404040, -1, 100, "rubinwerk:ruby"),
            new AnvilGuiEl("value", 40, 28, 140, 9, "Rubine: ", 0xFFFFD0D8, 8, 100, ""),
            new AnvilGuiEl("value", 40, 42, 140, 9, "Magie: ", 0xFFFFD0D8, 9, 100, ""),
            new AnvilGuiEl("energy", 176, 24, 10, 32, "", 0xFF9B5DE5, 10, 1000, ""),
            new AnvilGuiEl("button", 8, 70, 90, 20, "Belohnung (5)", 0xFF404040, -1, 100, ""),
            new AnvilGuiEl("switch", 102, 70, 90, 20, "Turbo", 0xFF404040, 11, 100, ""),
            new AnvilGuiEl("text", 8, 100, 184, 9, "Tipp: /rubin oeffnet dieses Fenster", 0xFF9D9D9D, -1, 100, ""),
        }))
    );

    /** Maschinen-Block → Oberfläche */
    static final java.util.Map<String, String> ANVIL_MACHINE_GUI = java.util.Map.ofEntries(java.util.Map.entry("ruby_press", "rubin_presse"));

    /** Oberfläche öffnen (Container und Daten dürfen fehlen) */
    public static void anvilOpenGui(net.minecraft.server.level.ServerPlayer sp, String key, net.minecraft.world.Container container, net.minecraft.world.inventory.ContainerData base, net.minecraft.core.BlockPos pos, Component title) {
        AnvilGui g = ANVIL_GUIS.get(key);
        if (g == null) return;
        net.minecraft.world.Container c = container == null ? new net.minecraft.world.SimpleContainer(0) : container;
        Component t = g.title().isEmpty() ? title : Component.literal(g.title());
        sp.openMenu(new net.minecraft.world.SimpleMenuProvider((id, inv, p) -> anvilGuiMenu(id, inv, key, c, base, pos), t), buf -> {
            buf.writeUtf(key);
            buf.writeVarInt(c.getContainerSize());
            buf.writeVarInt(8 + g.vars());
            buf.writeBlockPos(pos);
        });
    }

    static AnvilGuiMenu anvilGuiMenu(int id, net.minecraft.world.entity.player.Inventory inv, String key, net.minecraft.world.Container c, net.minecraft.world.inventory.ContainerData base, net.minecraft.core.BlockPos pos) {
        AnvilGui g = ANVIL_GUIS.get(key);
        net.minecraft.world.entity.player.Player player = inv.player;
        net.minecraft.world.inventory.ContainerData d = new net.minecraft.world.inventory.ContainerData() {
            @Override
            public int get(int i) {
                if (i < 8) return base == null || i >= base.getCount() ? 0 : base.get(i);
                return player.level() instanceof net.minecraft.server.level.ServerLevel sl ? anvilGuiValue(sl, player, key, i - 8) : 0;
            }

            @Override
            public void set(int i, int v) {
                if (i < 8 && base != null && i < base.getCount()) base.set(i, v);
            }

            @Override
            public int getCount() {
                return 8 + (g == null ? 0 : g.vars());
            }
        };
        return new AnvilGuiMenu(id, inv, key, c, d, pos);
    }

    public static class AnvilGuiMenu extends net.minecraft.world.inventory.AbstractContainerMenu {
        public final String key;
        public final AnvilGui gui;
        public final net.minecraft.world.inventory.ContainerData data;
        public final net.minecraft.core.BlockPos pos;
        private final net.minecraft.world.Container container;
        private final int ownSlots;

        public AnvilGuiMenu(int id, net.minecraft.world.entity.player.Inventory inv, net.minecraft.network.RegistryFriendlyByteBuf buf) {
            this(id, inv, buf.readUtf(), new net.minecraft.world.SimpleContainer(Math.max(0, buf.readVarInt())), new net.minecraft.world.inventory.SimpleContainerData(Math.max(8, buf.readVarInt())), buf.readBlockPos());
        }

        public AnvilGuiMenu(int id, net.minecraft.world.entity.player.Inventory inv, String key, net.minecraft.world.Container container, net.minecraft.world.inventory.ContainerData data, net.minecraft.core.BlockPos pos) {
            super(GUI_MENU.get(), id);
            this.key = key;
            this.gui = ANVIL_GUIS.getOrDefault(key, new AnvilGui(176, 166, "light", "", 0, new AnvilGuiEl[0]));
            this.data = data;
            this.pos = pos;
            this.container = container;
            int own = 0;
            for (AnvilGuiEl e : gui.els()) {
                int idx = switch (e.kind()) {
                    case "slot_in" -> 0;
                    case "slot_fuel" -> 1;
                    case "slot_out" -> 2;
                    default -> -1;
                };
                if (idx < 0 || idx >= container.getContainerSize()) continue;
                int off = e.kind().equals("slot_out") ? 5 : 1;
                if (idx == 2) {
                    addSlot(new net.minecraft.world.inventory.Slot(container, idx, e.x() + off, e.y() + off) {
                        @Override
                        public boolean mayPlace(ItemStack stack) {
                            return false;
                        }
                    });
                } else addSlot(new net.minecraft.world.inventory.Slot(container, idx, e.x() + off, e.y() + off));
                own++;
            }
            this.ownSlots = own;
            for (AnvilGuiEl e : gui.els()) {
                if (!e.kind().equals("player_inv")) continue;
                for (int row = 0; row < 3; row++)
                    for (int col = 0; col < 9; col++) addSlot(new net.minecraft.world.inventory.Slot(inv, col + row * 9 + 9, e.x() + 1 + col * 18, e.y() + 1 + row * 18));
                for (int col = 0; col < 9; col++) addSlot(new net.minecraft.world.inventory.Slot(inv, col, e.x() + 1 + col * 18, e.y() + 59));
                break;
            }
            addDataSlots(data);
        }

        @Override
        public ItemStack quickMoveStack(net.minecraft.world.entity.player.Player player, int index) {
            net.minecraft.world.inventory.Slot slot = slots.get(index);
            if (!slot.hasItem()) return ItemStack.EMPTY;
            ItemStack stack = slot.getItem();
            ItemStack copy = stack.copy();
            if (index < ownSlots) {
                if (!moveItemStackTo(stack, ownSlots, slots.size(), true)) return ItemStack.EMPTY;
            } else if (ownSlots == 0 || !moveItemStackTo(stack, 0, Math.min(ownSlots, 2), false)) return ItemStack.EMPTY;
            if (stack.isEmpty()) slot.set(ItemStack.EMPTY);
            else slot.setChanged();
            return copy;
        }

        @Override
        public boolean stillValid(net.minecraft.world.entity.player.Player player) {
            return container.stillValid(player);
        }

        @Override
        public boolean clickMenuButton(net.minecraft.world.entity.player.Player player, int id) {
            if (player instanceof net.minecraft.server.level.ServerPlayer sp && id >= 0 && id < gui.els().length) anvilGuiClick(sp, key, id, pos);
            return true;
        }
    }

    // ---- Blueprints ----
    private record AnvilTask(long at, Runnable run) {}
    private static final java.util.List<AnvilTask> ANVIL_TASKS = new java.util.ArrayList<>();

    private static void anvilLater(ServerLevel level, long ticks, Runnable run) {
        ANVIL_TASKS.add(new AnvilTask(level.getServer().getTickCount() + ticks, run));
    }

    private static void anvilRun(ServerLevel level, Entity who, double x, double y, double z, String command) {
        CommandSourceStack source = level.getServer().createCommandSourceStack().withLevel(level).withPosition(new Vec3(x, y, z)).withPermission(4).withSuppressedOutput();
        if (who != null) source = source.withEntity(who).withPosition(who.position());
        level.getServer().getCommands().performPrefixedCommand(source, command);
    }

    private static net.minecraft.world.level.block.Block anvilBlock(String id) {
        return BuiltInRegistries.BLOCK.get(ResourceLocation.parse(id));
    }

    private static EntityType<?> anvilEntity(String id) {
        return BuiltInRegistries.ENTITY_TYPE.get(ResourceLocation.parse(id));
    }

    /** In eine Dimension reisen (sicher auf der Oberfläche landen); back = schon dort → zurück in die Oberwelt */
    private static void anvilTravel(ServerLevel level, Player player, String dim, boolean back) {
        ResourceKey<Level> key = ResourceKey.create(Registries.DIMENSION, ResourceLocation.parse(dim));
        if (back && level.dimension() == key) key = Level.OVERWORLD;
        ServerLevel to = level.getServer().getLevel(key);
        if (to == null) return;
        int bx = (int) Math.floor(player.getX()), bz = (int) Math.floor(player.getZ());
        int by = to.getHeight(Heightmap.Types.MOTION_BLOCKING_NO_LEAVES, bx, bz);
        if (by < -60 || key == Level.NETHER) by = 70;
        if (key == Level.END) { bx = 100; by = 50; bz = 0; }
        if (to.getBlockState(new BlockPos(bx, by - 1, bz)).isAir()) to.setBlockAndUpdate(new BlockPos(bx, by - 1, bz), net.minecraft.world.level.block.Blocks.STONE.defaultBlockState());
        anvilRun(level, player, player.getX(), player.getY(), player.getZ(), "execute in " + key.location() + " run tp @s " + (bx + 0.5) + " " + by + " " + (bz + 0.5));
    }

    private static Objective anvilObj(ServerLevel level, String name) {
        Scoreboard board = level.getServer().getScoreboard();
        Objective o = board.getObjective("anv_" + name);
        if (o == null) o = board.addObjective("anv_" + name, ObjectiveCriteria.DUMMY, Component.literal(name), ObjectiveCriteria.RenderType.INTEGER, true, null);
        return o;
    }

    private static ScoreHolder anvilHolder(Entity who) {
        return who != null ? who : ScoreHolder.forNameOnly("#global");
    }

    // ---- Variablen (Variablen-Tab): Welt + Spieler in <Welt>/data/MODID_variables.json, Sitzung im Speicher ----
    private static final java.util.Map<String, String> ANVIL_VARS = new java.util.concurrent.ConcurrentHashMap<>();
    private static final java.util.Map<String, String> ANVIL_SESSION = new java.util.concurrent.ConcurrentHashMap<>();
    private static boolean anvilVarsDirty = false;

    private static String anvilKey(Entity who, String scope, String name) {
        return switch (scope) {
            case "p" -> who == null ? null : "p:" + who.getStringUUID() + ":" + name;
            case "l" -> who == null ? null : "l:" + who.getStringUUID() + ":" + name;
            default -> "w:" + name;
        };
    }

    private static String anvilVar(ServerLevel level, Entity who, String scope, String name, String def) {
        if (scope.equals("s")) return ANVIL_SESSION.getOrDefault(name, def);
        String k = anvilKey(who, scope, name);
        return k == null ? def : ANVIL_VARS.getOrDefault(k, def);
    }

    private static double anvilParse(String s) {
        try { return Double.parseDouble(s.trim().replace(',', '.')); } catch (Exception e) { return 0; }
    }

    private static double anvilNum(ServerLevel level, Entity who, String scope, String name, double def) {
        String v = anvilVar(level, who, scope, name, null);
        return v == null ? def : anvilParse(v);
    }

    private static String anvilFmt(double v) {
        return v == Math.rint(v) && Math.abs(v) < 1.0E15 ? String.valueOf((long) v) : String.valueOf(v);
    }

    private static String anvilPos(double x, double y, double z) {
        return anvilFmt(Math.floor(x) + 0.5) + " " + anvilFmt(Math.floor(y)) + " " + anvilFmt(Math.floor(z) + 0.5);
    }

    private static void anvilPut(ServerLevel level, Entity who, String scope, String name, String value) {
        if (value == null) value = "";
        if (scope.equals("s")) ANVIL_SESSION.put(name, value);
        else {
            String k = anvilKey(who, scope, name);
            if (k == null) return;
            ANVIL_VARS.put(k, value);
            anvilVarsDirty = true;
        }
        // Anzeige am Rand mitziehen
        Objective o = level.getServer().getScoreboard().getObjective("anv_" + name);
        if (o != null) {
            ScoreHolder h = (scope.equals("p") || scope.equals("l")) && who != null ? who : ScoreHolder.forNameOnly("Welt");
            level.getServer().getScoreboard().getOrCreatePlayerScore(h, o).set((int) Math.round(anvilParse(value)));
        }
    }

    private static void anvilPutNum(ServerLevel level, Entity who, String scope, String name, double value) {
        anvilPut(level, who, scope, name, anvilFmt(value));
    }

    /** Aktuelle Werte in die Anzeige am Rand schreiben */
    private static void anvilShow(ServerLevel level, String scope, String name, String def) {
        Objective o = anvilObj(level, name);
        if (scope.equals("p") || scope.equals("l")) {
            for (Player p : level.getServer().getPlayerList().getPlayers())
                level.getServer().getScoreboard().getOrCreatePlayerScore(p, o).set((int) Math.round(anvilParse(anvilVar(level, p, scope, name, def))));
        } else level.getServer().getScoreboard().getOrCreatePlayerScore(ScoreHolder.forNameOnly("Welt"), o).set((int) Math.round(anvilParse(anvilVar(level, null, scope, name, def))));
    }

    private static java.nio.file.Path anvilVarFile(MinecraftServer server) {
        return server.getWorldPath(net.minecraft.world.level.storage.LevelResource.ROOT).resolve("data").resolve("rubinwerk_variables.json");
    }

    private static void anvilVarsLoad(ServerStartedEvent event) {
        ANVIL_VARS.clear();
        ANVIL_SESSION.clear();
        try {
            java.nio.file.Path f = anvilVarFile(event.getServer());
            if (java.nio.file.Files.exists(f)) {
                com.google.gson.JsonObject o = com.google.gson.JsonParser.parseString(java.nio.file.Files.readString(f)).getAsJsonObject();
                for (var e : o.entrySet()) ANVIL_VARS.put(e.getKey(), e.getValue().getAsString());
            }
        } catch (Exception e) {
            com.mojang.logging.LogUtils.getLogger().warn("Variablen konnten nicht geladen werden", e);
        }
    }

    private static void anvilVarsSave(MinecraftServer server) {
        if (!anvilVarsDirty) return;
        try {
            com.google.gson.JsonObject o = new com.google.gson.JsonObject();
            ANVIL_VARS.forEach(o::addProperty);
            java.nio.file.Path f = anvilVarFile(server);
            java.nio.file.Files.createDirectories(f.getParent());
            java.nio.file.Files.writeString(f, o.toString());
            anvilVarsDirty = false;
        } catch (Exception e) {
            com.mojang.logging.LogUtils.getLogger().warn("Variablen konnten nicht gespeichert werden", e);
        }
    }

    private static void anvilVarsStop(net.neoforged.neoforge.event.server.ServerStoppingEvent event) {
        anvilVarsSave(event.getServer());
    }

    /** „Spieler (bis zum Tod)“ beim Sterben zurücksetzen */
    private static void anvilVarsClone(PlayerEvent.Clone event) {
        if (!event.isWasDeath()) return;
        String prefix = "l:" + event.getOriginal().getStringUUID() + ":";
        if (ANVIL_VARS.keySet().removeIf(k -> k.startsWith(prefix))) anvilVarsDirty = true;
    }

    private static Item anvilBpItem(String id) {
        return BuiltInRegistries.ITEM.get(ResourceLocation.parse(id));
    }

    private static void anvilBp1(PlayerEvent.PlayerLoggedInEvent event) {
        final Player player = event.getEntity();
        if (!(player.level() instanceof ServerLevel level)) return;
        final LivingEntity target = player;
        final double x = player.getX(), y = player.getY(), z = player.getZ();
        final BlockState state = null;
        final ItemStack stack = player.getMainHandItem();
        final String message = "";
        if (("true".equals(anvilVar(level, player, "p", "begruesst", "false")))) {
            anvilObj(level, "rubine");
            anvilShow(level, "p", "rubine", "0");
            anvilRun(level, null, x, y, z, "scoreboard objectives setdisplay sidebar anv_rubine");
        } else {
            anvilRun(level, player, x, y, z, "title @s subtitle \"Suche Rubin-Erz unter Y 24\"");
            anvilRun(level, player, x, y, z, "title @s title \"Willkommen im Rubinwerk!\"");
            anvilRun(level, player, x, y, z, "give @s rubinwerk:ruby 3");
            if (player != null) player.displayClientMessage(Component.literal("Tipp: /rubin öffnet die Rubin-Zentrale. Strom: Rubin-Generator oder Solarpanel → Rubin-Kabel → Rubin-Presse oder Rubin-Akku."), false);
            anvilPut(level, player, "p", "begruesst", String.valueOf("true"));
            anvilObj(level, "rubine");
            anvilShow(level, "p", "rubine", "0");
            anvilRun(level, null, x, y, z, "scoreboard objectives setdisplay sidebar anv_rubine");
        }
    }

    private static void anvilBp2(BlockEvent.BreakEvent event) {
        if (!(event.getLevel() instanceof ServerLevel level)) return;
        final Player player = event.getPlayer();
        final LivingEntity target = player;
        final BlockPos pos = event.getPos();
        final double x = pos.getX() + 0.5, y = pos.getY() + 0.5, z = pos.getZ() + 0.5;
        final BlockState state = event.getState();
        final ItemStack stack = player != null ? player.getMainHandItem() : ItemStack.EMPTY;
        final String message = "";
        if (!(state != null && state.is(anvilBlock("rubinwerk:ruby_ore")))) return;
        anvilPutNum(level, player, "p", "rubine", anvilNum(level, player, "p", "rubine", 0.0) + 1.0);
        if (player != null) player.displayClientMessage(Component.literal("Rubine abgebaut: " + String.valueOf(anvilVar(level, player, "p", "rubine", "0")) + ""), true);
        if ((anvilNum(level, player, "p", "rubine", 0.0) == 10.0)) {
            anvilRun(level, player, x, y, z, "title @s subtitle \"10 Rubin-Erze abgebaut\"");
            anvilRun(level, player, x, y, z, "title @s title \"Rubin-Meister!\"");
            if (player != null) player.giveExperiencePoints(50);
            anvilRun(level, null, x, y, z, "playsound minecraft:ui.toast.challenge_complete master @a ~ ~ ~ 1 1");
        }
    }

    private static void anvilBp3(BlockEvent.BreakEvent event) {
        if (!(event.getLevel() instanceof ServerLevel level)) return;
        final Player player = event.getPlayer();
        final LivingEntity target = player;
        final BlockPos pos = event.getPos();
        final double x = pos.getX() + 0.5, y = pos.getY() + 0.5, z = pos.getZ() + 0.5;
        final BlockState state = event.getState();
        final ItemStack stack = player != null ? player.getMainHandItem() : ItemStack.EMPTY;
        final String message = "";
        if (!(state != null && state.is(anvilBlock("rubinwerk:deepslate_ruby_ore")))) return;
        anvilPutNum(level, player, "p", "rubine", anvilNum(level, player, "p", "rubine", 0.0) + 1.0);
        if (player != null) player.displayClientMessage(Component.literal("Rubine abgebaut: " + String.valueOf(anvilVar(level, player, "p", "rubine", "0")) + ""), true);
        if ((anvilNum(level, player, "p", "rubine", 0.0) == 10.0)) {
            anvilRun(level, player, x, y, z, "title @s subtitle \"10 Rubin-Erze abgebaut\"");
            anvilRun(level, player, x, y, z, "title @s title \"Rubin-Meister!\"");
            if (player != null) player.giveExperiencePoints(50);
            anvilRun(level, null, x, y, z, "playsound minecraft:ui.toast.challenge_complete master @a ~ ~ ~ 1 1");
        }
    }

    private static void anvilBp4(PlayerInteractEvent.RightClickItem event) {
        if (!(event.getLevel() instanceof ServerLevel level)) return;
        final Player player = event.getEntity();
        final LivingEntity target = player;
        final double x = player.getX(), y = player.getY(), z = player.getZ();
        final BlockState state = null;
        final ItemStack stack = event.getItemStack();
        final String message = "";
        if (!(stack.is(anvilBpItem("rubinwerk:ruby_wand")))) return;
        if ((anvilNum(level, null, "w", "magie", 0.0) >= 100.0)) {
            anvilPutNum(level, null, "w", "magie", anvilNum(level, null, "w", "magie", 0.0) - 100.0);
            if (player != null) { player.setDeltaMovement(player.getDeltaMovement().add(0, 0.80, 0)); player.hurtMarked = true; }
            anvilRun(level, null, x, y, z, "particle minecraft:crit ~ ~1 ~ 0.5 0.5 0.5 0.05 30");
            anvilRun(level, null, x, y, z, "playsound minecraft:entity.firework_rocket.launch master @a ~ ~ ~ 1 1");
            anvilRun(level, player, x, y, z, "effect give @s slow_falling 6 0");
        } else {
            if (player != null) player.displayClientMessage(Component.literal("Zu wenig Magie! (" + String.valueOf(anvilVar(level, null, "w", "magie", "0")) + "/100) – warte etwas oder schalte Turbo in /rubin ein."), true);
        }
    }

    private static void anvilBp6(net.neoforged.neoforge.event.RegisterCommandsEvent event) {
        event.getDispatcher().register(net.minecraft.commands.Commands.literal("rubin").executes(ctx -> { anvilBp6Run(ctx.getSource()); return 1; }));
    }

    private static void anvilBp6Run(CommandSourceStack source) {
        final ServerLevel level = source.getLevel();
        final Player player = source.getPlayer();
        final LivingEntity target = player;
        final double x = source.getPosition().x, y = source.getPosition().y, z = source.getPosition().z;
        final BlockState state = null;
        final ItemStack stack = player != null ? player.getMainHandItem() : ItemStack.EMPTY;
        final String message = "";
        if (player instanceof net.minecraft.server.level.ServerPlayer anvilSp) anvilOpenGui(anvilSp, "rubin_zentrale", null, null, BlockPos.containing(x, y, z), Component.literal(""));
    }

    static void anvilGuiClick(net.minecraft.server.level.ServerPlayer sp, String key, int el, BlockPos pos) {
        if (!(sp.level() instanceof ServerLevel level)) return;
        final Player player = sp;
        final LivingEntity target = sp;
        final double x = pos.getX() + 0.5, y = pos.getY() + 0.5, z = pos.getZ() + 0.5;
        final BlockState state = level.getBlockState(pos);
        final ItemStack stack = sp.getMainHandItem();
        final String message = "";
        switch (key + "#" + el) {
            case "rubin_zentrale#5" -> anvilFn_belohnung(level, player, target, x, y, z, state, stack, message);
            case "rubin_zentrale#6" -> { anvilPut(level, null, "w", "turbo", String.valueOf(!"true".equals(anvilVar(level, null, "w", "turbo", "false")))); }
            default -> {}
        }
    }

    static int anvilGuiValue(ServerLevel level, Player player, String key, int k) {
        return switch (key + "#" + k) {
            case "rubin_zentrale#0" -> (int) Math.round(anvilNum(level, player, "p", "rubine", 0.0));
            case "rubin_zentrale#1" -> (int) Math.round(anvilNum(level, null, "w", "magie", 0.0));
            case "rubin_zentrale#2" -> (int) Math.round(anvilNum(level, null, "w", "magie", 0.0));
            case "rubin_zentrale#3" -> "true".equals(anvilVar(level, null, "w", "turbo", "false")) ? 1 : 0;
            default -> 0;
        };
    }

    private static void anvilFn_belohnung(ServerLevel level, Player player, LivingEntity target, double x, double y, double z, BlockState state, ItemStack stack, String message) {
            if ((anvilNum(level, player, "p", "rubine", 0.0) >= 5.0)) {
                anvilPutNum(level, player, "p", "rubine", anvilNum(level, player, "p", "rubine", 0.0) - 5.0);
                anvilRun(level, player, x, y, z, "give @s rubinwerk:ruby_block 1");
                anvilRun(level, null, x, y, z, "playsound minecraft:entity.player.levelup master @a ~ ~ ~ 1 1");
                com.mojang.logging.LogUtils.getLogger().info("[Blueprint] " + "" + String.valueOf((player != null ? player.getName().getString() : "")) + " hat eine Belohnung abgeholt, Rubine jetzt: " + String.valueOf(anvilVar(level, player, "p", "rubine", "0")) + "");
            } else {
                if (player != null) player.displayClientMessage(Component.literal("Du brauchst 5 abgebaute Rubin-Erze (du hast " + String.valueOf(anvilVar(level, player, "p", "rubine", "0")) + ")."), false);
            }
    }

    private static void anvilTick(ServerTickEvent.Post event) {
        MinecraftServer server = event.getServer();
        long now = server.getTickCount();
        if (now % 1200L == 0) anvilVarsSave(server);
        if (!ANVIL_TASKS.isEmpty()) {
            java.util.List<AnvilTask> due = new java.util.ArrayList<>();
            ANVIL_TASKS.removeIf(t -> { if (t.at() <= now) { due.add(t); return true; } return false; });
            due.forEach(t -> t.run().run());
        }
        if (now % 100L == 0) {
            for (Player player : server.getPlayerList().getPlayers()) {
                if (!(player.level() instanceof ServerLevel level)) continue;
                final LivingEntity target = player;
                final double x = player.getX(), y = player.getY(), z = player.getZ();
                final BlockState state = null;
                final ItemStack stack = player.getMainHandItem();
                final String message = "";
            if (("true".equals(anvilVar(level, null, "w", "turbo", "false")))) {
                anvilPutNum(level, null, "w", "magie", anvilNum(level, null, "w", "magie", 0.0) + 40.0);
                anvilPutNum(level, null, "w", "magie", Math.min(anvilNum(level, null, "w", "magie", 0.0), 1000.0));
            } else {
                anvilPutNum(level, null, "w", "magie", anvilNum(level, null, "w", "magie", 0.0) + 10.0);
                anvilPutNum(level, null, "w", "magie", Math.min(anvilNum(level, null, "w", "magie", 0.0), 1000.0));
            }
            }
        }
    }

    private static void registerBrewing(RegisterBrewingRecipesEvent event) {
        event.getBuilder().addMix(Potions.AWKWARD, anvilItem("rubinwerk:ruby_dust"), Potions.STRENGTH);
    }
}
