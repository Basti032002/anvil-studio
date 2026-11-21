//! GUI-Editor: eigene Oberflächen für Maschinen und Blueprints.
//! Erzeugt ein Menü (gemeinsam) und einen Bildschirm (nur Client), ohne Texturen –
//! alles wird mit einfachen Flächen im Minecraft-Stil gezeichnet.

use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Default, Debug)]
#[serde(rename_all = "camelCase", default)]
pub struct GuiDef {
    pub id: String,
    pub name_en: String,
    pub name_de: String,
    pub width: i32,
    pub height: i32,
    /// light (Minecraft-Grau) | dark | stone | wood
    pub style: String,
    /// Titel oben anzeigen
    pub show_title: bool,
    pub elements: Vec<GuiEl>,
}

#[derive(Serialize, Deserialize, Clone, Default, Debug)]
#[serde(rename_all = "camelCase", default)]
pub struct GuiEl {
    pub id: String,
    /// slot_in | slot_fuel | slot_out | player_inv | arrow | flame | energy | tank | button | switch | text | value | item | panel
    pub kind: String,
    pub x: i32,
    pub y: i32,
    pub w: i32,
    pub h: i32,
    pub text: String,
    /// Farbe als #rrggbb
    pub color: String,
    /// Variable (Energie, Tank, Schalter, Wert)
    pub var: String,
    /// Höchstwert für Energie/Tank
    pub max: f64,
    /// Knopf: eigene Blueprint-Funktion
    pub action: String,
    /// Item-Symbol
    pub item: String,
}

pub const KINDS: &[&str] = &["slot_in", "slot_fuel", "slot_out", "player_inv", "arrow", "flame", "energy", "tank", "button", "switch", "text", "value", "item", "panel"];

/// Elemente, deren Wert vom Server kommt (Reihenfolge = Datenplatz ab 4)
pub fn var_elements(g: &GuiDef) -> Vec<(usize, &GuiEl)> {
    g.elements.iter().enumerate().filter(|(_, e)| matches!(e.kind.as_str(), "energy" | "tank" | "switch" | "value") && !e.var.trim().is_empty()).collect()
}

pub fn valid(g: &GuiDef) -> bool {
    crate::content::valid_id(&g.id)
}

fn js(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"").replace(['\n', '\r'], " ")
}

fn color(s: &str, def: u32) -> String {
    let h = s.trim().trim_start_matches('#');
    let v = if h.len() == 6 { u32::from_str_radix(h, 16).unwrap_or(def) } else { def };
    format!("0xFF{v:06X}")
}

