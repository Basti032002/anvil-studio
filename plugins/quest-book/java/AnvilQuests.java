// =============================================================================
// AUTOMATISCH ERZEUGT von Anvil Studio aus dem Plugin „Quest-Buch“.
// Änderungen in dieser Datei werden beim nächsten Speichern überschrieben.
// =============================================================================
package {{package}};

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.mojang.brigadier.arguments.StringArgumentType;
import io.netty.buffer.ByteBuf;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.commands.Commands;
import net.minecraft.commands.arguments.EntityArgument;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.network.chat.Component;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.ClientboundCustomPayloadPacket;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.CreativeModeTabs;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.storage.LevelResource;
import net.neoforged.bus.api.IEventBus;
import net.neoforged.neoforge.common.NeoForge;
import net.neoforged.neoforge.event.BuildCreativeModeTabContentsEvent;
import net.neoforged.neoforge.event.RegisterCommandsEvent;
import net.neoforged.neoforge.event.entity.living.LivingDeathEvent;
import net.neoforged.neoforge.event.entity.player.PlayerEvent;
import net.neoforged.neoforge.event.level.BlockEvent;
import net.neoforged.neoforge.event.server.ServerStartedEvent;
import net.neoforged.neoforge.event.server.ServerStoppingEvent;
import net.neoforged.neoforge.event.tick.PlayerTickEvent;
import net.neoforged.neoforge.event.tick.ServerTickEvent;
import net.neoforged.neoforge.network.event.RegisterPayloadHandlersEvent;
import net.neoforged.neoforge.registries.DeferredItem;

@SuppressWarnings("unused")
public final class AnvilQuests {
    public static final String MODID = "{{modid}}";
    static final String EVENT_DONE = "{{id}}:quest_done";

    private AnvilQuests() {}

    // ---- Quests aus dem Editor (data/MODID/anvil_quests.json) ----
    public record Task(String type, String target, int count) {}
    public record Reward(String type, String target, int count, String command) {}
    public record Quest(String id, String title, String chapter, String icon, String desc, List<String> requires, List<Task> tasks, List<Reward> rewards,
                        boolean claim, boolean notify, boolean repeatable, boolean hidden) {}

    public static final List<Quest> QUESTS = new ArrayList<>();
    public static final Map<String, Quest> BY_ID = new HashMap<>();

    static {
        try (var in = AnvilQuests.class.getResourceAsStream("/data/" + MODID + "/anvil_quests.json")) {
            if (in != null) {
                JsonArray arr = JsonParser.parseString(new String(in.readAllBytes(), StandardCharsets.UTF_8)).getAsJsonArray();
                for (JsonElement el : arr) {
                    JsonObject o = el.getAsJsonObject();
                    String id = s(o, "id");
                    if (id.isEmpty()) continue;
                    List<String> req = new ArrayList<>();
                    if (o.has("requires") && o.get("requires").isJsonArray()) for (JsonElement r : o.getAsJsonArray("requires")) req.add(r.getAsString());
                    List<Task> tasks = new ArrayList<>();
                    for (JsonObject t : rows(o, "tasks")) {
                        String type = s(t, "type");
                        String target = switch (type) {
                            case "give", "have" -> s(t, "item");
                            case "break", "place" -> s(t, "block");
                            case "kill" -> s(t, "entity");
                            case "dimension" -> s(t, "dimension");
                            case "biome" -> s(t, "biome");
                            default -> "";
                        };
                        int count = type.equals("dimension") || type.equals("biome") ? 1 : Math.max(1, n(t, "count", 1));
                        if (!type.isEmpty()) tasks.add(new Task(type, rid(target), count));
                    }
                    List<Reward> rewards = new ArrayList<>();
                    for (JsonObject r : rows(o, "rewards")) {
                        String type = s(r, "type");
                        if (!type.isEmpty()) rewards.add(new Reward(type, rid(s(r, "item")), Math.max(1, n(r, "count", 1)), s(r, "command")));
                    }
                    Quest q = new Quest(id, s(o, "title").isEmpty() ? id : s(o, "title"), s(o, "chapter"), rid(s(o, "icon")), s(o, "description"), req, tasks, rewards,
                            !"false".equals(s(o, "claim")), !"false".equals(s(o, "notify")), "true".equals(s(o, "repeatable")), "true".equals(s(o, "hidden")));
                    QUESTS.add(q);
                    BY_ID.put(id, q);
                }
            }
        } catch (Exception e) {
            com.mojang.logging.LogUtils.getLogger().warn("Quests konnten nicht geladen werden", e);
        }
    }

