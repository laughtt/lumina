import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { call, useLumina, type Check } from "./lumina";

export const r = (i: number) => ({ "--i": i }) as CSSProperties;

const paths: Record<string, string> = {
  quote: "M4 5h16v11H9l-5 4zM8.5 9.5h2v2l-1 1.5M13.5 9.5h2v2l-1 1.5",
  chart: "M4 20h16M7 16v-5M12 16V6M17 16v-8",
  heart: "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z",
  photos: "M7 3h14v14M3 7h14v14H3zM3 17l4-4 4 4 2-2 4 4",
  gear: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19 12l2-1-1-3-2 .2-1.2-1.2L17 5l-3-1-1 2h-2L10 4 7 5l.2 2L6 8.2 4 8l-1 3 2 1v0l-2 1 1 3 2-.2 1.2 1.2L7 19l3 1 1-2h2l1 2 3-1-.2-2 1.2-1.2 2 .2 1-3z",
  people: "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 19c0-3 2.7-5 6-5s6 2 6 5M16 5.5a3 3 0 0 1 0 5.5M18 14c2 .6 3 2.3 3 5",
  person: "M12 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM5 20c0-3.5 3-6 7-6s7 2.5 7 6",
  plus: "M12 5v14M5 12h14",
  back: "M15 5l-7 7 7 7",
  next: "M9 5l7 7-7 7",
  x: "M6 6l12 12M18 6L6 18",
  check: "M5 12.5l4.5 4.5L19 7",
  tv: "M3 5h18v12H3zM8 21h8",
  house: "M4 11l8-7 8 7M6 9.5V20h12V9.5",
  case: "M4 8h16v12H4zM9 8V5h6v3M12 11v6M9 14h6",
  speaker: "M8 3h8a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3zM12 11a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 6.5v.1",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2",
  up: "M7 11v9H4v-9zM7 11l4-7c1.5 0 2.5 1 2 3l-1 3h6c1.2 0 2 1 1.8 2.2l-1.3 6A2 2 0 0 1 16.5 20H7",
  down: "M7 13V4H4v9zM7 13l4 7c1.5 0 2.5-1 2-3l-1-3h6c1.2 0 2-1 1.8-2.2l-1.3-6A2 2 0 0 0 16.5 4H7",
  bell: "M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 21h4",
  photo: "M3 5h18v14H3zM3 16l5-5 5 5 3-3 5 5M15.5 8.5v.1",
  bubble: "M4 5h16v11H9l-5 4zM8 9h8M8 12h5",
  moon: "M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z",
  share: "M12 3v12M7 8l5-5 5 5M5 12v8h14v-8",
  copy: "M8 8h12v12H8zM4 16V4h12",
  sun: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5",
};

export function Icon({ name, size = 22 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={paths[name]} />
    </svg>
  );
}

export const Caps = ({ children }: { children: ReactNode }) => <div className="caps">{children}</div>;
export const Card = ({ children, className = "" }: { children: ReactNode; className?: string }) => <div className={`card ${className}`}>{children}</div>;

export function Tick({ on }: { on: boolean }) {
  return <span className={`tick${on ? " on" : ""}`}><Icon name="check" size={14} /></span>;
}

export function Choice({ on, icon, title, detail, onClick, style }: { on: boolean; icon?: string; title: string; detail: string; onClick: () => void; style?: CSSProperties }) {
  return (
    <button className={`choice rise${on ? " on" : ""}`} style={style} aria-pressed={on} onClick={onClick}>
      {icon && <span className="choice-icon"><Icon name={icon} /></span>}
      <span className="choice-text"><b>{title}</b><span>{detail}</span></span>
      <Tick on={on} />
    </button>
  );
}

export function Tile({ on, title, onClick }: { on: boolean; title: string; onClick: () => void }) {
  return <button className={`tile${on ? " on" : ""}`} aria-pressed={on} onClick={onClick}>{title}</button>;
}