/// Java-Code für AnvilContent: (Felder, Aufrufe in register(), Methoden)
pub fn common_java(guis: &[GuiDef], machine_guis: &[(String, String)]) -> (String, String, String) {
    let list: Vec<&GuiDef> = guis.iter().filter(|g| valid(g)).collect();
    if list.is_empty() {
        return (String::new(), String::new(), String::new());
    }
    let mut entries = String::new();
    for g in &list {
        let vars = var_elements(g);
        let mut els = String::new();
        for e in &g.elements {
            if !KINDS.contains(&e.kind.as_str()) {
                continue;
            }
            let slot = vars.iter().position(|(_, v)| std::ptr::eq(*v, e)).map(|i| i as i32 + 4).unwrap_or(-1);
            let def_col = match e.kind.as_str() {
                "energy" => 0xD83A3A,
                "tank" => 0x3A7BD8,
                "button" | "switch" => 0xFFFFFF,
                _ => 0x404040,
            };
            els.push_str(&format!(
                "            new AnvilGuiEl(\"{}\", {}, {}, {}, {}, \"{}\", {}, {}, {}, \"{}\"),\n",
                e.kind,
                e.x.clamp(0, 400),
                e.y.clamp(0, 400),
                e.w.clamp(1, 400),
                e.h.clamp(1, 400),
                js(&e.text),
                color(&e.color, def_col),
                slot,
                if e.max > 0.0 { e.max.min(1e9) as i64 } else { 100 },
                js(&e.item)
            ));
        }
        let title = if g.show_title { js(if g.name_en.is_empty() { &g.id } else { &g.name_en }) } else { String::new() };
        entries.push_str(&format!(
            "        java.util.Map.entry(\"{}\", new AnvilGui({}, {}, \"{}\", \"{}\", {}, new AnvilGuiEl[] {{\n{els}        }})),\n",
            g.id,
            g.width.clamp(40, 400),
            g.height.clamp(40, 400),
            match g.style.as_str() {
                "dark" | "stone" | "wood" => g.style.as_str(),
                _ => "light",
            },
            title,
            vars.len()
        ));
    }
    let entries = entries.trim_end_matches(",\n").to_string() + "\n";
    let mut machine_map = String::new();
    for (block, gui) in machine_guis {
        if list.iter().any(|g| &g.id == gui) {
            machine_map.push_str(&format!("java.util.Map.entry(\"{}\", \"{}\"), ", js(block), js(gui)));
        }
    }
    let machine_map = machine_map.trim_end_matches(", ");
    let fields = "    public static final DeferredRegister<net.minecraft.world.inventory.MenuType<?>> MENUS = DeferredRegister.create(Registries.MENU, MODID);\n    public static final DeferredHolder<net.minecraft.world.inventory.MenuType<?>, net.minecraft.world.inventory.MenuType<AnvilGuiMenu>> GUI_MENU = MENUS.register(\"gui\", () -> net.neoforged.neoforge.common.extensions.IMenuTypeExtension.create(AnvilGuiMenu::new));\n\n".to_string();
    let calls = "        MENUS.register(modEventBus);\n".to_string();
    let methods = format!(
        r#"
    // ---- Eigene Oberflächen (GUI-Editor) ----
    public record AnvilGuiEl(String kind, int x, int y, int w, int h, String text, int color, int data, long max, String item) {{}}

    public record AnvilGui(int w, int h, String style, String title, int vars, AnvilGuiEl[] els) {{}}

    public static final java.util.Map<String, AnvilGui> ANVIL_GUIS = java.util.Map.ofEntries(
{entries}    );

    /** Maschinen-Block → Oberfläche */
    static final java.util.Map<String, String> ANVIL_MACHINE_GUI = java.util.Map.ofEntries({machine_map});

    /** Oberfläche öffnen (Container und Daten dürfen fehlen) */
    public static void anvilOpenGui(net.minecraft.server.level.ServerPlayer sp, String key, net.minecraft.world.Container container, net.minecraft.world.inventory.ContainerData base, net.minecraft.core.BlockPos pos, Component title) {{
        AnvilGui g = ANVIL_GUIS.get(key);
        if (g == null) return;
        net.minecraft.world.Container c = container == null ? new net.minecraft.world.SimpleContainer(0) : container;
        Component t = g.title().isEmpty() ? title : Component.literal(g.title());
        sp.openMenu(new net.minecraft.world.SimpleMenuProvider((id, inv, p) -> anvilGuiMenu(id, inv, key, c, base, pos), t), buf -> {{
            buf.writeUtf(key);
            buf.writeVarInt(c.getContainerSize());
            buf.writeVarInt(4 + g.vars());
            buf.writeBlockPos(pos);
        }});
    }}

    static AnvilGuiMenu anvilGuiMenu(int id, net.minecraft.world.entity.player.Inventory inv, String key, net.minecraft.world.Container c, net.minecraft.world.inventory.ContainerData base, net.minecraft.core.BlockPos pos) {{
        AnvilGui g = ANVIL_GUIS.get(key);
        net.minecraft.world.entity.player.Player player = inv.player;
        net.minecraft.world.inventory.ContainerData d = new net.minecraft.world.inventory.ContainerData() {{
            @Override
            public int get(int i) {{
                if (i < 4) return base == null ? 0 : base.get(i);
                return player.level() instanceof net.minecraft.server.level.ServerLevel sl ? anvilGuiValue(sl, player, key, i - 4) : 0;
            }}

            @Override
            public void set(int i, int v) {{
                if (i < 4 && base != null) base.set(i, v);
            }}

            @Override
            public int getCount() {{
                return 4 + (g == null ? 0 : g.vars());
            }}
        }};
        return new AnvilGuiMenu(id, inv, key, c, d, pos);
    }}

    public static class AnvilGuiMenu extends net.minecraft.world.inventory.AbstractContainerMenu {{
        public final String key;
        public final AnvilGui gui;
        public final net.minecraft.world.inventory.ContainerData data;
        public final net.minecraft.core.BlockPos pos;
        private final net.minecraft.world.Container container;
        private final int ownSlots;

        public AnvilGuiMenu(int id, net.minecraft.world.entity.player.Inventory inv, net.minecraft.network.RegistryFriendlyByteBuf buf) {{
            this(id, inv, buf.readUtf(), new net.minecraft.world.SimpleContainer(Math.max(0, buf.readVarInt())), new net.minecraft.world.inventory.SimpleContainerData(Math.max(4, buf.readVarInt())), buf.readBlockPos());
        }}

        public AnvilGuiMenu(int id, net.minecraft.world.entity.player.Inventory inv, String key, net.minecraft.world.Container container, net.minecraft.world.inventory.ContainerData data, net.minecraft.core.BlockPos pos) {{
            super(GUI_MENU.get(), id);
            this.key = key;
            this.gui = ANVIL_GUIS.getOrDefault(key, new AnvilGui(176, 166, "light", "", 0, new AnvilGuiEl[0]));
            this.data = data;
            this.pos = pos;
            this.container = container;
            int own = 0;
            for (AnvilGuiEl e : gui.els()) {{
                int idx = switch (e.kind()) {{
                    case "slot_in" -> 0;
                    case "slot_fuel" -> 1;
                    case "slot_out" -> 2;
                    default -> -1;
                }};
                if (idx < 0 || idx >= container.getContainerSize()) continue;
                int off = e.kind().equals("slot_out") ? 5 : 1;
                if (idx == 2) {{
                    addSlot(new net.minecraft.world.inventory.Slot(container, idx, e.x() + off, e.y() + off) {{
                        @Override
                        public boolean mayPlace(ItemStack stack) {{
                            return false;
                        }}
                    }});
                }} else addSlot(new net.minecraft.world.inventory.Slot(container, idx, e.x() + off, e.y() + off));
                own++;
            }}
            this.ownSlots = own;
            for (AnvilGuiEl e : gui.els()) {{
                if (!e.kind().equals("player_inv")) continue;
                for (int row = 0; row < 3; row++)
                    for (int col = 0; col < 9; col++) addSlot(new net.minecraft.world.inventory.Slot(inv, col + row * 9 + 9, e.x() + 1 + col * 18, e.y() + 1 + row * 18));
                for (int col = 0; col < 9; col++) addSlot(new net.minecraft.world.inventory.Slot(inv, col, e.x() + 1 + col * 18, e.y() + 59));
                break;
            }}
            addDataSlots(data);
        }}

        @Override
        public ItemStack quickMoveStack(net.minecraft.world.entity.player.Player player, int index) {{
            net.minecraft.world.inventory.Slot slot = slots.get(index);
            if (!slot.hasItem()) return ItemStack.EMPTY;
            ItemStack stack = slot.getItem();
            ItemStack copy = stack.copy();
            if (index < ownSlots) {{
                if (!moveItemStackTo(stack, ownSlots, slots.size(), true)) return ItemStack.EMPTY;
            }} else if (ownSlots == 0 || !moveItemStackTo(stack, 0, Math.min(ownSlots, 2), false)) return ItemStack.EMPTY;
            if (stack.isEmpty()) slot.set(ItemStack.EMPTY);
            else slot.setChanged();
            return copy;
        }}

        @Override
        public boolean stillValid(net.minecraft.world.entity.player.Player player) {{
            return container.stillValid(player);
        }}

        @Override
        public boolean clickMenuButton(net.minecraft.world.entity.player.Player player, int id) {{
            if (player instanceof net.minecraft.server.level.ServerPlayer sp && id >= 0 && id < gui.els().length) anvilGuiClick(sp, key, id, pos);
            return true;
        }}
    }}
"#
    );
    (fields, calls, methods)
}

