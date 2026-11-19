import { useEffect, useState } from "react";
import { McIconDef } from "../api";
import { renderIcon } from "../iconRender";

/** Item-/Block-Symbol wie im Minecraft-Inventar (3D-Blockmodell oder flache Textur). */
export default function McIcon({
  icon,
  textures,
  size = 32,
  fallback,
}: {
  icon?: McIconDef;
  textures?: Record<string, string>;
  size?: number;
  fallback?: string;
}) {
  const [src, setSrc] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    renderIcon(icon, textures, Math.max(48, 16 * Math.ceil((size * 2) / 16))).then((s) => alive && setSrc(s));
    return () => {
      alive = false;
    };
  }, [icon, textures, size]);

  const style = { width: size, height: size } as React.CSSProperties;
  if (src) {
    return (
      <span className="mc-icon" style={style} aria-hidden="true">
        <img className="mc-img" src={src} alt="" draggable={false} />
      </span>
    );
  }
  return (
    <span className="mc-icon" style={style} aria-hidden="true">
      {src === null && <span className="mc-letter">{(fallback ?? "?").slice(0, 2).toUpperCase()}</span>}
    </span>
  );
}
