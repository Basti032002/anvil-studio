import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Eine einzige Tooltip-Ebene für die ganze App.
 * Liest `data-tip` vom Element unter der Maus und zeichnet den Text über allem
 * (position: fixed im <body>), damit er nie hinter Panels oder abgeschnitten liegt.
 */
type Tip = { text: string; x: number; y: number; side: "below" | "above" | "right" };

const SIDE_CONTAINERS = ".activitybar, .pixel-tools, .tx-tools";
const DELAY = 380;

export function Tooltips() {
  const [tip, setTip] = useState<Tip | null>(null);
  const [shown, setShown] = useState(false);
  const el = useRef<HTMLElement | null>(null);
  const timer = useRef<number>(0);
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    const hide = () => {
      window.clearTimeout(timer.current);
      el.current = null;
      setShown(false);
      setTip(null);
      setPos(null);
    };
    const over = (e: MouseEvent) => {
      const target = (e.target as HTMLElement | null)?.closest?.("[data-tip]") as HTMLElement | null;
      if (target === el.current) return;
      hide();
      if (!target) return;
      const text = target.getAttribute("data-tip");
      if (!text) return;
      el.current = target;
      timer.current = window.setTimeout(() => {
        if (el.current !== target || !target.isConnected) return;
        const r = target.getBoundingClientRect();
        if (target.closest(SIDE_CONTAINERS)) setTip({ text, x: r.right + 8, y: r.top + r.height / 2, side: "right" });
        else if (r.bottom + 34 > window.innerHeight) setTip({ text, x: r.left + r.width / 2, y: r.top - 6, side: "above" });
        else setTip({ text, x: r.left + r.width / 2, y: r.bottom + 6, side: "below" });
      }, DELAY);
    };
    const out = (e: MouseEvent) => {
      if (!e.relatedTarget) hide();
    };
    document.addEventListener("mouseover", over, true);
    document.addEventListener("mouseout", out, true);
    document.addEventListener("mousedown", hide, true);
    document.addEventListener("wheel", hide, { capture: true, passive: true });
    window.addEventListener("blur", hide);
    window.addEventListener("keydown", hide, true);
    return () => {
      document.removeEventListener("mouseover", over, true);
      document.removeEventListener("mouseout", out, true);
      document.removeEventListener("mousedown", hide, true);
      document.removeEventListener("wheel", hide, true);
      window.removeEventListener("blur", hide);
      window.removeEventListener("keydown", hide, true);
    };
  }, []);

  // Nach dem ersten Zeichnen messen und am Fensterrand halten
  useEffect(() => {
    if (!tip || !box.current) return;
    // Oberste Ebene des Browsers: liegt damit auch über Dialogen und allem mit eigenem z-index
    const b = box.current as HTMLDivElement & { showPopover?: () => void };
    try {
      if (b.showPopover && !b.matches(":popover-open")) b.showPopover();
    } catch {}
    const w = box.current.offsetWidth;
    const h = box.current.offsetHeight;
    let left = tip.side === "right" ? tip.x : tip.x - w / 2;
    let top = tip.side === "right" ? tip.y - h / 2 : tip.side === "above" ? tip.y - h : tip.y;
    if (tip.side === "right" && left + w > window.innerWidth - 6) left = tip.x - 16 - w - (el.current?.getBoundingClientRect().width ?? 0);
    left = Math.max(6, Math.min(left, window.innerWidth - w - 6));
    top = Math.max(6, Math.min(top, window.innerHeight - h - 6));
    setPos({ left, top });
    const raf = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(raf);
  }, [tip]);

  if (!tip) return null;
  return createPortal(
    <div
      ref={box}
      role="tooltip"
      {...({ popover: "manual" } as Record<string, string>)}
      className={`app-tip ${tip.side}${shown ? " show" : ""}`}
      style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: -9999 }}
    >
      {tip.text}
    </div>,
    document.body,
  );
}
