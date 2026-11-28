// =============================================================================
// AUTOMATISCH ERZEUGT von Anvil Studio aus dem Plugin „Quest-Buch“ – nur auf dem Client benutzt.
// =============================================================================
package {{package}};

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.util.*;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.components.toasts.SystemToast;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.network.chat.Component;
import net.minecraft.network.protocol.common.ServerboundCustomPayloadPacket;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.util.FormattedCharSequence;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;

@SuppressWarnings("unused")
public class QuestScreen extends Screen {
    // ---- Zustand vom Server ----
    static final Set<String> DONE = new HashSet<>();
    static final Set<String> CLAIMED = new HashSet<>();
    static final Set<String> UNLOCKED = new HashSet<>();
    static final Map<String, int[]> PROG = new HashMap<>();
    static String chapter = null;
    static String selected = null;

    /** Aufgerufen, wenn der Server den Fortschritt schickt */
    public static void receive(String json, String event) {
        try {
            JsonObject o = JsonParser.parseString(json).getAsJsonObject();
            fill(DONE, o.getAsJsonArray("done"));
            fill(CLAIMED, o.getAsJsonArray("claimed"));
            fill(UNLOCKED, o.getAsJsonArray("unlocked"));
            PROG.clear();
            for (var e : o.getAsJsonObject("prog").entrySet()) {
                JsonArray a = e.getValue().getAsJsonArray();
                int[] v = new int[a.size()];
                for (int i = 0; i < v.length; i++) v[i] = a.get(i).getAsInt();
                PROG.put(e.getKey(), v);
            }
        } catch (Exception ignored) {
        }
        Minecraft mc = Minecraft.getInstance();
        if ("open".equals(event)) mc.setScreen(new QuestScreen());
        else if (event.startsWith("done:")) {
            AnvilQuests.Quest q = AnvilQuests.BY_ID.get(event.substring(5));
            if (q != null) {
                {{if mc>=1.21.2}}var toasts = mc.getToastManager();{{else}}var toasts = mc.getToasts();{{end}}
                SystemToast.addOrUpdate(toasts, SystemToast.SystemToastId.PERIODIC_NOTIFICATION, tr("done", "Quest complete!"), Component.literal(q.title()));
            }
        }
        if (mc.screen instanceof QuestScreen s) s.rebuildWidgets();
    }

    private static void fill(Set<String> set, JsonArray a) {
        set.clear();
        if (a != null) for (JsonElement e : a) set.add(e.getAsString());
    }

    static Component tr(String key, String fallback) {
        return Component.translatableWithFallback("quest." + AnvilQuests.MODID + "." + key, fallback);
    }

    // ---- Fenster ----
    private int left, top, w, h, page;

    public QuestScreen() {
        super(tr("title", "Quest Book"));
    }

    @Override
    public boolean isPauseScreen() {
        return false;
    }

    private List<String> chapters() {
        List<String> out = new ArrayList<>();
        for (AnvilQuests.Quest q : AnvilQuests.QUESTS) if (visible(q) && !out.contains(q.chapter())) out.add(q.chapter());
        return out;
    }

    private static boolean visible(AnvilQuests.Quest q) {
        return !q.hidden() || UNLOCKED.contains(q.id());
    }

    private List<AnvilQuests.Quest> list() {
        List<AnvilQuests.Quest> out = new ArrayList<>();
        for (AnvilQuests.Quest q : AnvilQuests.QUESTS) if (visible(q) && Objects.equals(q.chapter(), chapter)) out.add(q);
        return out;
    }

    private static String mark(AnvilQuests.Quest q) {
        if (CLAIMED.contains(q.id()) || (DONE.contains(q.id()) && !q.claim())) return "§2✔ ";
        if (DONE.contains(q.id())) return "§6★ ";
        if (UNLOCKED.contains(q.id())) return "§e» ";
        return "§8✖ ";
    }

