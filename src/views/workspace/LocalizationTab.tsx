import { getDraft, setDraft } from "./draft";
import { locale, t } from "../../i18n";
import { useEffect, useMemo, useRef, useState } from "react";
import { Content, contentApi, LangEntry, pickSaveFile, Project } from "../../api";
import { Segmented } from "../../components/Chrome";
import { confirmDialog } from "../../components/Overlay";
import { CloseIcon, DownloadIcon, ImportIcon, PlusIcon, SaveIcon, SearchIcon, TranslateIcon } from "../../icons";
import { toast } from "../../state";

/** Alle Sprachen, die Minecraft kennt (Ordnername der Sprachdatei) */
export const MC_LANGS = [
  "af_za", "ar_sa", "ast_es", "az_az", "ba_ru", "bar", "be_by", "bg_bg", "br_fr", "brb", "bs_ba", "ca_es", "cs_cz", "cy_gb", "da_dk", "de_at", "de_ch",
  "el_gr", "en_au", "en_ca", "en_gb", "en_nz", "en_pt", "en_ud", "enp", "enws", "eo_uy", "es_ar", "es_cl", "es_ec", "es_es", "es_mx", "es_uy", "es_ve", "esan",
  "et_ee", "eu_es", "fa_ir", "fi_fi", "fil_ph", "fo_fo", "fr_ca", "fr_fr", "fra_de", "fur_it", "fy_nl", "ga_ie", "gd_gb", "gl_es", "haw_us", "he_il", "hi_in",
  "hr_hr", "hu_hu", "hy_am", "id_id", "ig_ng", "io_en", "is_is", "isv", "it_it", "ja_jp", "jbo_en", "ka_ge", "kk_kz", "kn_in", "ko_kr", "ksh", "kw_gb", "la_la",
  "lb_lu", "li_li", "lmo", "lo_la", "lol_us", "lt_lt", "lv_lv", "lzh", "mk_mk", "mn_mn", "ms_my", "mt_mt", "nah", "nds_de", "nl_be", "nl_nl", "nn_no", "no_no",
  "oc_fr", "ovd", "pl_pl", "pt_br", "pt_pt", "qya_aa", "ro_ro", "rpr", "ru_ru", "ry_ua", "sah_sah", "se_no", "sk_sk", "sl_si", "so_so", "sq_al", "sr_cs", "sr_sp",
  "sv_se", "sxu", "szl", "ta_in", "th_th", "tl_ph", "tlh_aa", "tok", "tr_tr", "tt_ru", "uk_ua", "val_es", "vec_it", "vi_vn", "yi_de", "yo_ng", "zh_cn", "zh_hk",
  "zh_tw", "zlm_arab",
];

const SPECIAL: Record<string, string> = {
  bar: "Boarisch", brb: "Brabants", enp: "Anglish", enws: "Shakespearean English", esan: "Andalûh", isv: "Interslavic", ksh: "Kölsch", lmo: "Lombard",
  lzh: "文言", nah: "Nahuatl", ovd: "Övdalska", rpr: "Russian (pre-revolutionary)", sxu: "Upper Saxon", szl: "Silesian", tok: "Toki Pona", en_ud: "English (upside down)",
  en_pt: "Pirate Speak", lol_us: "LOLCAT", qya_aa: "Quenya", tlh_aa: "Klingon", jbo_en: "Lojban", fra_de: "Fränkisch", io_en: "Ido", ry_ua: "Rusyn",
};

let names: Intl.DisplayNames | null = null;
export function langName(code: string): string {
  if (SPECIAL[code]) return SPECIAL[code];
  try {
    names ??= new Intl.DisplayNames([locale], { type: "language" });
    const [l, r] = code.split("_");
    const tag = r && r.length === 2 ? `${l}-${r.toUpperCase()}` : l;
    return names.of(tag) ?? code;
  } catch {
    return code;
  }
}

const KIND_LABEL = (k: LangEntry["kind"], shape: string) =>
  k === "block" ? (shape ? t("Block-Form") : t("Block")) : k === "item" ? t("Item") : k === "entity" ? t("Kreatur") : k === "egg" ? t("Spawn-Ei") : t("Kreativ-Tab");