/// Client-Teil: (Registrierung, Klassen)
pub fn client_java(guis: &[GuiDef], get_value: bool) -> (String, String) {
    if !guis.iter().any(valid) {
        return (String::new(), String::new());
    }
    let item = if get_value { "net.minecraft.core.registries.BuiltInRegistries.ITEM.getValue(rl)" } else { "net.minecraft.core.registries.BuiltInRegistries.ITEM.get(rl)" };
    let regs = "        modEventBus.addListener((net.neoforged.neoforge.client.event.RegisterMenuScreensEvent event) -> event.register(AnvilContent.GUI_MENU.get(), AnvilGuiScreen::new));\n".to_string();
    let classes = format!(
        r#"    /** Eigene Oberfläche aus dem GUI-Editor */
    public static class AnvilGuiScreen extends net.minecraft.client.gui.screens.inventory.AbstractContainerScreen<AnvilContent.AnvilGuiMenu> {{
        private final java.util.List<net.minecraft.client.gui.components.Button> switches = new java.util.ArrayList<>();
        private final java.util.List<AnvilContent.AnvilGuiEl> switchEls = new java.util.ArrayList<>();

        public AnvilGuiScreen(AnvilContent.AnvilGuiMenu menu, net.minecraft.world.entity.player.Inventory inv, net.minecraft.network.chat.Component title) {{
            super(menu, inv, title);
            imageWidth = menu.gui.w();
            imageHeight = menu.gui.h();
            titleLabelY = 6;
            inventoryLabelY = -1000;
            for (AnvilContent.AnvilGuiEl e : menu.gui.els()) if (e.kind().equals("player_inv")) {{ inventoryLabelX = e.x(); inventoryLabelY = e.y() - 11; }}
        }}

        @Override
        protected void init() {{
            super.init();
            switches.clear();
            switchEls.clear();
            AnvilContent.AnvilGuiEl[] els = menu.gui.els();
            for (int i = 0; i < els.length; i++) {{
                AnvilContent.AnvilGuiEl e = els[i];
                if (!e.kind().equals("button") && !e.kind().equals("switch")) continue;
                final int id = i;
                net.minecraft.client.gui.components.Button b = net.minecraft.client.gui.components.Button.builder(net.minecraft.network.chat.Component.literal(e.text()), btn -> {{
                    if (minecraft != null && minecraft.gameMode != null) minecraft.gameMode.handleInventoryButtonClick(menu.containerId, id);
                }}).bounds(leftPos + e.x(), topPos + e.y(), e.w(), e.h()).build();
                addRenderableWidget(b);
                if (e.kind().equals("switch")) {{
                    switches.add(b);
                    switchEls.add(e);
                }}
            }}
            updateSwitches();
        }}

        private void updateSwitches() {{
            for (int i = 0; i < switches.size(); i++) {{
                AnvilContent.AnvilGuiEl e = switchEls.get(i);
                boolean on = e.data() >= 0 && menu.data.get(e.data()) != 0;
                switches.get(i).setMessage(net.minecraft.network.chat.Component.literal((e.text().isEmpty() ? "" : e.text() + ": ") + (on ? "AN" : "AUS")));
            }}
        }}

        @Override
        protected void containerTick() {{
            super.containerTick();
            updateSwitches();
        }}

        private static void bevel(net.minecraft.client.gui.GuiGraphics g, int x, int y, int w, int h, int dark, int light, int fill) {{
            g.fill(x, y, x + w, y + h, fill);
            g.fill(x, y, x + w - 1, y + 1, dark);
            g.fill(x, y, x + 1, y + h - 1, dark);
            g.fill(x + 1, y + h - 1, x + w, y + h, light);
            g.fill(x + w - 1, y + 1, x + w, y + h, light);
        }}

        private static void slot(net.minecraft.client.gui.GuiGraphics g, int x, int y, int size) {{
            bevel(g, x, y, size, size, 0xFF373737, 0xFFFFFFFF, 0xFF8B8B8B);
        }}

        private int value(AnvilContent.AnvilGuiEl e) {{
            return e.data() >= 0 ? menu.data.get(e.data()) : 0;
        }}

        @Override
        protected void renderBg(net.minecraft.client.gui.GuiGraphics g, float partial, int mouseX, int mouseY) {{
            int x0 = leftPos, y0 = topPos, w = imageWidth, h = imageHeight;
            int base, hi, lo;
            switch (menu.gui.style()) {{
                case "dark" -> {{ base = 0xFF2B2D31; hi = 0xFF4A4D55; lo = 0xFF16171A; }}
                case "stone" -> {{ base = 0xFF8F8F8F; hi = 0xFFBDBDBD; lo = 0xFF555555; }}
                case "wood" -> {{ base = 0xFFA0784A; hi = 0xFFC79A64; lo = 0xFF6B4A2B; }}
                default -> {{ base = 0xFFC6C6C6; hi = 0xFFFFFFFF; lo = 0xFF555555; }}
            }}
            g.fill(x0 + 1, y0, x0 + w - 1, y0 + h, 0xFF000000);
            g.fill(x0, y0 + 1, x0 + w, y0 + h - 1, 0xFF000000);
            g.fill(x0 + 1, y0 + 1, x0 + w - 1, y0 + h - 1, base);
            g.fill(x0 + 1, y0 + 1, x0 + w - 2, y0 + 3, hi);
            g.fill(x0 + 1, y0 + 1, x0 + 3, y0 + h - 2, hi);
            g.fill(x0 + 2, y0 + h - 3, x0 + w - 1, y0 + h - 1, lo);
            g.fill(x0 + w - 3, y0 + 2, x0 + w - 1, y0 + h - 1, lo);
            for (AnvilContent.AnvilGuiEl e : menu.gui.els()) {{
                int x = x0 + e.x(), y = y0 + e.y();
                switch (e.kind()) {{
                    case "slot_in", "slot_fuel" -> slot(g, x, y, 18);
                    case "slot_out" -> slot(g, x, y, 26);
                    case "player_inv" -> {{
                        for (int r = 0; r < 3; r++) for (int c = 0; c < 9; c++) slot(g, x + c * 18, y + r * 18, 18);
                        for (int c = 0; c < 9; c++) slot(g, x + c * 18, y + 58, 18);
                    }}
                    case "panel" -> bevel(g, x, y, e.w(), e.h(), 0xFF373737, 0xFFFFFFFF, e.color());
                    case "arrow" -> {{
                        int total = menu.data.get(3), prog = menu.data.get(2);
                        int len = total > 0 ? prog * e.w() / total : 0;
                        int mid = y + e.h() / 2, head = Math.max(3, e.h() / 2);
                        for (int i = 0; i < e.w(); i++) {{
                            int half = i < e.w() - head ? Math.max(1, e.h() / 6) : (e.w() - i) * (e.h() / 2) / head;
                            g.fill(x + i, mid - half, x + i + 1, mid + half + 1, i < len ? 0xFFFFFFFF : 0xFF8B8B8B);
                        }}
                    }}
                    case "flame" -> {{
                        int total = menu.data.get(1), lit = menu.data.get(0);
                        int fh = total > 0 ? lit * e.h() / total : 0;
                        g.fill(x, y, x + e.w(), y + e.h(), 0xFF8B8B8B);
                        if (fh > 0) {{
                            g.fill(x, y + e.h() - fh, x + e.w(), y + e.h(), 0xFFFF9A1F);
                            g.fill(x + e.w() / 4, y + e.h() - fh * 2 / 3, x + e.w() * 3 / 4, y + e.h(), 0xFFFFE04A);
                        }}
                    }}
                    case "energy", "tank" -> {{
                        bevel(g, x, y, e.w(), e.h(), 0xFF373737, 0xFFFFFFFF, 0xFF2A2A2A);
                        long max = Math.max(1, e.max());
                        int fill = (int) Math.max(0, Math.min(e.h() - 2, (long) value(e) * (e.h() - 2) / max));
                        if (fill > 0) g.fill(x + 1, y + e.h() - 1 - fill, x + e.w() - 1, y + e.h() - 1, e.color());
                    }}
                    case "item" -> {{
                        net.minecraft.resources.ResourceLocation rl = net.minecraft.resources.ResourceLocation.tryParse(e.item());
                        if (rl != null) g.renderItem(new net.minecraft.world.item.ItemStack({item}), x, y);
                    }}
                    default -> {{}}
                }}
            }}
        }}

        @Override
        protected void renderLabels(net.minecraft.client.gui.GuiGraphics g, int mouseX, int mouseY) {{
            if (!menu.gui.title().isEmpty()) g.drawString(font, title, titleLabelX, titleLabelY, 0xFF404040, false);
            if (inventoryLabelY > -1000) g.drawString(font, playerInventoryTitle, inventoryLabelX, inventoryLabelY, 0xFF404040, false);
            for (AnvilContent.AnvilGuiEl e : menu.gui.els()) {{
                if (e.kind().equals("text")) g.drawString(font, e.text(), e.x(), e.y(), e.color(), false);
                else if (e.kind().equals("value")) g.drawString(font, e.text() + value(e), e.x(), e.y(), e.color(), false);
            }}
        }}

        @Override
        public void render(net.minecraft.client.gui.GuiGraphics g, int mouseX, int mouseY, float partial) {{
            super.render(g, mouseX, mouseY, partial);
            renderTooltip(g, mouseX, mouseY);
        }}
    }}

"#
    );
    (regs, classes)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn java_has_menu() {
        let g = GuiDef {
            id: "presse".into(),
            width: 176,
            height: 166,
            elements: vec![
                GuiEl { kind: "slot_in".into(), x: 55, y: 34, ..Default::default() },
                GuiEl { kind: "energy".into(), var: "strom".into(), max: 1000.0, ..Default::default() },
                GuiEl { kind: "button".into(), text: "Start \"jetzt\"".into(), action: "los".into(), ..Default::default() },
            ],
            ..Default::default()
        };
        let (f, c, m) = common_java(&[g.clone()], &[("presse_block".into(), "presse".into())]);
        assert!(f.contains("GUI_MENU") && c.contains("MENUS.register"));
        assert!(m.contains("new AnvilGuiEl(\"energy\"") && m.contains(", 4, 1000,"));
        assert!(m.contains("Start \\\"jetzt\\\""));
        assert!(m.contains("\"presse_block\", \"presse\""));
        let (r, cl) = client_java(&[g], true);
        assert!(r.contains("RegisterMenuScreensEvent") && cl.contains("getValue(rl)"));
    }
}