    @Override
    protected void init() {
        w = Math.min(width - 16, 460);
        h = Math.min(height - 16, 260);
        left = (width - w) / 2;
        top = (height - h) / 2;
        List<String> chs = chapters();
        if (chapter == null || !chs.contains(chapter)) chapter = chs.isEmpty() ? "" : chs.get(0);
        // Kapitel-Reiter
        int x = left + 6;
        for (String c : chs) {
            String label = c.isEmpty() ? tr("quests", "Quests").getString() : c;
            int bw = Math.min(110, font.width(label) + 14);
            addRenderableWidget(Button.builder(Component.literal((c.equals(chapter) ? "§l" : "") + label), b -> {
                chapter = c;
                selected = null;
                page = 0;
                rebuildWidgets();
            }).bounds(x, top + 20, bw, 16).build());
            x += bw + 3;
            if (x > left + w - 40) break;
        }
        // Quest-Liste (links)
        List<AnvilQuests.Quest> qs = list();
        if (selected == null || qs.stream().noneMatch(q -> q.id().equals(selected))) selected = qs.isEmpty() ? null : qs.get(0).id();
        int rows = Math.max(1, (h - 70) / 18);
        int pages = Math.max(1, (qs.size() + rows - 1) / rows);
        page = Math.min(page, pages - 1);
        for (int i = page * rows; i < Math.min(qs.size(), (page + 1) * rows); i++) {
            AnvilQuests.Quest q = qs.get(i);
            String t = q.title();
            if (font.width(t) > 108) t = font.plainSubstrByWidth(t, 104) + "…";
            Button b = Button.builder(Component.literal(mark(q) + (q.id().equals(selected) ? "§f§l" : "§r") + t), btn -> {
                selected = q.id();
                rebuildWidgets();
            }).bounds(left + 6, top + 42 + (i - page * rows) * 18, 132, 16).build();
            addRenderableWidget(b);
        }
        if (pages > 1) {
            addRenderableWidget(Button.builder(Component.literal("<"), b -> { page = Math.max(0, page - 1); rebuildWidgets(); }).bounds(left + 6, top + h - 22, 20, 16).build()).active = page > 0;
            addRenderableWidget(Button.builder(Component.literal(">"), b -> { page = Math.min(pages - 1, page + 1); rebuildWidgets(); }).bounds(left + 118, top + h - 22, 20, 16).build()).active = page < pages - 1;
        }
        // Knöpfe der gewählten Quest
        AnvilQuests.Quest q = selected == null ? null : AnvilQuests.BY_ID.get(selected);
        if (q != null) {
            int bx = left + w - 8;
            if (q.claim() && DONE.contains(q.id()) && !CLAIMED.contains(q.id())) {
                Component c = tr("claim", "Claim reward");
                int bw = font.width(c) + 20;
                bx -= bw;
                addRenderableWidget(Button.builder(c, b -> send("claim", q.id())).bounds(bx, top + h - 24, bw, 18).build());
                bx -= 4;
            }
            boolean gives = q.tasks().stream().anyMatch(t -> t.type().equals("give"));
            if (gives && UNLOCKED.contains(q.id()) && !DONE.contains(q.id())) {
                Component c = tr("give", "Hand in items");
                int bw = font.width(c) + 20;
                bx -= bw;
                addRenderableWidget(Button.builder(c, b -> send("give", q.id())).bounds(bx, top + h - 24, bw, 18).build());
            }
        }
    }

    private static void send(String action, String quest) {
        var conn = Minecraft.getInstance().getConnection();
        if (conn != null) conn.send(new ServerboundCustomPayloadPacket(new AnvilQuests.ActionPayload(action, quest)));
    }

    @Override
    public void renderBackground(GuiGraphics g, int mouseX, int mouseY, float partialTick) {
        super.renderBackground(g, mouseX, mouseY, partialTick);
        // Rahmen im Stil von Minecraft
        g.fill(left - 1, top - 1, left + w + 1, top + h + 1, 0xFF000000);
        g.fill(left, top, left + w, top + h, 0xFFC6C6C6);
        g.fill(left, top, left + w, top + 2, 0xFFFFFFFF);
        g.fill(left, top, left + 2, top + h, 0xFFFFFFFF);
        g.fill(left, top + h - 2, left + w, top + h, 0xFF555555);
        g.fill(left + w - 2, top, left + w, top + h, 0xFF555555);
        // Bereich der Liste und der Details
        g.fill(left + 4, top + 40, left + 140, top + h - 4, 0xFF8B8B8B);
        g.fill(left + 144, top + 40, left + w - 4, top + h - 4, 0xFFD8D8D8);
    }

