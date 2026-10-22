import { useEffect, useState } from "react";
import { api, media } from "./api";

type Feed = {
  id: string; at: string; kind: string; title: string; body?: string; why?: string; result?: string; ref?: string;
  actions?: "rate" | "decide"; rating?: "up" | "down"; decision?: "approve" | "deny";
};
type Tab = "inbox" | "answers" | "rosa" | "memories";

export function usePoll<T>(path: string, ms = 2000) {
  const [data, setData] = useState<T | null>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    let alive = true;
    const go = () => api<T>(path).then((d) => alive && setData(d)).catch(() => {});
    go();
    const id = setInterval(go, ms);
    return () => { alive = false; clearInterval(id); };
  }, [path, n]);
  return [data, () => setN((x) => x + 1)] as const;
}

export function Phone() {
  const [tab, setTab] = useState<Tab>((new URLSearchParams(location.search).get("tab") as Tab) ?? "inbox");
  const [family, refreshFamily] = usePoll<any>("/api/family");
  const [feed, refreshFeed] = usePoll<Feed[]>("/api/phone/feed");
  const open = (feed ?? []).filter((f) => (f.actions === "rate" && !f.rating) || (f.actions === "decide" && !f.decision)).length;
  const refresh = () => { refreshFamily(); refreshFeed(); };
  useEffect(() => {
    const go = (e: Event) => setTab((e as CustomEvent).detail);
    window.addEventListener("lumina:phone", go);
    return () => window.removeEventListener("lumina:phone", go);
  }, []);

  return (
    <div className="phone">
      <div className="phone-status"><span>{family?.clock ? `${family.clock.time} ${family.clock.ampm}` : ""}</span><span>Lumina</span></div>
      <header className="phone-head">
        <h1>Hi Ana</h1>
        <p>{family ? `Mom is home. ${family.answers?.where_is_ana ? "She hears: “" + family.answers.where_is_ana.tv_line + "”" : ""}` : "Connecting…"}</p>
      </header>
      <main className="phone-body">
        {tab === "inbox" && <Inbox feed={feed ?? []} family={family} onChange={refresh} />}
        {tab === "answers" && family && <Answers family={family} onChange={refresh} />}
        {tab === "rosa" && family && <Rosa family={family} onChange={refresh} />}
        {tab === "memories" && family && <Memories family={family} onChange={refresh} />}
      </main>
      <nav className="phone-tabs" aria-label="Sections">
        {([["inbox", "Inbox"], ["answers", "Answers"], ["rosa", "Mom"], ["memories", "Memories"]] as const).map(([id, label]) => (
          <button key={id} aria-current={tab === id} onClick={() => setTab(id)}>
            {label}{id === "inbox" && open > 0 && <i>{open}</i>}
          </button>
        ))}
      </nav>
    </div>
  );
}

function Inbox({ feed, family, onChange }: { feed: Feed[]; family: any; onChange: () => void }) {
  const [why, setWhy] = useState<string | null>(null);
  const rate = async (f: Feed, rating: "up" | "down") => { await api(`/api/phone/feed/${encodeURIComponent(f.id)}/rate`, { rating }); onChange(); };
  const decide = async (f: Feed, decision: "approve" | "deny") => { await api(`/api/phone/feed/${encodeURIComponent(f.id)}/decide`, { decision }); onChange(); };
  if (!feed.length) return <p className="empty">Nothing yet today. When Mom asks something new, or Lumina takes a step, it shows up here.</p>;
  return (
    <ul className="feed">
      {feed.map((f) => {
        const step = family?.agent?.steps?.find((s: any) => s.ref === f.ref);
        return (
          <li key={f.id} className={`item item-${f.kind}`}>
            <time>{new Date(f.at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: family?.profile?.tz }).toLowerCase()}</time>
            <h3>{f.title}</h3>
            {f.body && <p className={f.kind === "note" ? "note" : ""}>{f.body}</p>}
            {f.result && <p className="result">{f.result}</p>}
            {f.why && (
              <button className="link" onClick={() => setWhy(why === f.id ? null : f.id)}>{why === f.id ? "Hide why" : "Why?"}</button>
            )}
            {why === f.id && (
              <div className="why">
                <p>{f.why}</p>
                {step?.chain && <pre aria-label="ActiveGraph causal chain">{step.chain.join("\n")}</pre>}
              </div>
            )}
            {f.actions === "rate" && (
              <div className="rate" role="group" aria-label="Was this useful?">
                <button aria-pressed={f.rating === "up"} onClick={() => rate(f, "up")} aria-label="Useful">👍</button>
                <button aria-pressed={f.rating === "down"} onClick={() => rate(f, "down")} aria-label="Not useful">👎</button>
              </div>
            )}
            {f.actions === "decide" && (f.decision
              ? <p className="decided">{f.decision === "approve" ? "You approved this." : "You said not now."}</p>
              : <div className="decide"><button className="primary" onClick={() => decide(f, "approve")}>Approve</button><button onClick={() => decide(f, "deny")}>Not now</button></div>)}
          </li>
        );
      })}
    </ul>
  );
}

