import { useState } from "react";
import { t } from "../../i18n";
import { FaceMode, Faces, LibTex } from "../../api";
import { pngUrl, thumbStyle } from "./texlib";

export const EMPTY_FACES: Faces = { mode: "", all: "", top: "", bottom: "", side: "", north: "", south: "", east: "", west: "" };

/** Kleiner 3D-Würfel: faces = [oben, unten, nord, süd, ost, west] (Bild-URLs) */
export function CubePreview({ faces, size = 120, spin = true }: { faces: string[]; size?: number; spin?: boolean }) {
  const h = size / 2;
  const f = (i: number, tr: string, shade: number) => (
    <div className="cube-face" style={{ width: size, height: size, transform: tr, backgroundImage: faces[i] ? `url(${faces[i]})` : undefined, filter: `brightness(${shade})` }} />
  );
  return (
    <div className="cube-scene" style={{ width: size * 1.5, height: size * 1.5 }}>
      <div className={spin ? "cube spin" : "cube"} style={{ width: size, height: size }}>
        {f(0, `rotateX(90deg) translateZ(${h}px)`, 1)}
        {f(1, `rotateX(-90deg) translateZ(${h}px)`, 0.5)}
        {f(2, `rotateY(180deg) translateZ(${h}px)`, 0.8)}
        {f(3, `translateZ(${h}px)`, 0.8)}
        {f(4, `rotateY(90deg) translateZ(${h}px)`, 0.6)}
        {f(5, `rotateY(-90deg) translateZ(${h}px)`, 0.6)}
      </div>
    </div>
  );
}

const firstFrame = (t: LibTex | undefined) => (t ? pngUrl(t.png) : "");

/** Auswahl einer Bibliotheks-Textur mit Vorschaubildern */
export function LibTexSelect({ lib, value, onChange, label, own }: { lib: LibTex[]; value: string; onChange: (id: string) => void; label: string; own?: string }) {
  const [open, setOpen] = useState(false);
  const cur = lib.find((x) => x.id === value);
  return (
    <div className="lts">
      <span className="lts-label">{label}</span>
      <button className="lts-btn" onClick={() => setOpen((o) => !o)}>
        <span className="lts-thumb" style={cur ? thumbStyle(cur, 26) : own ? { backgroundImage: `url(${own})`, backgroundSize: "26px 26px", imageRendering: "pixelated" } : {}} />
        <span className="grow mono">{cur ? cur.id : t("Eigene Textur")}</span>
        <span className="muted">▾</span>
      </button>
      {open && (
        <div className="lts-pop" onMouseLeave={() => setOpen(false)}>
          <button
            className={!value ? "lts-opt active" : "lts-opt"}
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
          >
            <span className="lts-thumb" style={own ? { backgroundImage: `url(${own})`, backgroundSize: "26px 26px", imageRendering: "pixelated" } : {}} />
            {t("Eigene Textur")}
          </button>
          {lib.map((x) => (
            <button
              key={x.id}
              className={x.id === value ? "lts-opt active" : "lts-opt"}
              onClick={() => {
                onChange(x.id);
                setOpen(false);
              }}
            >
              <span className="lts-thumb" style={thumbStyle(x, 26)} />
              <span className="mono">{x.id}</span>
              {x.frames > 1 && <span className="muted tiny">▶ {x.frames}</span>}
            </button>
          ))}
          {lib.length === 0 && <p className="muted tiny pad">{t("Noch keine Texturen im Tab „Texturen“.")}</p>}
        </div>
      )}
    </div>
  );
}

/** Block-Seiten aus der Bibliothek belegen */
export function FacesEditor({ faces, lib, own, onChange, onOpenLib }: { faces: Faces | undefined; lib: LibTex[]; own: string; onChange: (f: Faces) => void; onOpenLib: () => void }) {
  const f = faces ?? EMPTY_FACES;
  const set = (p: Partial<Faces>) => onChange({ ...f, ...p });
  const url = (id: string) => firstFrame(lib.find((x) => x.id === id)) || own;
  const cube =
    f.mode === "all"
      ? Array(6).fill(url(f.all))
      : f.mode === "pillar"
        ? [url(f.top), url(f.bottom), url(f.side), url(f.side), url(f.side), url(f.side)]
        : f.mode === "each"
          ? [url(f.top), url(f.bottom), url(f.north), url(f.south), url(f.east), url(f.west)]
          : Array(6).fill(own);
  const modes: [FaceMode, string][] = [
    ["", t("Eigene malen")],
    ["all", t("Alle Seiten gleich")],
    ["pillar", t("Oben / Unten / Seiten")],
    ["each", t("Jede Seite einzeln")],
  ];
  return (
    <div className="faces">
      <div className="faces-modes">
        {modes.map(([m, l]) => (
          <button
            key={m}
            className={f.mode === m ? "tx-chip active" : "tx-chip"}
            onClick={() => {
              // beim Wechsel sinnvoll vorbelegen
              const base = f.all || f.side || f.top || lib[0]?.id || "";
              if (m === "all") set({ mode: m, all: f.all || base });
              else if (m === "pillar") set({ mode: m, top: f.top || base, bottom: f.bottom || base, side: f.side || base });
              else if (m === "each") set({ mode: m, top: f.top || base, bottom: f.bottom || base, north: f.north || f.side || base, south: f.south || f.side || base, east: f.east || f.side || base, west: f.west || f.side || base });
              else set({ mode: m });
            }}
          >
            {l}
          </button>
        ))}
      </div>
      {f.mode !== "" && (
        <div className="faces-body">
          <CubePreview faces={cube} size={78} />
          <div className="faces-slots">
            {f.mode === "all" && <LibTexSelect lib={lib} own={own} label={t("Alle Seiten")} value={f.all} onChange={(v) => set({ all: v })} />}
            {f.mode === "pillar" && (
              <>
                <LibTexSelect lib={lib} own={own} label={t("Oben")} value={f.top} onChange={(v) => set({ top: v })} />
                <LibTexSelect lib={lib} own={own} label={t("Seiten")} value={f.side} onChange={(v) => set({ side: v })} />
                <LibTexSelect lib={lib} own={own} label={t("Unten")} value={f.bottom} onChange={(v) => set({ bottom: v })} />
              </>
            )}
            {f.mode === "each" && (
              <>
                <LibTexSelect lib={lib} own={own} label={t("Oben")} value={f.top} onChange={(v) => set({ top: v })} />
                <LibTexSelect lib={lib} own={own} label={t("Unten")} value={f.bottom} onChange={(v) => set({ bottom: v })} />
                <LibTexSelect lib={lib} own={own} label={t("Norden (vorne)")} value={f.north} onChange={(v) => set({ north: v })} />
                <LibTexSelect lib={lib} own={own} label={t("Süden (hinten)")} value={f.south} onChange={(v) => set({ south: v })} />
                <LibTexSelect lib={lib} own={own} label={t("Osten (rechts)")} value={f.east} onChange={(v) => set({ east: v })} />
                <LibTexSelect lib={lib} own={own} label={t("Westen (links)")} value={f.west} onChange={(v) => set({ west: v })} />
              </>
            )}
          </div>
        </div>
      )}
      <button className="btn small ghost" onClick={onOpenLib}>
        {t("Texturen im Tab „Texturen“ malen …")}
      </button>
    </div>
  );
}
