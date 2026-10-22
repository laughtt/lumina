import { useRef, useState, type CSSProperties } from "react";
import { api } from "./api";
import { TvFrame } from "./TvFrame";
import { Alexa, askLumina } from "./Alexa";
import { Phone, usePoll } from "./Phone";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const clock = (at: string) => api("/api/demo/clock", { at });
const advance = (minutes: number) => api("/api/demo/clock", { minutes });
const phoneTab = (tab: string) => window.dispatchEvent(new CustomEvent("lumina:phone", { detail: tab }));

type Step = { at?: string; mark?: string; caption: string; run: () => Promise<unknown> };

const STORY: Step[] = [
  { at: "08:05", mark: "Ana leaves", caption: "8:05 am. Before work, Ana answers the question her mother asks most.", run: async () => {
    phoneTab("answers");
    const text = "At work, home at 6. Lunch is in the fridge.";
    const c = await api("/api/answers/check", { topic: "where_is_ana", text });
    await api("/api/answers/where_is_ana", { text, rosa_text: c.rosa_text, tv_line: c.tv_line }, "PUT");
    await wait(3000);
  } },
  { at: "13:47", mark: "Rosa asks", caption: "1:47 pm. Rosa asks where her daughter is. She hears Ana's own words.", run: () => askLumina("Where's my girl?") },
  { at: "14:00", mark: "Pill", caption: "2:00 pm. The pill reminder is on the TV. Rosa checks, then confirms.", run: async () => {
    await wait(2500); await askLumina("Did I take my pill?"); await askLumina("I took it");
  } },
  { at: "16:10", mark: "Afternoon", caption: "4:10 pm. Afternoons are hard. Rosa asks again, and again.", run: async () => {
    phoneTab("inbox");
    for (const q of ["Where's Ana?", "Is Ana coming home?", "Where's my girl?"]) { await askLumina(q); await advance(2); }
    await wait(9000);
  } },
  { caption: "Lumina noticed: three asks in half an hour, above her usual. Her answer is now big on the TV, and Ana sees why.", run: () => wait(7000) },
  { caption: "Rosa talks about an old photo, and the TV follows the conversation.", run: () => askLumina("That's our house in Porto!") },
  { at: "20:00", mark: "Evening note", caption: "8:00 pm. Ana reads how the day went, in three lines.", run: async () => {
    phoneTab("rosa"); await wait(8000);
  } },
];

const LIGHT: [number, string][] = [
  [360, "#C9D6E6"], [540, "#E6EEF2"], [780, "#F4E9CC"], [990, "#F1D29A"], [1140, "#8E6F8F"], [1230, "#3A3450"], [1320, "#121A2E"],
];

function roomLight(minutes: number) {
  const m = Math.min(Math.max(minutes, 360), 1320);
  const i = Math.max(0, LIGHT.findIndex(([t]) => t >= m) - 1);
  const [t0, c0] = LIGHT[i], [t1, c1] = LIGHT[Math.min(i + 1, LIGHT.length - 1)];
  const k = t1 === t0 ? 0 : (m - t0) / (t1 - t0);
  const mix = (a: string, b: string) => Math.round(parseInt(a, 16) * (1 - k) + parseInt(b, 16) * k).toString(16).padStart(2, "0");
  const color = `#${mix(c0.slice(1, 3), c1.slice(1, 3))}${mix(c0.slice(3, 5), c1.slice(3, 5))}${mix(c0.slice(5, 7), c1.slice(5, 7))}`;
  return { color, dark: m > 1150 };
}

export function Studio() {
  const [family, refresh] = usePoll<any>("/api/family", 1500);
  const [caption, setCaption] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const playing = useRef(false);
  const minutes = family?.clock?.minutes ?? 720;
  const light = roomLight(minutes);

  async function story() {
    if (playing.current) { playing.current = false; return; }
    playing.current = true;
    setBusy("story");
    await api("/api/demo/reset", {});
    await wait(2500);
    for (const step of STORY) {
      if (!playing.current) break;
      if (step.at) await clock(step.at);
      setCaption(step.caption);
      await step.run();
      refresh();
    }
    playing.current = false;
    setBusy(null);
    setTimeout(() => setCaption(null), 6000);
  }

  const act = async (name: string, fn: () => Promise<unknown>) => { setBusy(name); await fn().catch(() => {}); setBusy(null); refresh(); };

  return (
    <div className={`studio ${light.dark ? "studio-dark" : ""}`} style={{ "--room": light.color } as CSSProperties}>
      <header className="bar">
        <div className="mark"><span className="sun" />Lumina</div>
        <p className="tag">Answer once. She can ask forever.</p>
        <div className="actions">
          <button className="primary" onClick={story}>{busy === "story" ? "Stop story" : "Play the story"}</button>
          <button onClick={() => act("agent", () => api("/api/agent/run", {}))} disabled={!!busy}>{busy === "agent" ? "Lumina is looking…" : "Run the agent now"}</button>
          <button onClick={() => act("reset", () => api("/api/demo/reset", {}))} disabled={!!busy}>Reset the day</button>
        </div>
      </header>

      <SunPath minutes={minutes} label={family ? `${family.clock.weekday}, ${family.clock.time} ${family.clock.ampm}` : ""} onJump={(at) => act("clock", () => clock(at))} />

      <div className="room">
        <div className="wall">
          <TvFrame remote />
          <Alexa compact />
        </div>
        <aside className="hand" aria-label="Ana's phone">
          <Phone />
        </aside>
      </div>

      {caption && <div className="caption" role="status">{caption}</div>}
    </div>
  );
}

function SunPath({ minutes, label, onJump }: { minutes: number; label: string; onJump: (at: string) => void }) {
  const pos = (m: number) => `${((Math.min(Math.max(m, 360), 1320) - 360) / 960) * 100}%`;
  const toMin = (at: string) => Number(at.slice(0, 2)) * 60 + Number(at.slice(3));
  const track = useRef<HTMLDivElement>(null);
  const jumpAt = (clientX: number) => {
    const r = track.current!.getBoundingClientRect();
    const m = Math.round((360 + ((clientX - r.left) / r.width) * 960) / 5) * 5;
    onJump(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
  };
  return (
    <div className="sunpath">
      <span className="now-label">{label}</span>
      <div className="track" ref={track} onClick={(e) => jumpAt(e.clientX)} role="slider" aria-label="Demo clock" aria-valuemin={360} aria-valuemax={1320} aria-valuenow={minutes} tabIndex={0}
        onKeyDown={(e) => { if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); advance(e.key === "ArrowRight" ? 15 : -15); } }}>
        <div className="sun-dot" style={{ left: pos(minutes) }} />
        {STORY.filter((s) => s.at).map((s, i, all) => (
          <button key={s.at} className={`moment ${i > 0 && toMin(s.at!) - toMin(all[i - 1].at!) < 45 ? "moment-low" : ""}`} style={{ left: pos(toMin(s.at!)) }} onClick={(e) => { e.stopPropagation(); onJump(s.at!); }}>
            {s.mark}
          </button>
        ))}
      </div>
    </div>
  );
}
