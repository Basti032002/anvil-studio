// =============================================================================
// AUTOMATISCH ERZEUGT von Anvil Studio – nur auf dem Client geladen.
// =============================================================================
package de.sebigames.rubinwerk.anvil;

import net.minecraft.client.renderer.entity.*;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.entity.animal.*;
import net.minecraft.world.entity.monster.*;
import net.neoforged.api.distmarker.Dist;
import net.neoforged.bus.api.IEventBus;
import net.neoforged.fml.common.Mod;
import net.neoforged.neoforge.client.event.EntityRenderersEvent;

@SuppressWarnings("unused")
@Mod(value = AnvilContent.MODID, dist = Dist.CLIENT)
public final class AnvilClient {
    public AnvilClient(IEventBus modEventBus) {
        modEventBus.addListener((net.neoforged.neoforge.client.event.RegisterMenuScreensEvent event) -> event.register(AnvilContent.GUI_MENU.get(), AnvilGuiScreen::new));
    }

    private static void registerRenderers(EntityRenderersEvent.RegisterRenderers event) {
    }

    /** Eigene Oberfläche aus dem GUI-Editor */
    public static class AnvilGuiScreen extends net.minecraft.client.gui.screens.inventory.AbstractContainerScreen<AnvilContent.AnvilGuiMenu> {
        private final java.util.List<net.minecraft.client.gui.components.Button> switches = new java.util.ArrayList<>();
        private final java.util.List<AnvilContent.AnvilGuiEl> switchEls = new java.util.ArrayList<>();

        public AnvilGuiScreen(AnvilContent.AnvilGuiMenu menu, net.minecraft.world.entity.player.Inventory inv, net.minecraft.network.chat.Component title) {
            super(menu, inv, title);
            imageWidth = menu.gui.w();
            imageHeight = menu.gui.h();
            titleLabelY = 6;
            inventoryLabelY = -1000;
            for (AnvilContent.AnvilGuiEl e : menu.gui.els()) if (e.kind().equals("player_inv")) { inventoryLabelX = e.x(); inventoryLabelY = e.y() - 11; }
        }

        @Override
        protected void init() {
            super.init();
            switches.clear();
            switchEls.clear();
            AnvilContent.AnvilGuiEl[] els = menu.gui.els();
            for (int i = 0; i < els.length; i++) {
                AnvilContent.AnvilGuiEl e = els[i];
                if (!e.kind().equals("button") && !e.kind().equals("switch")) continue;
                final int id = i;
                net.minecraft.client.gui.components.Button b = net.minecraft.client.gui.components.Button.builder(net.minecraft.network.chat.Component.literal(e.text()), btn -> {
                    if (minecraft != null && minecraft.gameMode != null) minecraft.gameMode.handleInventoryButtonClick(menu.containerId, id);
                }).bounds(leftPos + e.x(), topPos + e.y(), e.w(), e.h()).build();
                addRenderableWidget(b);
                if (e.kind().equals("switch")) {
                    switches.add(b);
                    switchEls.add(e);
                }
            }
            updateSwitches();
        }

        private void updateSwitches() {
            for (int i = 0; i < switches.size(); i++) {
                AnvilContent.AnvilGuiEl e = switchEls.get(i);
                boolean on = e.data() >= 0 && menu.data.get(e.data()) != 0;
                switches.get(i).setMessage(net.minecraft.network.chat.Component.literal((e.text().isEmpty() ? "" : e.text() + ": ") + (on ? "ON" : "OFF")));
            }
        }

        @Override
        protected void containerTick() {
            super.containerTick();
            updateSwitches();
        }

        private static void bevel(net.minecraft.client.gui.GuiGraphics g, int x, int y, int w, int h, int dark, int light, int fill) {
            g.fill(x, y, x + w, y + h, fill);
            g.fill(x, y, x + w - 1, y + 1, dark);
            g.fill(x, y, x + 1, y + h - 1, dark);
            g.fill(x + 1, y + h - 1, x + w, y + h, light);
            g.fill(x + w - 1, y + 1, x + w, y + h, light);
        }

        private static void slot(net.minecraft.client.gui.GuiGraphics g, int x, int y, int size) {
            bevel(g, x, y, size, size, 0xFF373737, 0xFFFFFFFF, 0xFF8B8B8B);
        }

        private int value(AnvilContent.AnvilGuiEl e) {
            if (e.data() == -2) return (menu.data.get(4) & 0xFFFF) | ((menu.data.get(5) & 0xFFFF) << 16);
            return e.data() >= 0 ? menu.data.get(e.data()) : 0;
        }

        private long maxOf(AnvilContent.AnvilGuiEl e) {
            if (e.data() == -2) return Math.max(1, (menu.data.get(6) & 0xFFFF) | ((menu.data.get(7) & 0xFFFF) << 16));
            return Math.max(1, e.max());
        }