    private static String s(JsonObject o, String k) {
        return o.has(k) && o.get(k).isJsonPrimitive() ? o.get(k).getAsString().trim() : "";
    }

    private static int n(JsonObject o, String k, int def) {
        try { return (int) Math.round(Double.parseDouble(s(o, k).replace(',', '.'))); } catch (Exception e) { return def; }
    }

    private static List<JsonObject> rows(JsonObject o, String k) {
        List<JsonObject> out = new ArrayList<>();
        if (o.has(k) && o.get(k).isJsonArray()) for (JsonElement e : o.getAsJsonArray(k)) if (e.isJsonObject()) out.add(e.getAsJsonObject());
        return out;
    }

    /** IDs ohne Namensraum gehören zu Minecraft */
    static String rid(String id) {
        if (id.isEmpty() || id.startsWith("#")) return id;
        return id.contains(":") ? id : "minecraft:" + id;
    }

    /** leeres Ziel = egal was */
    static boolean same(String target, String id) {
        return target.isEmpty() || target.equals(id);
    }

    // ---- Quest-Buch ----
    public static DeferredItem<Item> BOOK;

    public static final class QuestBookItem extends Item {
        public QuestBookItem(Item.Properties p) {
            super(p);
        }

        @Override
        public Component getName(ItemStack stack) {
            return Component.translatableWithFallback("item." + MODID + ".quest_book", "Quest Book");
        }

{{if mc>=1.21.2}}
        @Override
        public net.minecraft.world.InteractionResult use(Level level, Player player, InteractionHand hand) {
            if (player instanceof ServerPlayer sp) sync(sp, "open");
            return net.minecraft.world.InteractionResult.SUCCESS;
        }
{{else}}
        @Override
        public net.minecraft.world.InteractionResultHolder<ItemStack> use(Level level, Player player, InteractionHand hand) {
            if (player instanceof ServerPlayer sp) sync(sp, "open");
            return net.minecraft.world.InteractionResultHolder.sidedSuccess(player.getItemInHand(hand), level.isClientSide());
        }
{{end}}
    }

    /** Wird von Anvil Studio aus AnvilContent.register(...) aufgerufen */
    public static void init(IEventBus modEventBus) {
        BOOK = {{root}}.anvil.AnvilContent.ITEMS.registerItem("quest_book", QuestBookItem::new, {{if mc>=1.21.9}}() -> {{end}}new Item.Properties().stacksTo(1));
        modEventBus.addListener(AnvilQuests::tabs);
        modEventBus.addListener(AnvilQuests::payloads);
        NeoForge.EVENT_BUS.addListener(AnvilQuests::started);
        NeoForge.EVENT_BUS.addListener(AnvilQuests::stopping);
        NeoForge.EVENT_BUS.addListener(AnvilQuests::serverTick);
        NeoForge.EVENT_BUS.addListener(AnvilQuests::login);
        NeoForge.EVENT_BUS.addListener(AnvilQuests::playerTick);
        NeoForge.EVENT_BUS.addListener(AnvilQuests::broke);
        NeoForge.EVENT_BUS.addListener(AnvilQuests::placed);
        NeoForge.EVENT_BUS.addListener(AnvilQuests::died);
        NeoForge.EVENT_BUS.addListener(AnvilQuests::commands);
    }

    private static void tabs(BuildCreativeModeTabContentsEvent e) {
        if (e.getTabKey() == CreativeModeTabs.TOOLS_AND_UTILITIES) e.accept(BOOK.get());
    }

    // ---- Netzwerk: Zustand an den Spieler, Aktionen vom Buch an den Server ----
    public record SyncPayload(String json, String event) implements CustomPacketPayload {
        public static final Type<SyncPayload> TYPE = new Type<>(ResourceLocation.fromNamespaceAndPath(MODID, "quest_sync"));
        public static final StreamCodec<ByteBuf, SyncPayload> CODEC = StreamCodec.composite(ByteBufCodecs.stringUtf8(1 << 20), SyncPayload::json, ByteBufCodecs.stringUtf8(256), SyncPayload::event, SyncPayload::new);