    @Override
    public void render(GuiGraphics g, int mouseX, int mouseY, float partialTick) {
        super.render(g, mouseX, mouseY, partialTick);
        int total = 0, done = 0;
        for (AnvilQuests.Quest q : AnvilQuests.QUESTS) if (visible(q)) { total++; if (DONE.contains(q.id())) done++; }
        g.drawString(font, title, left + 8, top + 7, 0xFF3F3F3F, false);
        String count = done + " / " + total;
        g.drawString(font, count, left + w - 8 - font.width(count), top + 7, 0xFF3F3F3F, false);

        AnvilQuests.Quest q = selected == null ? null : AnvilQuests.BY_ID.get(selected);
        int x = left + 150, y = top + 46, dw = w - 160;
        if (q == null) {
            g.drawString(font, tr("empty", "No quests here yet."), x, y, 0xFF555555, false);
            return;
        }
        ItemStack icon = item(q.icon());
        if (!icon.isEmpty()) g.renderItem(icon, x, y - 2);
        int tx = icon.isEmpty() ? x : x + 20;
        g.drawString(font, q.title(), tx, y, 0xFF202020, false);
        Component status = CLAIMED.contains(q.id()) || (DONE.contains(q.id()) && !q.claim()) ? tr("status.done", "Completed")
                : DONE.contains(q.id()) ? tr("status.claim", "Reward ready")
                : UNLOCKED.contains(q.id()) ? tr("status.active", "In progress") : tr("status.locked", "Locked");
        g.drawString(font, status, tx, y + 10, DONE.contains(q.id()) ? 0xFF2E7D22 : UNLOCKED.contains(q.id()) ? 0xFF8A6500 : 0xFF6B6B6B, false);
        y += 26;
        if (!UNLOCKED.contains(q.id()) && !q.requires().isEmpty()) {
            List<String> names = new ArrayList<>();
            for (String r : q.requires()) if (!DONE.contains(r)) names.add(AnvilQuests.BY_ID.containsKey(r) ? AnvilQuests.BY_ID.get(r).title() : r);
            for (FormattedCharSequence line : font.split(Component.literal(tr("requires", "Requires: ").getString() + String.join(", ", names)), dw)) {
                g.drawString(font, line, x, y, 0xFF6B4E00, false);
                y += 10;
            }
            y += 4;
        }
        int lines = 0;
        for (FormattedCharSequence line : font.split(Component.literal(q.desc()), dw)) {
            if (++lines > 4) break;
            g.drawString(font, line, x, y, 0xFF3F3F3F, false);
            y += 10;
        }
        if (lines > 0) y += 4;
        // Aufgaben mit Balken
        if (!q.tasks().isEmpty()) {
            g.drawString(font, tr("tasks", "Tasks"), x, y, 0xFF202020, false);
            y += 12;
            int[] v = PROG.getOrDefault(q.id(), new int[q.tasks().size()]);
            for (int i = 0; i < q.tasks().size() && y < top + h - 60; i++) {
                AnvilQuests.Task t = q.tasks().get(i);
                int cur = i < v.length ? v[i] : 0;
                if (DONE.contains(q.id())) cur = t.count();
                String label = taskLabel(t);
                String num = cur + "/" + t.count();
                g.drawString(font, (cur >= t.count() ? "✔ " : "") + label, x, y, 0xFF2B2B2B, false);
                g.drawString(font, num, x + dw - font.width(num), y, 0xFF2B2B2B, false);
                int bw = dw, fillw = (int) Math.round(bw * Math.min(1.0, cur / (double) t.count()));
                g.fill(x, y + 10, x + bw, y + 14, 0xFF555555);
                g.fill(x, y + 10, x + fillw, y + 14, cur >= t.count() ? 0xFF3F9D2F : 0xFF5AA8FF);
                y += 19;
            }
        }
        // Belohnungen
        if (!q.rewards().isEmpty() && y < top + h - 34) {
            g.drawString(font, tr("rewards", "Rewards"), x, y, 0xFF202020, false);
            y += 12;
            int rx = x;
            List<String> text = new ArrayList<>();
            for (AnvilQuests.Reward r : q.rewards()) {
                switch (r.type()) {
                    case "item" -> {
                        ItemStack st = item(r.target());
                        if (!st.isEmpty()) {
                            g.renderItem(st, rx, y);
                            if (r.count() > 1) g.drawString(font, String.valueOf(r.count()), rx + 17 - font.width(String.valueOf(r.count())), y + 9, 0xFFFFFFFF, true);
                            rx += 20;
                            text.add(r.count() + "× " + st.getHoverName().getString());
                        }
                    }
                    case "xp" -> {
                        g.renderItem(new ItemStack(Items.EXPERIENCE_BOTTLE), rx, y);
                        rx += 20;
                        text.add(r.count() + " XP");
                    }
                    default -> {}
                }
            }
            String t = String.join(" · ", text);
            if (rx + font.width(t) > x + dw) t = font.plainSubstrByWidth(t, Math.max(10, x + dw - rx - 8)) + "…";
            g.drawString(font, t, rx + 4, y + 4, 0xFF3F3F3F, false);
        }
    }

    private static ItemStack item(String id) {
        if (id == null || id.isEmpty() || id.startsWith("#")) return ItemStack.EMPTY;
        try {
            ResourceLocation rl = ResourceLocation.parse(id);
            if (!BuiltInRegistries.ITEM.containsKey(rl)) return ItemStack.EMPTY;
            return new ItemStack(BuiltInRegistries.ITEM.{{if mc>=1.21.2}}getValue{{else}}get{{end}}(rl));
        } catch (Exception e) {
            return ItemStack.EMPTY;
        }
    }

    private static String pretty(String id) {
        String p = id.contains(":") ? id.substring(id.indexOf(':') + 1) : id;
        p = p.replace('_', ' ');
        return p.isEmpty() ? "?" : Character.toUpperCase(p.charAt(0)) + p.substring(1);
    }

    private static String taskLabel(AnvilQuests.Task t) {
        String name = t.target().isEmpty() ? tr("any", "anything").getString() : pretty(t.target());
        ItemStack st = item(t.target());
        if (!st.isEmpty()) name = st.getHoverName().getString();
        return switch (t.type()) {
            case "give" -> tr("task.give", "Hand in").getString() + " " + name;
            case "have" -> tr("task.have", "Collect").getString() + " " + name;
            case "break" -> tr("task.break", "Mine").getString() + " " + name;
            case "place" -> tr("task.place", "Place").getString() + " " + name;
            case "kill" -> tr("task.kill", "Defeat").getString() + " " + name;
            case "dimension" -> tr("task.dimension", "Enter").getString() + " " + name;
            case "biome" -> tr("task.biome", "Visit").getString() + " " + name;
            default -> name;
        };
    }
}
