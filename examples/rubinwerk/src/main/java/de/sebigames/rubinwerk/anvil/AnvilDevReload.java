// AUTOMATISCH ERZEUGT von Anvil Studio – Schnelles Testen (Neu laden ohne Neustart).
package de.sebigames.rubinwerk.anvil;

import java.nio.file.Files;
import java.nio.file.Path;
import net.minecraft.network.chat.Component;
import net.minecraft.server.MinecraftServer;
import net.neoforged.neoforge.common.NeoForge;
import net.neoforged.neoforge.event.tick.ServerTickEvent;

/** Nur aktiv, wenn Anvil Studio die Datei .anvil-reload schreibt – im normalen Spiel passiert nichts. */
public final class AnvilDevReload {
    static final Path MARKER = Path.of(".anvil-reload");
    private static long last = -1;
    private static int ticks;

    private AnvilDevReload() {}

    static long stamp() {
        try {
            return Files.exists(MARKER) ? Files.getLastModifiedTime(MARKER).toMillis() : 0;
        } catch (Exception e) {
            return 0;
        }
    }

    public static void init() {
        NeoForge.EVENT_BUS.addListener(AnvilDevReload::onServerTick);
        try {
            Class.forName("net.minecraft.client.Minecraft");
            Class.forName("de.sebigames.rubinwerk.anvil.AnvilDevReloadClient").getMethod("init").invoke(null);
        } catch (Throwable ignored) {
            // Server ohne Client-Klassen
        }
    }

    private static void onServerTick(ServerTickEvent.Post event) {
        if (++ticks % 20 != 0) return;
        long now = stamp();
        if (last < 0) {
            last = now;
            return;
        }
        if (now == last) return;
        last = now;
        MinecraftServer server = event.getServer();
        server.getCommands().performPrefixedCommand(server.createCommandSourceStack().withSuppressedOutput(), "reload");
        server.getPlayerList().broadcastSystemMessage(Component.literal("\u00a7a[Anvil Studio]\u00a7r Rezepte, Loot und Daten neu geladen"), false);
    }
}