        @Override
        public Type<? extends CustomPacketPayload> type() {
            return TYPE;
        }
    }

    public record ActionPayload(String action, String quest) implements CustomPacketPayload {
        public static final Type<ActionPayload> TYPE = new Type<>(ResourceLocation.fromNamespaceAndPath(MODID, "quest_action"));
        public static final StreamCodec<ByteBuf, ActionPayload> CODEC = StreamCodec.composite(ByteBufCodecs.stringUtf8(32), ActionPayload::action, ByteBufCodecs.stringUtf8(256), ActionPayload::quest, ActionPayload::new);

        @Override
        public Type<? extends CustomPacketPayload> type() {
            return TYPE;
        }
    }

    private static void payloads(RegisterPayloadHandlersEvent e) {
        var r = e.registrar("1").optional();
        r.playToClient(SyncPayload.TYPE, SyncPayload.CODEC, (p, ctx) -> QuestScreen.receive(p.json(), p.event()));
        r.playToServer(ActionPayload.TYPE, ActionPayload.CODEC, (p, ctx) -> {
            if (ctx.player() instanceof ServerPlayer sp) action(sp, p.action(), p.quest());
        });
    }

    // ---- Fortschritt je Spieler: <Welt>/data/MODID_quests.json ----
    static final class PState {
        final Set<String> done = new HashSet<>();
        final Set<String> claimed = new HashSet<>();
        final Set<String> unlocked = new HashSet<>();
        final Map<String, int[]> prog = new HashMap<>();
        boolean book;
    }

    private static final Map<UUID, PState> STATES = new HashMap<>();
    private static final Set<UUID> CHANGED = new HashSet<>();
    private static boolean dirty;
    private static MinecraftServer server;

    private static Path file(MinecraftServer s) {
        return s.getWorldPath(LevelResource.ROOT).resolve("data").resolve(MODID + "_quests.json");
    }

    private static void started(ServerStartedEvent e) {
        server = e.getServer();
        STATES.clear();
        try {
            Path f = file(server);
            if (!Files.exists(f)) return;
            JsonObject all = JsonParser.parseString(Files.readString(f)).getAsJsonObject();
            for (var en : all.entrySet()) {
                JsonObject o = en.getValue().getAsJsonObject();
                PState st = new PState();
                for (String k : new String[] {"done", "claimed", "unlocked"}) {
                    Set<String> set = k.equals("done") ? st.done : k.equals("claimed") ? st.claimed : st.unlocked;
                    if (o.has(k)) for (JsonElement x : o.getAsJsonArray(k)) set.add(x.getAsString());
                }
                if (o.has("prog")) for (var p : o.getAsJsonObject("prog").entrySet()) {
                    JsonArray a = p.getValue().getAsJsonArray();
                    int[] v = new int[a.size()];
                    for (int i = 0; i < v.length; i++) v[i] = a.get(i).getAsInt();
                    st.prog.put(p.getKey(), v);
                }
                st.book = o.has("book") && o.get("book").getAsBoolean();
                STATES.put(UUID.fromString(en.getKey()), st);
            }
        } catch (Exception ex) {
            com.mojang.logging.LogUtils.getLogger().warn("Quest-Fortschritt konnte nicht geladen werden", ex);
        }
    }

    private static void save() {
        if (!dirty || server == null) return;
        try {
            JsonObject all = new JsonObject();
            STATES.forEach((id, st) -> {
                JsonObject o = new JsonObject();
                o.add("done", arr(st.done));
                o.add("claimed", arr(st.claimed));
                o.add("unlocked", arr(st.unlocked));
                JsonObject p = new JsonObject();
                st.prog.forEach((k, v) -> {
                    JsonArray a = new JsonArray();
                    for (int x : v) a.add(x);
                    p.add(k, a);
                });
                o.add("prog", p);
                o.addProperty("book", st.book);
                all.add(id.toString(), o);
            });
            Path f = file(server);
            Files.createDirectories(f.getParent());
            Files.writeString(f, all.toString());
            dirty = false;
        } catch (Exception ex) {
            com.mojang.logging.LogUtils.getLogger().warn("Quest-Fortschritt konnte nicht gespeichert werden", ex);
        }
    }