        @Override
        protected void renderBg(net.minecraft.client.gui.GuiGraphics g, float partial, int mouseX, int mouseY) {
            int x0 = leftPos, y0 = topPos, w = imageWidth, h = imageHeight;
            int base, hi, lo;
            switch (menu.gui.style()) {
                case "dark" -> { base = 0xFF2B2D31; hi = 0xFF4A4D55; lo = 0xFF16171A; }
                case "stone" -> { base = 0xFF8F8F8F; hi = 0xFFBDBDBD; lo = 0xFF555555; }
                case "wood" -> { base = 0xFFA0784A; hi = 0xFFC79A64; lo = 0xFF6B4A2B; }
                default -> { base = 0xFFC6C6C6; hi = 0xFFFFFFFF; lo = 0xFF555555; }
            }
            g.fill(x0 + 1, y0, x0 + w - 1, y0 + h, 0xFF000000);
            g.fill(x0, y0 + 1, x0 + w, y0 + h - 1, 0xFF000000);
            g.fill(x0 + 1, y0 + 1, x0 + w - 1, y0 + h - 1, base);
            g.fill(x0 + 1, y0 + 1, x0 + w - 2, y0 + 3, hi);
            g.fill(x0 + 1, y0 + 1, x0 + 3, y0 + h - 2, hi);
            g.fill(x0 + 2, y0 + h - 3, x0 + w - 1, y0 + h - 1, lo);
            g.fill(x0 + w - 3, y0 + 2, x0 + w - 1, y0 + h - 1, lo);
            for (AnvilContent.AnvilGuiEl e : menu.gui.els()) {
                int x = x0 + e.x(), y = y0 + e.y();
                switch (e.kind()) {
                    case "slot_in", "slot_fuel" -> slot(g, x, y, 18);
                    case "slot_out" -> slot(g, x, y, 26);
                    case "player_inv" -> {
                        for (int r = 0; r < 3; r++) for (int c = 0; c < 9; c++) slot(g, x + c * 18, y + r * 18, 18);
                        for (int c = 0; c < 9; c++) slot(g, x + c * 18, y + 58, 18);
                    }
                    case "panel" -> bevel(g, x, y, e.w(), e.h(), 0xFF373737, 0xFFFFFFFF, e.color());
                    case "arrow" -> {
                        int total = menu.data.get(3), prog = menu.data.get(2);
                        int len = total > 0 ? prog * e.w() / total : 0;
                        int mid = y + e.h() / 2, head = Math.max(3, e.h() / 2);
                        for (int i = 0; i < e.w(); i++) {
                            int half = i < e.w() - head ? Math.max(1, e.h() / 6) : (e.w() - i) * (e.h() / 2) / head;
                            g.fill(x + i, mid - half, x + i + 1, mid + half + 1, i < len ? 0xFFFFFFFF : 0xFF8B8B8B);
                        }
                    }
                    case "flame" -> {
                        int total = menu.data.get(1), lit = menu.data.get(0);
                        int fh = total > 0 ? lit * e.h() / total : 0;
                        g.fill(x, y, x + e.w(), y + e.h(), 0xFF8B8B8B);
                        if (fh > 0) {
                            g.fill(x, y + e.h() - fh, x + e.w(), y + e.h(), 0xFFFF9A1F);
                            g.fill(x + e.w() / 4, y + e.h() - fh * 2 / 3, x + e.w() * 3 / 4, y + e.h(), 0xFFFFE04A);
                        }
                    }
                    case "energy", "tank" -> {
                        bevel(g, x, y, e.w(), e.h(), 0xFF373737, 0xFFFFFFFF, 0xFF2A2A2A);
                        long max = maxOf(e);
                        int fill = (int) Math.max(0, Math.min(e.h() - 2, (long) value(e) * (e.h() - 2) / max));
                        if (fill > 0) g.fill(x + 1, y + e.h() - 1 - fill, x + e.w() - 1, y + e.h() - 1, e.color());
                    }
                    case "item" -> {
                        net.minecraft.resources.ResourceLocation rl = net.minecraft.resources.ResourceLocation.tryParse(e.item());
                        if (rl != null) g.renderItem(new net.minecraft.world.item.ItemStack(net.minecraft.core.registries.BuiltInRegistries.ITEM.get(rl)), x, y);
                    }
                    default -> {}
                }
            }
        }

        @Override
        protected void renderLabels(net.minecraft.client.gui.GuiGraphics g, int mouseX, int mouseY) {
            if (!menu.gui.title().isEmpty()) g.drawString(font, title, titleLabelX, titleLabelY, 0xFF404040, false);
            if (inventoryLabelY > -1000) g.drawString(font, playerInventoryTitle, inventoryLabelX, inventoryLabelY, 0xFF404040, false);
            for (AnvilContent.AnvilGuiEl e : menu.gui.els()) {
                if (e.kind().equals("text")) g.drawString(font, e.text(), e.x(), e.y(), e.color(), false);
                else if (e.kind().equals("value")) g.drawString(font, e.text() + value(e) + (e.data() == -2 ? " FE" : ""), e.x(), e.y(), e.color(), false);
            }
        }

        @Override
        public void render(net.minecraft.client.gui.GuiGraphics g, int mouseX, int mouseY, float partial) {
            super.render(g, mouseX, mouseY, partial);
            renderTooltip(g, mouseX, mouseY);
        }
    }

}
