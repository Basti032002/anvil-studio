import { t } from "../../i18n";
import { contextMenu } from "../../components/Overlay";
import { useEffect, useRef, useState } from "react";
import { api, ModEntry, ModHit, modsApi, Project } from "../../api";
import { Toggle } from "../../components/Chrome";
import { DownloadIcon, ExternalIcon, PlusIcon, RefreshIcon, SearchIcon, ToggleIcon, TrashIcon } from "../../icons";
import { toast } from "../../state";

function fmt(n: number) {
  return n >= 1e6 ? t("{v0} Mio.", { v0: (n / 1e6).toFixed(1) }) : n >= 1e3 ? t("{v0} Tsd.", { v0: Math.round(n / 1e3) }) : String(n);
}

export default function ModsTab({ project }: { project: Project }) {
  const [mods, setMods] = useState<ModEntry[]>([]);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<ModHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const timer = useRef<number>();

  useEffect(() => {
    modsApi.list(project.id).then(setMods).catch((e) => toast(String(e), "error"));
    search("");
  }, [project.id]);

  function search(q: string) {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      setSearching(true);
      try {
        setHits(await modsApi.search(project.id, q));
      } catch (e) {
        toast(String(e), "error");
        setHits([]);
      } finally {
        setSearching(false);
      }
    }, 300);
  }

  async function add(hit: ModHit) {
    setAdding(hit.projectId);
    try {
      const before = mods.length;
      const list = await modsApi.add(project.id, hit.projectId);
      setMods(list);
      const deps = list.length - before - 1;
      toast(deps > 0 ? t("{title} wird beim Testen mitgeladen (+{n} Abhängigkeiten).", { title: hit.title, n: deps }) : t("{title} wird beim Testen mitgeladen.", { title: hit.title }), "success");
    } catch (e) {
      toast(String(e), "error");
    } finally {
      setAdding(null);
    }
  }

  const installed = new Set(mods.map((m) => m.projectId));

  return (
    <div className="mods">
      <section className="mods-installed">
        <div className="panel-head">
          <div>
            <div className="panel-title-lg">{t("Mitgeladene Mods")}</div>
            <div className="muted small">{t("Werden vor jedem Testlauf nach run/mods kopiert. Deine Mod-Dateien bleiben unberührt.")}</div>
          </div>
          <button
            className={updating ? "btn small loading" : "btn small"}
            disabled={updating || mods.length === 0}
            onClick={async () => {
              setUpdating(true);
              try {
                const n = await modsApi.update(project.id);
                setMods(await modsApi.list(project.id));
                toast(n ? t("{n} Mod{v1} aktualisiert.", { n: n, v1: n > 1 ? "s" : "" }) : t("Alle Mods sind aktuell."), "success");
              } catch (e) {
                toast(String(e), "error");
              } finally {
                setUpdating(false);
              }
            }}
          >
            <RefreshIcon size={14} />{" "}{t("Alle aktualisieren")}
          </button>
        </div>
        {mods.length === 0 ? (
          <div className="mods-empty muted small">{t("Noch keine. Suche rechts z. B. nach „JEI“, „JourneyMap“ oder „Jade“.")}</div>
        ) : (
          <div className="list">
            {mods.map((m, i) => (
              <div
                key={m.projectId}
                className={m.enabled ? "list-row mod" : "list-row mod off"}
                style={{ "--i": i } as React.CSSProperties}
                {...contextMenu(() => [
                  {
                    label: m.enabled ? t("Deaktivieren") : t("Aktivieren"),
                    icon: <ToggleIcon size={15} />,
                    onClick: () =>
                      modsApi
                        .toggle(project.id, m.projectId, !m.enabled)
                        .then(setMods)
                        .catch((e) => toast(String(e), "error")),
                  },
                  { label: t("Auf Modrinth ansehen"), icon: <ExternalIcon size={15} />, onClick: () => api.openUrl(`https://modrinth.com/mod/${m.slug}`).catch((e) => toast(String(e), "error")) },
                  "separator",
                  {
                    label: t("Entfernen"),
                    icon: <TrashIcon size={15} />,
                    danger: true,
                    onClick: () =>
                      modsApi
                        .remove(project.id, m.projectId)
                        .then((l) => {
                          setMods(l);
                          toast(`${m.title} entfernt.`, "success");
                        })
                        .catch((e) => toast(String(e), "error")),
                  },
                ])}
              >
                {m.iconUrl ? <img className="mod-icon" src={m.iconUrl} alt="" /> : <span className="mod-icon" />}
                <div className="grow min0">
                  <div className="ellipsis">{m.title}</div>
                  <div className="muted small ellipsis">
                    {m.versionNumber}
                    {m.dependencyOf && t(" · Abhängigkeit")}
                    {m.serverSide === "unsupported" && t(" · nur Client")}
                    {m.clientSide === "unsupported" && t(" · nur Server")}
                  </div>
                </div>
                <Toggle
                  label={`${m.title} aktiv`}
                  checked={m.enabled}
                  onChange={(v) =>
                    modsApi
                      .toggle(project.id, m.projectId, v)
                      .then(setMods)
                      .catch((e) => toast(String(e), "error"))
                  }
                />
                <button
                  className="icon-btn danger"
                  aria-label={`${m.title} entfernen`}
                  data-tip={t("Entfernen")}
                  onClick={() =>
                    modsApi
                      .remove(project.id, m.projectId)
                      .then((l) => {
                        setMods(l);
                        toast(`${m.title} entfernt.`, "success");
                      })
                      .catch((e) => toast(String(e), "error"))
                  }
                >
                  <TrashIcon size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mods-search">
        <div className="search wide">
          <SearchIcon size={15} />
          <label htmlFor="modsearch" className="sr-only">
            {t("Mods auf Modrinth suchen")}
          </label>
          <input
            id="modsearch"
            placeholder={t("Modrinth durchsuchen · NeoForge {mcVersion}", { mcVersion: project.mcVersion })}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              search(e.target.value);
            }}
          />
          {searching && <span className="spinner small" />}
        </div>
        <div className="hits">
          {hits?.length === 0 && <p className="muted small">{t("Keine passenden Mods für NeoForge {version} gefunden.", { version: project.mcVersion })}</p>}
          {hits?.map((h, i) => (
            <div
              key={h.projectId}
              className="hit"
              style={{ "--i": i } as React.CSSProperties}
              {...contextMenu(() => [
                { label: t("Hinzufügen"), icon: <PlusIcon size={15} />, disabled: installed.has(h.projectId) || !!adding, onClick: () => add(h) },
                { label: t("Auf Modrinth ansehen"), icon: <ExternalIcon size={15} />, onClick: () => api.openUrl(`https://modrinth.com/mod/${h.slug}`).catch((e) => toast(String(e), "error")) },
              ])}
            >
              {h.iconUrl ? <img className="mod-icon" src={h.iconUrl} alt="" /> : <span className="mod-icon" />}
              <div className="grow min0">
                <div className="hit-title">
                  {h.title} <span className="muted small">{t("von {author}", { author: h.author })}</span>
                </div>
                <div className="muted small hit-desc">{h.description}</div>
                <div className="muted small">
                  <DownloadIcon size={11} /> {fmt(h.downloads)}
                </div>
              </div>
              {installed.has(h.projectId) ? (
                <span className="tag accent">{t("Hinzugefügt")}</span>
              ) : (
                <button className={adding === h.projectId ? "btn small loading" : "btn small"} disabled={!!adding} onClick={() => add(h)}>
                  <PlusIcon size={14} />{" "}{t("Hinzufügen")}
                </button>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