    private static JsonArray arr(Collection<String> c) {
        JsonArray a = new JsonArray();
        c.stream().sorted().forEach(a::add);
        return a;
    }

    private static void stopping(ServerStoppingEvent e) {
        save();
        server = null;
    }

    private static void serverTick(ServerTickEvent.Post e) {
        if (e.getServer().getTickCount() % 200 == 0) save();
        if (!CHANGED.isEmpty() && e.getServer().getTickCount() % 5 == 0) {
            for (UUID id : new ArrayList<>(CHANGED)) {
                ServerPlayer sp = e.getServer().getPlayerList().getPlayer(id);
                if (sp != null) sync(sp, "");
            }
            CHANGED.clear();
        }
    }

    static PState state(Player p) {
        return STATES.computeIfAbsent(p.getUUID(), k -> new PState());
    }

    private static void changed(ServerPlayer sp) {
        dirty = true;
        CHANGED.add(sp.getUUID());
    }

    // ---- Status ----
    public static boolean isDone(Player p, String id) {
        return p instanceof ServerPlayer && state(p).done.contains(id);
    }

    public static boolean isUnlocked(Player p, String id) {
        Quest q = BY_ID.get(id);
        if (q == null || !(p instanceof ServerPlayer)) return false;
        PState st = state(p);
        return st.unlocked.contains(id) || st.done.contains(id) || q.requires().stream().allMatch(st.done::contains);
    }

    public static boolean isActive(Player p, String id) {
        return isUnlocked(p, id) && !isDone(p, id);
    }

    private static int[] prog(PState st, Quest q) {
        int[] v = st.prog.get(q.id());
        if (v == null || v.length != q.tasks().size()) {
            int[] n = new int[q.tasks().size()];
            if (v != null) System.arraycopy(v, 0, n, 0, Math.min(v.length, n.length));
            st.prog.put(q.id(), n);
            v = n;
        }
        return v;
    }

    /** Fortschritt für alle laufenden Quests mit passender Aufgabe erhöhen */
    private static void count(ServerPlayer sp, String type, String id, int amount) {
        PState st = state(sp);
        boolean any = false;
        for (Quest q : QUESTS) {
            if (!isActive(sp, q.id())) continue;
            int[] v = prog(st, q);
            for (int i = 0; i < q.tasks().size(); i++) {
                Task t = q.tasks().get(i);
                if (t.type().equals(type) && same(t.target(), id) && v[i] < t.count()) {
                    v[i] = Math.min(t.count(), v[i] + amount);
                    any = true;
                }
            }
            check(sp, q);
        }
        if (any) changed(sp);
    }

    private static boolean complete(PState st, Quest q) {
        int[] v = prog(st, q);
        for (int i = 0; i < q.tasks().size(); i++) if (v[i] < q.tasks().get(i).count()) return false;
        return true;
    }

    private static void check(ServerPlayer sp, Quest q) {
        PState st = state(sp);
        if (!st.done.contains(q.id()) && isUnlocked(sp, q.id()) && complete(st, q)) finish(sp, q);
    }

    private static void finish(ServerPlayer sp, Quest q) {
        PState st = state(sp);
        st.done.add(q.id());
        if (!q.claim()) reward(sp, q);
        changed(sp);
        if (q.notify()) sync(sp, "done:" + q.id());
        {{root}}.anvil.AnvilContent.anvilPluginEvent(EVENT_DONE, (ServerLevel) sp.level(), sp, q.id());
        // nachfolgende Quests könnten jetzt schon erfüllt sein (z. B. „Ort erreichen“)
        for (Quest other : QUESTS) if (other != q && other.requires().contains(q.id())) check(sp, other);
    }

    private static void reward(ServerPlayer sp, Quest q) {
        PState st = state(sp);
        ServerLevel level = (ServerLevel) sp.level();
        for (Reward r : q.rewards()) {
            switch (r.type()) {
                case "item" -> {
                    Item item = BuiltInRegistries.ITEM.{{if mc>=1.21.2}}getValue{{else}}get{{end}}(ResourceLocation.parse(r.target().isEmpty() ? "minecraft:air" : r.target()));
                    ItemStack stack = new ItemStack(item, r.count());
                    if (!stack.isEmpty() && !sp.getInventory().add(stack)) sp.drop(stack, false);
                }
                case "xp" -> sp.giveExperiencePoints(r.count());
                case "command" -> {
                    if (!r.command().isBlank()) {
                        CommandSourceStack src = level.getServer().createCommandSourceStack().withLevel(level).withEntity(sp).withPosition(sp.position()).withPermission(4).withSuppressedOutput();
                        level.getServer().getCommands().performPrefixedCommand(src, r.command().trim().replaceFirst("^/", ""));
                    }
                }
                default -> {}
            }
        }
        st.claimed.add(q.id());
        if (q.repeatable()) {
            st.done.remove(q.id());
            st.claimed.remove(q.id());
            st.prog.remove(q.id());
        }
        changed(sp);
    }

