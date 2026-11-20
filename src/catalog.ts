import { LANG, t, translateMessage } from "./i18n";
// Vanilla-Katalog pro Minecraft-Version (einmal laden, danach aus dem Speicher).
import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Catalog, mcCatalog } from "./api";

const MC_LANG: Record<string, string> = { fr: "fr_fr", es: "es_es", pl: "pl_pl", nl: "nl_nl", tr: "tr_tr", ru: "ru_ru" };

/** Namen in der Sprache der Oberfläche (Deutsch und Englisch stecken schon im Katalog). */
async function localize(version: string, c: Catalog): Promise<Catalog> {
  if (LANG === "de") return c;
  let names: Record<string, string> = {};
  const code = MC_LANG[LANG];
  if (code) names = await invoke<Record<string, string>>("mc_names", { version, code }).catch(() => ({}));
  return { ...c, entries: c.entries.map((e) => ({ ...e, name: names[e.id] ?? e.nameEn ?? e.name })) };
}

type State = { catalog?: Catalog; loading: boolean; error?: string; progress?: string };

const cache = new Map<string, Promise<Catalog>>();
const done = new Map<string, Catalog>();

export function loadCatalog(version: string): Promise<Catalog> {
  let p = cache.get(version);
  if (!p) {
    p = mcCatalog(version).then((raw) => localize(version, raw)).then((c) => {
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
          ? t("Minecraft {version} wird geladen … {v1}", { version: version, v1: total ? Math.round((downloaded / total) * 100) + " %" : "" })
          : phase === "lang"
            ? t("Namen werden geladen …")
            : phase === "parse"
              ? t("Blöcke und Items werden ausgelesen …")
              : t("Verbinde mit Mojang …");
      if (alive) setState((s) => ({ ...s, progress: label }));
    });
    loadCatalog(version)
      .then((c) => alive && setState({ catalog: c, loading: false }))
      .catch((e) => alive && setState({ loading: false, error: translateMessage(String(e)) }));
    return () => {
      alive = false;
      un.then((f) => f());
    };
  }, [version, enabled]);

  return state;
}

/** Häufige Tags für Rezepte – mit einem Beispiel-Item als Symbol. */
export const COMMON_TAGS: { id: string; name: string; icon: string }[] = [
  { id: "#minecraft:planks", name: t("Beliebige Bretter"), icon: "minecraft:oak_planks" },
  { id: "#minecraft:logs", name: t("Beliebige Stämme"), icon: "minecraft:oak_log" },
  { id: "#minecraft:wool", name: t("Beliebige Wolle"), icon: "minecraft:white_wool" },
  { id: "#minecraft:stone_crafting_materials", name: t("Bruchstein-Arten"), icon: "minecraft:cobblestone" },
  { id: "#minecraft:wooden_slabs", name: t("Holzstufen"), icon: "minecraft:oak_slab" },
  { id: "#minecraft:sand", name: t("Sand"), icon: "minecraft:sand" },
  { id: "#minecraft:coals", name: t("Kohle (beide)"), icon: "minecraft:coal" },
  { id: "#minecraft:leaves", name: t("Beliebiges Laub"), icon: "minecraft:oak_leaves" },
  { id: "#minecraft:saplings", name: t("Beliebige Setzlinge"), icon: "minecraft:oak_sapling" },
  { id: "#minecraft:small_flowers", name: t("Kleine Blumen"), icon: "minecraft:poppy" },
  { id: "#minecraft:soul_fire_base_blocks", name: t("Seelenfeuer-Blöcke"), icon: "minecraft:soul_sand" },
];
