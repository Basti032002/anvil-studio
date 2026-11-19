// Vanilla-Katalog pro Minecraft-Version (einmal laden, danach aus dem Speicher).
import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";
import { Catalog, mcCatalog } from "./api";

type State = { catalog?: Catalog; loading: boolean; error?: string; progress?: string };

const cache = new Map<string, Promise<Catalog>>();
const done = new Map<string, Catalog>();

export function loadCatalog(version: string): Promise<Catalog> {
  let p = cache.get(version);
  if (!p) {
    p = mcCatalog(version).then((c) => {
      done.set(version, c);
      return c;
    });
    p.catch(() => cache.delete(version));
    cache.set(version, p);
  }
  return p;
}

export function useCatalog(version: string, enabled = true): State {
  const [state, setState] = useState<State>(() => (done.has(version) ? { catalog: done.get(version), loading: false } : { loading: enabled }));

  useEffect(() => {
    if (!enabled || done.has(version)) return;
    let alive = true;
    setState({ loading: true });
    const un = listen<{ phase: string; downloaded: number; total: number | null }>("mc-catalog-progress", (e) => {
      const { phase, downloaded, total } = e.payload;
      const label =
        phase === "client"
          ? `Minecraft ${version} wird geladen … ${total ? Math.round((downloaded / total) * 100) + " %" : ""}`
          : phase === "lang"
            ? "Deutsche Namen werden geladen …"
            : phase === "parse"
              ? "Blöcke und Items werden ausgelesen …"
              : "Verbinde mit Mojang …";
      if (alive) setState((s) => ({ ...s, progress: label }));
    });
    loadCatalog(version)
      .then((c) => alive && setState({ catalog: c, loading: false }))
      .catch((e) => alive && setState({ loading: false, error: String(e) }));
    return () => {
      alive = false;
      un.then((f) => f());
    };
  }, [version, enabled]);

  return state;
}

/** Häufige Tags für Rezepte – mit einem Beispiel-Item als Symbol. */
export const COMMON_TAGS: { id: string; name: string; icon: string }[] = [
  { id: "#minecraft:planks", name: "Beliebige Bretter", icon: "minecraft:oak_planks" },
  { id: "#minecraft:logs", name: "Beliebige Stämme", icon: "minecraft:oak_log" },
  { id: "#minecraft:wool", name: "Beliebige Wolle", icon: "minecraft:white_wool" },
  { id: "#minecraft:stone_crafting_materials", name: "Bruchstein-Arten", icon: "minecraft:cobblestone" },
  { id: "#minecraft:wooden_slabs", name: "Holzstufen", icon: "minecraft:oak_slab" },
  { id: "#minecraft:sand", name: "Sand", icon: "minecraft:sand" },
  { id: "#minecraft:coals", name: "Kohle (beide)", icon: "minecraft:coal" },
  { id: "#minecraft:leaves", name: "Beliebiges Laub", icon: "minecraft:oak_leaves" },
  { id: "#minecraft:saplings", name: "Beliebige Setzlinge", icon: "minecraft:oak_sapling" },
  { id: "#minecraft:small_flowers", name: "Kleine Blumen", icon: "minecraft:poppy" },
  { id: "#minecraft:soul_fire_base_blocks", name: "Seelenfeuer-Blöcke", icon: "minecraft:soul_sand" },
];