function Answers({ family, onChange }: { family: any; onChange: () => void }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [check, setCheck] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const run = async (topic: string) => { setBusy(true); setCheck(await api("/api/answers/check", { topic, text }).finally(() => setBusy(false))); };
  const approve = async (topic: string, rosa_text: string) => {
    await api(`/api/answers/${topic}`, { text, rosa_text, tv_line: check.tv_line }, "PUT");
    setEditing(null); setCheck(null); onChange();
  };
  return (
    <div className="answers">
      <p className="lead">Answer once. Mom can ask as often as she needs, and she always hears these words.</p>
      {Object.entries(family.topics as Record<string, string>).map(([topic, question]) => {
        const a = family.answers[topic];
        return (
          <section key={topic} className="answer">
            <h3>“{question.split(" / ")[0]}”</h3>
            {editing === topic ? (
              <>
                <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="e.g. At work, home at 6" autoFocus />
                {!check && <button className="primary" disabled={busy || !text.trim()} onClick={() => run(topic)}>{busy ? "Lumina is reading it…" : "Check with Lumina"}</button>}
                {check && (
                  <div className="check">
                    <p className="hears">Mom hears: “{check.rosa_text}”</p>
                    <p className="tvline">TV shows: {check.tv_line}</p>
                    {check.issues.map((i: string) => <p key={i} className="issue">{i}</p>)}
                    {check.suggestion && <p className="hears">Suggested: “{check.suggestion}”</p>}
                    <div className="decide">
                      <button className="primary" onClick={() => approve(topic, check.rosa_text)}>Approve</button>
                      {check.suggestion && <button onClick={() => approve(topic, check.suggestion)}>Use suggestion</button>}
                      <button onClick={() => setCheck(null)}>Edit</button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                <p className="hears">{a ? `“${a.rosa_text}”` : "No answer yet. Mom hears: “I'm not sure, I'll let Ana know.”"}</p>
                <button className="link" onClick={() => { setEditing(topic); setText(a?.text ?? ""); setCheck(null); }}>Change</button>
              </>
            )}
          </section>
        );
      })}
    </div>
  );
}

function Rosa({ family, onChange }: { family: any; onChange: () => void }) {
  const agent = family.agent;
  const toggle = async (id: string, enabled: boolean) => { await api(`/api/playbook/${id}`, { enabled }, "PUT"); onChange(); };
  const stats = (k: string) => agent?.playbook?.find((p: any) => p.key === k);
  return (
    <div className="rosa">
      <section>
        <h3>“Where's Ana?” today, against her usual</h3>
        {agent?.rhythm ? <Rhythm rows={agent.rhythm} now={family.clock.hour} /> : <p className="muted">Lumina hasn't looked at Mom's day yet.</p>}
        <p className="muted small">Lumina compares Mom only with herself: her last 14 days, hour by hour.</p>
      </section>
      {family.note && (
        <section className="note-card">
          <h3>Evening note</h3>
          <p className="note">{family.note.text}</p>
        </section>
      )}
      <section>
        <h3>Your playbook</h3>
        <p className="muted small">Lumina only picks steps you turn on. Steps that contact family wait for your OK.</p>
        <ul className="playbook">
          {family.playbook.map((p: any) => {
            const st = stats(p.id);
            return (
              <li key={p.id}>
                <label>
                  <input type="checkbox" checked={p.enabled} onChange={(e) => toggle(p.id, e.target.checked)} />
                  <span>{p.label}</span>
                </label>
                {st && (st.tries > 0 || st.thumbs_up > 0 || st.thumbs_down > 0) && (
                  <small>Seemed to help {st.wins} of {st.tries} times. You rated it 👍 {st.thumbs_up}, 👎 {st.thumbs_down}.</small>
                )}
              </li>
            );
          })}
        </ul>
      </section>
      <section>
        <h3>Reminders</h3>
        <ul className="reminders">
          {family.reminders.map((r: any) => <li key={r.id}><span>{r.label}, {r.time}</span><span>{r.doneToday ? `Done ${r.doneAt}` : "Not yet"}</span></li>)}
        </ul>
      </section>
      {agent?.lastRun && <p className="muted small">Lumina last looked at {agent.lastRun.time} {agent.lastRun.ampm}. Mom's log holds {agent.events.toLocaleString()} events.</p>}
    </div>
  );
}

function Rhythm({ rows, now }: { rows: { hour: number; usual: number; high: number; today: number }[]; now: number }) {
  const max = Math.max(4, ...rows.map((r) => Math.max(r.high, r.today)));
  const w = 340, h = 120, bw = w / rows.length;
  const y = (v: number) => h - (v / max) * (h - 8);
  return (
    <svg viewBox={`0 0 ${w} ${h + 18}`} className="rhythm" role="img" aria-label="Asks per hour today compared with her usual range">
      {rows.map((r, i) => (
        <g key={r.hour}>
          <rect x={i * bw + 3} y={y(r.high)} width={bw - 6} height={h - y(r.high)} className="band" rx="3" />
          {r.today > 0 && <rect x={i * bw + bw / 2 - 4} y={y(r.today)} width="8" height={h - y(r.today)} className={r.today > r.high ? "over" : "bar"} rx="2" />}
          {r.hour % 3 === 0 && <text x={i * bw + bw / 2} y={h + 14}>{r.hour > 12 ? r.hour - 12 : r.hour}{r.hour >= 12 ? "p" : "a"}</text>}
          {r.hour === now && <line x1={i * bw + bw / 2} x2={i * bw + bw / 2} y1="0" y2={h} className="now" />}
        </g>
      ))}
    </svg>
  );
}

function Memories({ family, onChange }: { family: any; onChange: () => void }) {
  const [image, setImage] = useState<{ data: string; mediaType: string; preview: string } | null>(null);
  const [line, setLine] = useState("");
  const [draft, setDraft] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const pick = async (file: File) => setImage(await shrink(file));
  const makeDraft = async () => { setBusy(true); setDraft(await api("/api/memories/draft", { line, image }).finally(() => setBusy(false))); };
  const save = async () => {
    await api("/api/memories", { ...draft, image });
    setImage(null); setLine(""); setDraft(null); onChange();
  };
  return (
    <div className="memories">
      <ul className="thumbs">
        {family.memories.map((m: any) => (
          <li key={m.id}><img src={media(m.url)} alt="" /><span>{m.title}</span></li>
        ))}
      </ul>
      <section className="add">
        <h3>Add a memory</h3>
        <label className="file">
          <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && pick(e.target.files[0])} />
          {image ? <img src={image.preview} alt="Selected photo" /> : <span>Choose an old photo</span>}
        </label>
        <input value={line} onChange={(e) => setLine(e.target.value)} placeholder="One line, e.g. Dad's 40th, Porto, 1984" />
        {!draft && <button className="primary" disabled={!image || !line.trim() || busy} onClick={makeDraft}>{busy ? "Lumina is looking…" : "Draft the card"}</button>}
        {draft && (
          <div className="check">
            <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} aria-label="Title" />
            <textarea value={draft.caption} onChange={(e) => setDraft({ ...draft, caption: e.target.value })} rows={2} aria-label="Caption" />
            <textarea value={draft.story} onChange={(e) => setDraft({ ...draft, story: e.target.value })} rows={3} aria-label="Story Lumina tells" />
            <p className="muted small">Mom can find it by saying: {draft.tags.join(", ")}</p>
            <button className="primary" onClick={save}>Add to Mom's TV</button>
          </div>
        )}
      </section>
    </div>
  );
}

function shrink(file: File): Promise<{ data: string; mediaType: string; preview: string }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 1024 / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      const url = c.toDataURL("image/jpeg", 0.8);
      resolve({ data: url.split(",")[1], mediaType: "image/jpeg", preview: url });
    };
    img.src = URL.createObjectURL(file);
  });
}
