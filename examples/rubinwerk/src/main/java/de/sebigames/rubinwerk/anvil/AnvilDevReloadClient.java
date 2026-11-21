// AUTOMATISCH ERZEUGT von Anvil Studio – Schnelles Testen (nur Client).
package de.sebigames.rubinwerk.anvil;

import net.minecraft.client.Minecraft;
import net.neoforged.neoforge.client.event.ClientTickEvent;
import net.neoforged.neoforge.common.NeoForge;

public final class AnvilDevReloadClient {
    private static long last = -1;
    private static int ticks;

    private AnvilDevReloadClient() {}

    public static void init() {
        NeoForge.EVENT_BUS.addListener(AnvilDevReloadClient::onClientTick);
    }

    private static void onClientTick(ClientTickEvent.Post event) {
        if (++ticks % 20 != 0) return;
        long now = AnvilDevReload.stamp();
        if (last < 0) {
            last = now;
            return;
        }
        if (now == last) return;
        last = now;
        Minecraft.getInstance().reloadResourcePacks();
    }
}
