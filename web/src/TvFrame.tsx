import { useEffect, useRef, useState } from "react";
import { TvApp } from "@lumina/tv-shared";
import { token } from "./api";

const solo = location.pathname.startsWith("/tv");
const pair = solo && new URLSearchParams(location.search).has("pair");
const saved = solo ? (() => { try { return localStorage.getItem("lumina-tv") ?? ""; } catch { return ""; } })() : "";
const paired = (key: string) => {
  try { localStorage.setItem("lumina-tv", key); } catch {}
  history.replaceState(null, "", location.pathname);
};

export function TvFrame({ remote = false }: { remote?: boolean }) {
  const screen = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.4);

  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setScale(e.contentRect.width / 1920));
    ro.observe(screen.current!);
    return () => ro.disconnect();
  }, []);

  const buttons = () => [...screen.current!.querySelectorAll<HTMLElement>('[role="button"]')];
  const move = (d: number) => {
    const bs = buttons();
    const i = bs.indexOf(document.activeElement as HTMLElement);
    bs[i < 0 ? 0 : (i + d + bs.length) % bs.length]?.focus();
  };
  const select = () => {
    const bs = buttons();
    const el = bs.includes(document.activeElement as HTMLElement) ? (document.activeElement as HTMLElement) : bs[0];
    el?.focus();
    el?.click();
  };

  return (
    <div className="tv">
      <div
        className="tv-screen"
        ref={screen}
        style={{ height: 1080 * scale }}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") { move(1); e.preventDefault(); }
          if (e.key === "ArrowLeft") { move(-1); e.preventDefault(); }
        }}
      >
        <div style={{ width: 1920, height: 1080, transform: `scale(${scale})`, transformOrigin: "top left" }}>
          <TvApp api="" token={pair ? undefined : saved || token} pair={pair} onPaired={paired} />
        </div>
      </div>
      {remote && (
        <div className="remote" aria-label="Fire TV remote">
          <button onClick={() => move(-1)} aria-label="Left">◀</button>
          <button className="remote-ok" onClick={select} aria-label="Select">OK</button>
          <button onClick={() => move(1)} aria-label="Right">▶</button>
        </div>
      )}
    </div>
  );
}
