import { useEffect, useState } from "react";
import { call, useLumina, type Ai } from "./lumina";
import { AlexaKey, Caps, Icon, PairTV, Switch, r } from "./ui";

type Fact = { id: string; kind: string; text: string };

const switches: [keyof Ai, string, string, string][] = [
  ["notify", "bell", "Notify me", "When something needs you"],
  ["tv", "tv", "Act on the TV by itself", "Off: Lumina asks you first"],
  ["memories", "photo", "Show memories by itself", "A slideshow at 10 am and 4 pm"],
  ["learn", "bubble", "Learn new ways of asking", "New words, same answer"],
  ["analysis", "moon", "Evening analysis", "A short note each night"],
];

export function About() {
  const { family, calls, send } = useLumina();
  const [facts, setFacts] = useState<Fact[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { call<{ facts: Fact[] }>("/api/about").then((a) => setFacts(a.facts), () => {}); }, []);

  const kinds: Record<string, string> = { routine: "Routine", likes: "Likes", calms: `What calms ${calls}`, upsets: `What upsets ${calls}`, people: "People", health: "Health", other: "Other" };

  async function tell() {
    setBusy(true);
    try {
      const added = await call<{ facts: Fact[] }>("/api/about", { text });
      setFacts([...facts, ...added.facts]);
      setText("");
    } catch {}
    setBusy(false);
  }

  function forget(id: string) {
    setFacts(facts.filter((f) => f.id !== id));
    call(`/api/about/${id}`, undefined, "DELETE").catch(() => {});
  }

  return (
    <div className="about">
      {family?.ai && (
        <section className="stack rise" style={r(0)}>
          <Caps>Lumina AI</Caps>
          <div className="group">
            {switches.map(([key, icon, title, detail]) => (
              <label key={key} className="setting">
                <span className="setting-icon"><Icon name={icon} size={20} /></span>
                <span className="setting-text"><b>{title}</b><small>{detail}</small></span>
                <Switch label={title} on={family.ai![key]} onChange={(on) => send("/api/ai", { ...family.ai, [key]: on }, "PUT")} />
              </label>
            ))}
          </div>
        </section>
      )}

      {family && family.playbook.length > 0 && (
        <section className="stack rise" style={r(1)}>
          <Caps>TV steps Lumina can take</Caps>
          <div className="group">
            {family.playbook.map((step) => (
              <label key={step.id} className="setting">
                <span className="setting-text"><b>{step.label}</b></span>
                <Switch label={step.label} on={step.enabled} onChange={(enabled) => send(`/api/playbook/${step.id}`, { enabled }, "PUT")} />
              </label>
            ))}
          </div>
          <p className="soft small">Lumina only picks steps that are on. Calling family always waits for your OK.</p>
        </section>
      )}

      <section className="stack rise" style={r(2)}>
        <Caps>What Lumina knows about {calls}</Caps>
        <div className="group">
          <div className="tell">
            <textarea rows={1} value={text} placeholder={`Habits, likes, what calms ${calls}…`} onChange={(e) => setText(e.target.value)} />
            <button className="btn small" disabled={busy || !text.trim()} onClick={tell}>{busy ? "…" : "Add"}</button>
          </div>
          {facts.map((fact) => (
            <div key={fact.id} className="fact fade">
              <div><Caps>{kinds[fact.kind] ?? fact.kind}</Caps><p>{fact.text}</p></div>
              <button className="icon-btn" aria-label="Forget this" onClick={() => forget(fact.id)}><Icon name="x" size={18} /></button>
            </div>
          ))}
        </div>
      </section>

      {family && family.reminders.length > 0 && (
        <section className="stack rise" style={r(3)}>
          <Caps>Reminders</Caps>
          <div className="group">
            {family.reminders.map((rem) => (
              <div key={rem.id} className="setting">
                <span className="setting-text"><b>{rem.label.charAt(0).toUpperCase() + rem.label.slice(1)}, {rem.time}</b></span>
                <span className={rem.doneToday ? "aqua" : "soft"}>{rem.doneToday ? "Done" : "Not yet"}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="stack rise" style={r(4)}>
        <Caps>TV and Alexa</Caps>
        <div className="group padded"><PairTV /><hr /><AlexaKey /></div>
      </section>
    </div>
  );
}