export function Field({ label, hint, value, onChange }: { label: string; hint: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="field">
      <Caps>{label}</Caps>
      <input value={value} placeholder={hint} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

export const ProgressLine = ({ value }: { value: number }) => (
  <div className="progress" role="progressbar" aria-valuenow={Math.round(value * 100)}><i style={{ width: `${Math.min(Math.max(value, 0), 1) * 100}%` }} /></div>
);

export function Switch({ on, onChange, label }: { on: boolean; onChange: (on: boolean) => void; label: string }) {
  return <input type="checkbox" role="switch" className="switch" aria-label={label} checked={on} onChange={(e) => onChange(e.target.checked)} />;
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  return (
    <div className="sheet-back" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <header><h2>{title}</h2><button className="icon-btn" aria-label="Close" onClick={onClose}><Icon name="x" /></button></header>
        {children}
      </div>
    </div>
  );
}

export function AnswerEditor({ topic, text: start, saved }: { topic: string; text: string; saved: () => void }) {
  const { calls, send } = useLumina();
  const [text, setText] = useState(start);
  const [check, setCheck] = useState<Check | null>(null);
  const [busy, setBusy] = useState(false);

  async function approve(rosa_text: string) {
    await send(`/api/answers/${topic}`, { text, rosa_text, tv_line: check!.tv_line }, "PUT");
    saved();
  }

  return (
    <div className="answer-editor">
      <textarea rows={3} value={text} placeholder="Say it the way you would" onChange={(e) => { setText(e.target.value); setCheck(null); }} />
      {check ? (
        <div className="check fade">
          <Caps>{calls} hears</Caps>
          <p>“{check.rosa_text}”</p>
          <Caps>TV shows</Caps>
          <div className="tv-line">{check.tv_line}</div>
          {check.issues.map((i) => <p key={i} className="error">{i}</p>)}
          {check.suggestion && <p>Lumina suggests: “{check.suggestion}”</p>}
          <div className="row">
            <button className="btn small" onClick={() => approve(check.rosa_text)}>Approve</button>
            {check.suggestion && <button className="btn small ghost" onClick={() => approve(check.suggestion!)}>Use suggestion</button>}
            <button className="btn small ghost" onClick={() => setCheck(null)}>Edit</button>
          </div>
        </div>
      ) : (
        <div className="row">
          <button className="btn small" disabled={busy || !text.trim()} onClick={async () => {
            setBusy(true);
            setCheck(await call<Check>("/api/answers/check", { topic, text }).catch(() => null));
            setBusy(false);
          }}>{busy ? "Lumina is reading it…" : "Check with Lumina"}</button>
        </div>
      )}
    </div>
  );
}

export function PairTV() {
  const { calls, person, loadMe } = useLumina();
  const [code, setCode] = useState("");
  const [state, setState] = useState<"" | "paired" | "failed">("");
  return (
    <div className="pair">
      {(state === "paired" || person?.tvPaired) && <p className="ok"><Icon name="check" size={18} /> A TV is paired. It shows {calls}'s answers.</p>}
      <p className="soft">Open Lumina on the TV and type the code it shows.</p>
      <div className="row">
        <input className="code" value={code} placeholder="ABC123" autoCapitalize="characters" autoComplete="off" spellCheck={false}
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))} />
        <button className="btn small" disabled={code.length !== 6} onClick={async () => {
          try { await call("/api/tv/claim", { code }); setState("paired"); setCode(""); loadMe(); } catch { setState("failed"); }
        }}>Pair TV</button>
      </div>
      {state === "failed" && <p className="error">That code didn't work. Codes last 10 minutes, so check the TV for a fresh one.</p>}
    </div>
  );
}

export function AlexaKey() {
  const [devices, setDevices] = useState<{ key: string; mcpUrl: string }>();
  const [copied, setCopied] = useState("");
  useEffect(() => { call("/api/person/devices").then(setDevices, () => {}); }, []);
  return (
    <div className="pair">
      <p className="soft">For Alexa, add Lumina as a connector with this address and key.</p>
      {devices && [["Address", devices.mcpUrl], ["Key", devices.key]].map(([label, value]) => (
        <div key={label} className="copy-row">
          <div><small>{label}</small><code>{value}</code></div>
          <button className="icon-btn ghost" aria-label={`Copy ${label.toLowerCase()}`} onClick={() => { navigator.clipboard?.writeText(value); setCopied(label); }}>
            <Icon name={copied === label ? "check" : "copy"} size={18} />
          </button>
        </div>
      ))}
    </div>
  );
}

export function Empty({ icon, title, children }: { icon: string; title: string; children: ReactNode }) {
  return (
    <div className="empty fade">
      <Icon name={icon} size={40} />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
