import { McIconDef } from "../api";

/** Item-/Block-Symbol: flache Textur oder kleiner isometrischer Würfel. */
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
  const url = (t?: string) => (t && textures?.[t] ? `url("${textures[t]}")` : undefined);
  const style = { width: size, height: size } as React.CSSProperties;

  if (icon?.kind === "flat" && url(icon.tex)) {
    return (
      <span className="mc-icon" style={style} aria-hidden="true">
        <span className="mc-flat" style={{ backgroundImage: url(icon.tex) }} />
      </span>
    );
  }
  if (icon?.kind === "cube" && url(icon.top) && url(icon.side)) {
    const half = (size * 0.62) / 2;
    return (
      <span className="mc-icon" style={style} aria-hidden="true">
        <span className="mc-cube" style={{ "--h": `${half}px` } as React.CSSProperties}>
          <span className="t" style={{ backgroundImage: url(icon.top) }} />
          <span className="f" style={{ backgroundImage: url(icon.front ?? icon.side) }} />
          <span className="r" style={{ backgroundImage: url(icon.side) }} />
        </span>
      </span>
    );
  }
  return (
    <span className="mc-icon" style={style} aria-hidden="true">
      <span className="mc-letter">{(fallback ?? "?").slice(0, 2).toUpperCase()}</span>
    </span>
  );
}