    // ---- Aktionen aus dem Buch ----
    private static void action(ServerPlayer sp, String action, String id) {
        Quest q = BY_ID.get(id);
        if (q == null) return;
        PState st = state(sp);
        switch (action) {
            case "give" -> {
                if (!isActive(sp, id)) return;
                int[] v = prog(st, q);
                var inv = sp.getInventory();
                for (int i = 0; i < q.tasks().size(); i++) {
                    Task t = q.tasks().get(i);
                    if (!t.type().equals("give")) continue;
                    for (int s = 0; s < inv.getContainerSize() && v[i] < t.count(); s++) {
                        ItemStack stack = inv.getItem(s);
                        if (stack.isEmpty() || !same(t.target(), BuiltInRegistries.ITEM.getKey(stack.getItem()).toString())) continue;
                        int take = Math.min(stack.getCount(), t.count() - v[i]);
                        stack.shrink(take);
                        v[i] += take;
                    }
                }
                changed(sp);
                check(sp, q);
            }
            case "claim" -> {
                if (st.done.contains(id) && !st.claimed.contains(id)) reward(sp, q);
            }
            default -> {}
        }
        sync(sp, "");
    }

    // ---- Ereignisse aus dem Spiel ----
    private static void login(PlayerEvent.PlayerLoggedInEvent e) {
        if (!(e.getEntity() instanceof ServerPlayer sp) || QUESTS.isEmpty()) return;
        PState st = state(sp);
        if (!st.book) {
            st.book = true;
            dirty = true;
            ItemStack b = new ItemStack(BOOK.get());
            if (!sp.getInventory().add(b)) sp.drop(b, false);
        }
        sync(sp, "");
    }

    private static void playerTick(PlayerTickEvent.Post e) {
        if (!(e.getEntity() instanceof ServerPlayer sp) || sp.tickCount % 20 != 0 || QUESTS.isEmpty()) return;
        PState st = state(sp);
        String dim = sp.level().dimension().location().toString();
        String biome = sp.level().getBiome(sp.blockPosition()).unwrapKey().map(k -> k.location().toString()).orElse("");
        boolean any = false;
        for (Quest q : QUESTS) {
            if (!isActive(sp, q.id())) continue;
            int[] v = prog(st, q);
            for (int i = 0; i < q.tasks().size(); i++) {
                Task t = q.tasks().get(i);
                int nv = v[i];
                switch (t.type()) {
                    case "dimension" -> { if (same(t.target(), dim)) nv = 1; }
                    case "biome" -> { if (same(t.target(), biome)) nv = 1; }
                    case "have" -> {
                        int have = 0;
                        var inv = sp.getInventory();
                        for (int s = 0; s < inv.getContainerSize(); s++) {
                            ItemStack stack = inv.getItem(s);
                            if (!stack.isEmpty() && same(t.target(), BuiltInRegistries.ITEM.getKey(stack.getItem()).toString())) have += stack.getCount();
                        }
                        nv = Math.min(t.count(), have);
                    }
                    default -> {}
                }
                if (nv != v[i]) {
                    v[i] = nv;
                    any = true;
                }
            }
            check(sp, q);
        }
        if (any) changed(sp);
    }

    private static void broke(BlockEvent.BreakEvent e) {
        if (e.getPlayer() instanceof ServerPlayer sp) count(sp, "break", BuiltInRegistries.BLOCK.getKey(e.getState().getBlock()).toString(), 1);
    }

    private static void placed(BlockEvent.EntityPlaceEvent e) {
        if (e.getEntity() instanceof ServerPlayer sp) count(sp, "place", BuiltInRegistries.BLOCK.getKey(e.getPlacedBlock().getBlock()).toString(), 1);
    }