export default function LocalizationTab({ project }: { project: Project }) {
  const [content, setContent] = useState<Content | null>(null);
  const [saved, setSaved] = useState("");
  const [entries, setEntries] = useState<LangEntry[]>([]);
  const [active, setActive] = useState<string>("");
  const [q, setQ] = useState("");
  const [only, setOnly] = useState<"all" | "missing">("all");
  const [kind, setKind] = useState("");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const d = getDraft(project.id);
    if (d) {
      setContent(d.content);
      setSaved(d.saved);
      return;
    }
    contentApi
      .load(project.id)
      .then((c) => {
        setContent(c);
        setSaved(JSON.stringify(c));
      })
      .catch((e) => toast(String(e), "error"));
  }, [project.id]);
  useEffect(() => {
    if (content && saved) setDraft(project.id, content, saved);
  }, [content, saved, project.id]);

  // Einträge neu berechnen, wenn sich Namen ändern
  const req = useRef(0);
  useEffect(() => {
    if (!content) return;
    const n = ++req.current;
    const h = window.setTimeout(() => {
      contentApi
        .langEntries(project.id, content)
        .then((e) => n === req.current && setEntries(e))
        .catch(() => {});
    }, 150);
    return () => window.clearTimeout(h);
  }, [content, project.id]);

  const dirty = content ? JSON.stringify(content) !== saved : false;
  const legacyCodes = useMemo(() => [...new Set(entries.flatMap((e) => Object.keys(e.legacy)))], [entries]);
  const langs = useMemo(() => {
    const extra = [...(content?.languages ?? []), ...legacyCodes, ...Object.keys(content?.translations ?? {})].filter((c) => c !== "en_us");
    return [...new Set(extra)];
  }, [content, legacyCodes]);
  useEffect(() => {
    if (!active && langs.length) setActive(langs[0]);
    if (active && !langs.includes(active)) setActive(langs[0] ?? "");
  }, [langs, active]);

  if (!content) return <div className="content-loading muted">{t("Lade Texte …")}</div>;

  const tr = content.translations ?? {};
  const value = (code: string, e: LangEntry) => (code === "de_de" ? (tr.de_de?.[e.key] ?? e.de) : code === "en_us" ? (tr.en_us?.[e.key] ?? e.en) : (tr[code]?.[e.key] ?? e.legacy[code] ?? ""));
  const done = (code: string) => entries.filter((e) => value(code, e).trim()).length;
  const pct = (code: string) => (entries.length ? Math.round((done(code) / entries.length) * 100) : 100);

  function setTr(code: string, key: string, v: string) {
    setContent((c) => {
      if (!c) return c;
      const all = { ...(c.translations ?? {}) };
      const m = { ...(all[code] ?? {}) };
      if (v.trim()) m[key] = v;
      else delete m[key];
      all[code] = m;
      return { ...c, translations: all };
    });
  }

  /** Deutsch/Englisch: Grundnamen direkt am Inhalt ändern, abgeleitete Texte überschreiben */
  function setBase(code: "de_de" | "en_us", e: LangEntry, v: string) {
    const field = code === "de_de" ? "nameDe" : "nameEn";
    const [type, id] = e.owner.split(":");
    if (e.kind === "tab") {
      setContent((c) => (c ? { ...c, tabName: v } : c));
      return;
    }
    if (!e.shape && (type === "block" || type === "item" || type === "mob")) {
      setContent((c) => {
        if (!c) return c;
        const key = type === "block" ? "blocks" : type === "item" ? "items" : "mobs";
        const list = (c[key] as { id: string }[]).map((x) => (x.id === id ? { ...x, [field]: v } : x));
        return { ...c, [key]: list };
      });
      return;
    }
    setTr(code, e.key, v);
  }

  async function save() {
    if (!content) return;
    setBusy(true);
    try {
      const r = await contentApi.save(project.id, content);
      setContent(r.content);
      setSaved(JSON.stringify(r.content));
      toast(t("Gespeichert – die Sprachdateien wurden erzeugt."), "success");
    } catch (e) {
      toast(String(e), "error");
    } finally {
      setBusy(false);
    }
  }

  function addLang(code: string) {
    setContent((c) => (c ? { ...c, languages: [...new Set([...(c.languages ?? []), code])] } : c));
    setActive(code);
    setAdding(false);
  }

  async function removeLang(code: string) {
    if (!(await confirmDialog(t("„{name}“ entfernen?", { name: langName(code) }), t("Die Übersetzungen in dieser Sprache werden gelöscht."), t("Entfernen"), t("Abbrechen"), true))) return;
    setContent((c) => {
      if (!c) return c;
      const all = { ...(c.translations ?? {}) };
      delete all[code];
      const short = code.split("_")[0];
      const strip = <T extends { names?: Record<string, string> }>(x: T): T => {
        if (!x.names?.[short]) return x;
        const n = { ...x.names };
        delete n[short];
        return { ...x, names: n };
      };
      if (code === "de_de") {
        // Deutsch: auch die deutschen Namen an den Inhalten löschen
        const noDe = <T extends { nameDe: string }>(x: T): T => ({ ...strip(x as T & { names?: Record<string, string> }), nameDe: "" });
        return { ...c, languages: (c.languages ?? []).filter((x) => x !== code), translations: all, blocks: c.blocks.map(noDe), items: c.items.map(noDe), mobs: c.mobs.map(noDe), dimensions: c.dimensions.map((d) => ({ ...d, nameDe: "" })) };
      }
      return { ...c, languages: (c.languages ?? []).filter((x) => x !== code), translations: all, blocks: c.blocks.map(strip), items: c.items.map(strip), mobs: c.mobs.map(strip) };
    });
  }

  async function exportJson() {
    const dest = await pickSaveFile(t("Übersetzungen exportieren"), `${project.modId}-sprachen.json`, "json", "JSON");
    if (!dest) return;
    const data: Record<string, Record<string, string>> = {};
    for (const code of ["de_de", "en_us", ...langs]) data[code] = Object.fromEntries(entries.map((e) => [e.key, value(code, e)]).filter(([, v]) => v));
    contentApi
      .langExport(dest, data)
      .then(() => toast(t("Exportiert."), "success"))
      .catch((e) => toast(String(e), "error"));
  }

  async function importJson() {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const path = await open({ multiple: false, title: t("Übersetzungen importieren"), filters: [{ name: "JSON", extensions: ["json"] }] });
    if (typeof path !== "string") return;
    try {
      const data = await contentApi.langImport(path);
      const known = new Set(entries.map((e) => e.key));
      let n = 0;
      setContent((c) => {
        if (!c) return c;
        const all = { ...(c.translations ?? {}) };
        const langsNew = new Set(c.languages ?? []);
        for (const [code, map] of Object.entries(data)) {
          if (!/^[a-z_]{2,12}$/.test(code) || typeof map !== "object" || !map) continue;
          const m = { ...(all[code] ?? {}) };
          for (const [k, v] of Object.entries(map)) {
            if (known.has(k) && typeof v === "string" && v.trim()) {
              m[k] = v;
              n++;
            }
          }
          all[code] = m;
          if (code !== "de_de" && code !== "en_us") langsNew.add(code);
        }
        return { ...c, translations: all, languages: [...langsNew] };
      });
      window.setTimeout(() => toast(t("{n} Texte importiert.", { n }), "success"), 0);
    } catch (e) {
      toast(String(e), "error");
    }
  }

  const query = q.trim().toLowerCase();
  const rows = entries.filter(
    (e) =>
      (!kind || e.kind === kind) &&
      (only === "all" || !active || !value(active, e).trim()) &&
      (!query || `${e.key} ${e.de} ${e.en} ${active ? value(active, e) : ""}`.toLowerCase().includes(query)),
  );

  return (
    <div className="loc-tab">
      <header className="loc-head">
        <div className="grow">
          <h1>{t("Localization")}</h1>
          <p className="muted">{t("Alle Texte deiner Mod an einem Ort. Englisch ist immer dabei, weitere Sprachen wie Deutsch fügst du hinzu.")}</p>
        </div>
        <button className="btn small" onClick={importJson}>
          <ImportIcon size={14} /> {t("Importieren")}
        </button>
        <button className="btn small" onClick={exportJson}>
          <DownloadIcon size={14} /> {t("Exportieren")}
        </button>
        <button className={busy ? "btn primary loading" : "btn primary"} disabled={busy || !dirty} onClick={save}>
          <SaveIcon size={14} /> {dirty ? t("Speichern") : t("Alles gespeichert")}
        </button>
      </header>

      <div className="loc-langs">
        {["en_us"].map((code) => (
          <span key={code} className="loc-lang fixed">
            {langName(code)} <span className="mono muted">{code}</span> <span className="ok small">{pct(code)} %</span>
          </span>
        ))}
        {langs.map((code) => (
          <span key={code} className={code === active ? "loc-lang active" : "loc-lang"}>
            <button className="loc-lang-pick" onClick={() => setActive(code)} aria-pressed={code === active}>
              {langName(code)} <span className="mono muted">{code}</span> <span className={pct(code) === 100 ? "ok small" : "warn small"}>{pct(code)} %</span>
            </button>
            <button className="loc-lang-x" aria-label={t("„{name}“ entfernen", { name: langName(code) })} onClick={() => removeLang(code)}>
              <CloseIcon size={10} />
            </button>
          </span>
        ))}
        <button className="loc-lang add" onClick={() => setAdding(true)}>
          <PlusIcon size={13} /> {t("Sprache hinzufügen")}
        </button>
      </div>

      <div className="loc-tools">
        <div className="search">
          <SearchIcon size={13} />
          <input placeholder={t("Text oder Schlüssel suchen …")} aria-label={t("Texte suchen")} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Segmented
          label={t("Filter")}
          value={only}
          onChange={setOnly}
          options={[
            { value: "all", label: t("Alle") },
            { value: "missing", label: t("Nur fehlende"), disabled: !active },
          ]}
        />
        <select className="input" value={kind} onChange={(e) => setKind(e.target.value)} aria-label={t("Art")}>
          <option value="">{t("Alle Arten")}</option>
          <option value="block">{t("Blöcke")}</option>
          <option value="item">{t("Items")}</option>
          <option value="entity">{t("Kreaturen")}</option>
          <option value="egg">{t("Spawn-Eier")}</option>
          <option value="tab">{t("Kreativ-Tab")}</option>
        </select>
        <span className="grow" />
        <span className="muted small">{t("{n} Texte", { n: rows.length })}</span>
      </div>

      {entries.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">
            <TranslateIcon size={24} />
          </div>
          <h2>{t("Noch keine Texte")}</h2>
          <p className="muted">{t("Sobald deine Mod Blöcke, Items oder Kreaturen hat, erscheinen ihre Namen hier.")}</p>
        </div>
      ) : (
        <div className="loc-table-wrap">
          <table className="loc-table">
            <thead>
              <tr>
                <th style={{ width: 130 }}>{t("Art")}</th>
                <th>{t("Englisch")}</th>
                {active && (
                  <th>
                    {langName(active)} · {pct(active)} %
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.key}>
                  <td>
                    <span className="badge-mini" title={e.key}>
                      {KIND_LABEL(e.kind, e.shape)}
                    </span>
                    <div className="mono tiny muted loc-key">{e.key}</div>
                  </td>
                  <td>
                    <input className="input" value={value("en_us", e)} aria-label={t("Englisch")} onChange={(ev) => setBase("en_us", e, ev.target.value)} />
                  </td>
                  {active && (
                    <td>
                      <input
                        className={value(active, e).trim() ? "input" : "input missing"}
                        value={value(active, e)}
                        placeholder={t("Fehlt – übersetzen")}
                        aria-label={langName(active)}
                        onChange={(ev) => (active === "de_de" ? setBase("de_de", e, ev.target.value) : setTr(active, e.key, ev.target.value))}
                      />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {adding && <LangPicker exclude={["en_us", ...langs]} onPick={addLang} onClose={() => setAdding(false)} />}
    </div>
  );
}

function LangPicker({ exclude, onPick, onClose }: { exclude: string[]; onPick: (code: string) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const list = MC_LANGS.filter((c) => !exclude.includes(c))
    .map((c) => ({ code: c, name: langName(c) }))
    .filter((x) => !q.trim() || `${x.code} ${x.name}`.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name, locale));
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="lang-picker" role="dialog" aria-label={t("Sprache hinzufügen")}>
        <div className="create-head">
          <div className="panel-title-lg">{t("Sprache hinzufügen")}</div>
          <div className="search create-search">
            <SearchIcon size={13} />
            <input autoFocus placeholder={t("Sprache suchen …")} aria-label={t("Sprache suchen")} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && list[0] && onPick(list[0].code)} />
          </div>
          <button className="icon-btn" onClick={onClose} aria-label={t("Schließen")} data-tip={t("Schließen")}>
            <CloseIcon size={14} />
          </button>
        </div>
        <div className="lang-list">
          {list.map((x) => (
            <button key={x.code} onClick={() => onPick(x.code)}>
              <span className="grow">{x.name}</span>
              <span className="mono muted small">{x.code}</span>
            </button>
          ))}
          {list.length === 0 && <p className="muted">{t("Nichts gefunden.")}</p>}
        </div>
      </div>
    </div>
  );
}