    private static void died(LivingDeathEvent e) {
        Entity killer = e.getSource().getEntity();
        if (killer instanceof ServerPlayer sp) count(sp, "kill", BuiltInRegistries.ENTITY_TYPE.getKey(e.getEntity().getType()).toString(), 1);
    }

    // ---- Befehle: /quests, /quests reset <Spieler>, /quests complete <Quest> <Spieler> ----
    private static void commands(RegisterCommandsEvent e) {
        e.getDispatcher().register(Commands.literal("quests")
                .executes(c -> {
                    if (c.getSource().getEntity() instanceof ServerPlayer sp) sync(sp, "open");
                    return 1;
                })
                .then(Commands.literal("reset").requires(s -> s.hasPermission(2))
                        .then(Commands.argument("player", EntityArgument.player()).executes(c -> {
                            ServerPlayer sp = EntityArgument.getPlayer(c, "player");
                            PState old = STATES.remove(sp.getUUID());
                            PState st = state(sp);
                            st.book = old != null && old.book;
                            changed(sp);
                            c.getSource().sendSuccess(() -> Component.literal("Quests reset: " + sp.getName().getString()), true);
                            return 1;
                        })))
                .then(Commands.literal("complete").requires(s -> s.hasPermission(2))
                        .then(Commands.argument("quest", StringArgumentType.word())
                                .suggests((c, b) -> {
                                    QUESTS.forEach(q -> b.suggest(q.id()));
                                    return b.buildFuture();
                                })
                                .then(Commands.argument("player", EntityArgument.player()).executes(c -> {
                                    ServerPlayer sp = EntityArgument.getPlayer(c, "player");
                                    Quest q = BY_ID.get(StringArgumentType.getString(c, "quest"));
                                    if (q == null) return 0;
                                    complete(sp, q.id());
                                    return 1;
                                })))));
    }

    // ---- Für Blueprints ----
    public static void unlock(Player p, String id) {
        if (!(p instanceof ServerPlayer sp) || !BY_ID.containsKey(id)) return;
        state(sp).unlocked.add(id);
        changed(sp);
        check(sp, BY_ID.get(id));
    }

    public static void complete(Player p, String id) {
        if (!(p instanceof ServerPlayer sp)) return;
        Quest q = BY_ID.get(id);
        if (q == null || state(sp).done.contains(id)) return;
        int[] v = prog(state(sp), q);
        for (int i = 0; i < v.length; i++) v[i] = q.tasks().get(i).count();
        finish(sp, q);
    }

    public static void reset(Player p, String id) {
        if (!(p instanceof ServerPlayer sp)) return;
        PState st = state(sp);
        st.done.remove(id);
        st.claimed.remove(id);
        st.unlocked.remove(id);
        st.prog.remove(id);
        changed(sp);
    }

    /** Fortschritt einer Aufgabe (1 = erste) erhöhen */
    public static void progress(Player p, String id, int task, int amount) {
        if (!(p instanceof ServerPlayer sp)) return;
        Quest q = BY_ID.get(id);
        if (q == null || !isActive(sp, id) || task < 1 || task > q.tasks().size()) return;
        int[] v = prog(state(sp), q);
        v[task - 1] = Math.max(0, Math.min(q.tasks().get(task - 1).count(), v[task - 1] + amount));
        changed(sp);
        check(sp, q);
    }

    public static int doneCount(Player p) {
        return p instanceof ServerPlayer ? state(p).done.size() : 0;
    }

    // ---- Zustand an den Client ----
    public static void sync(ServerPlayer sp, String event) {
        PState st = state(sp);
        JsonObject o = new JsonObject();
        o.add("done", arr(st.done));
        o.add("claimed", arr(st.claimed));
        JsonArray open = new JsonArray();
        for (Quest q : QUESTS) if (isUnlocked(sp, q.id())) open.add(q.id());
        o.add("unlocked", open);
        JsonObject p = new JsonObject();
        for (Quest q : QUESTS) {
            JsonArray a = new JsonArray();
            for (int x : prog(st, q)) a.add(x);
            p.add(q.id(), a);
        }
        o.add("prog", p);
        sp.connection.send(new ClientboundCustomPayloadPacket(new SyncPayload(o.toString(), event)));
    }
}
