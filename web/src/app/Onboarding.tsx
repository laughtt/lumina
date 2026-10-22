import { useEffect, useState, type ReactNode } from "react";
import { auth, call, read, slug, store, useLumina, type Topic } from "./lumina";
import { AlexaKey, AnswerEditor, Caps, Card, Choice, Field, Icon, PairTV, ProgressLine, Tile, r } from "./ui";

type State = { step: number; role: string; scope: string; name: string; calls: string; age: string; condition: string; you: string; firetv: boolean; alexa: boolean };
type Suggestion = { id?: string; question: string; phrasings: string[] };

const blank: State = { step: 0, role: "", scope: "", name: "", calls: "", age: "", condition: "Early Alzheimer's", you: "", firetv: false, alexa: false };
const conditions = ["Early Alzheimer's", "Middle-stage Alzheimer's", "Other dementia", "Memory loss", "Other"];
const sections: Record<number, string> = { 1: "About you", 2: "About you", 4: "At home", 5: "Questions", 6: "Answers", 7: "Devices", 8: "Ready" };

export function Onboarding({ adding = false }: { adding?: boolean }) {
  const lumina = useLumina();
  const [f, setF] = useState<State>(() => {
    const saved = { ...blank, ...JSON.parse(read("lumina-onb") || "{}") };
    return adding ? { ...saved, step: 3, name: "", calls: "", age: "", firetv: false, alexa: false } : saved;
  });
  const [forward, setForward] = useState(true);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [picked, setPicked] = useState<Suggestion[]>([]);
  const [custom, setCustom] = useState<Suggestion[]>([]);
  const [newQuestion, setNewQuestion] = useState("");
  const [newWays, setNewWays] = useState("");
  const [card, setCard] = useState(0);
  useEffect(() => store("lumina-onb", JSON.stringify(f)), [f]);

  const set = (patch: Partial<State>) => setF((x) => ({ ...x, ...patch }));
  const first = adding ? 3 : 1;
  const step = auth.session ? Math.max(f.step, first) : 0;
  const them = f.calls || f.name || "them";
  const topics = lumina.topics;
  const canGoBack = ![1, 5, 8].includes(step) && !(adding && step === first);

  function go(n: number) {
    setForward(n > step);
    setProblem("");
    set({ step: n });
  }

  async function run(action: () => Promise<void>, fail: string) {
    setBusy(true);
    try { await action(); } catch { setProblem(fail); }
    setBusy(false);
  }

  const saveMe = (body: object, next: number) => run(async () => { await call("/api/me", body, "PUT"); go(next); }, "Couldn't reach Lumina. Try again.");

  const createPerson = () => run(async () => {
    const devices = [...(f.firetv ? ["firetv"] : []), ...(f.alexa ? ["alexa"] : [])];
    const { id } = await call("/api/people", { name: f.name, calls: f.calls || f.name, age: Number(f.age) || undefined, condition: f.condition, caregiver: f.you, devices, demo: true });
    lumina.show(id);
    await lumina.loadMe();
    go(5);
  }, "Couldn't reach Lumina. Try again.");

  const saveTopics = () => run(async () => {
    for (const [i, s] of picked.entries()) await call(`/api/topics/${s.id ?? slug(s.question)}`, { question: s.question, phrasings: s.phrasings, pin: i < 2 }, "PUT");
    await lumina.refresh();
    go(6);
  }, "Couldn't save the questions. Try again.");

  async function finish() {
    if (adding) lumina.setAdding(false);
    else await call("/api/me", { onboarded: true }, "PUT").catch(() => {});
    set({ step: 0 });
    await lumina.loadMe();
  }

  useEffect(() => {
    if (step === 6) call<Topic[]>("/api/topics").then((t) => { const i = t.findIndex((x) => !x.answer); setCard(i < 0 ? t.length : i); }, () => {});
    if (step >= 6) lumina.refresh();
  }, [step]);

  const spec: [string, boolean, () => void] =
    step === 1 ? ["Continue", !!f.role, () => saveMe({ role: f.role }, 2)]
    : step === 2 ? ["Continue", !!f.scope, () => saveMe({ scope: f.scope }, 3)]
    : step === 3 ? ["Continue", !!f.name.trim() && !!f.you.trim(), () => saveMe({ name: f.you }, 4)]
    : step === 4 ? [f.firetv || f.alexa ? "Continue" : "Skip for now", true, createPerson]
    : step === 5 ? [picked.length ? `Continue with ${picked.length}` : "Pick at least one", picked.length > 0, saveTopics]
    : step === 6 ? [card < topics.length ? "Skip this one" : "Continue", true, () => (card < topics.length ? setCard(card + 1) : go(7))]
    : step === 7 ? ["Continue", true, () => go(8)]
    : [adding ? `Go to ${them}` : "Open Lumina", true, () => run(finish, "")];

  if (step === 0) return <Welcome />;

  const you = f.you || "Ana";
  const suggestions: Suggestion[] = [
    { id: "where_is_ana", question: `Where's ${you}?`, phrasings: [`Where is ${you}?`, `Where did ${you} go?`, `Is ${you} at work?`] },
    { id: "meals", question: "When do I eat?", phrasings: ["Is it lunch time?", "Did I eat?", "When is dinner?"] },
    { id: "today", question: "What's happening today?", phrasings: ["What day is it?", "Is it Sunday?", "What's the date?"] },
    { id: "next", question: "What's next?", phrasings: ["What do I do now?", "What happens next?"] },
    { question: "Did I take my pills?", phrasings: ["Did I take my medicine?", "Do I need my pills?"] },
    { question: `When is ${you} coming?`, phrasings: [`Is ${you} coming today?`, `When will I see ${you}?`] },
    ...custom,
  ];
  const isPicked = (s: Suggestion) => picked.some((p) => p.question === s.question);
  const toggle = (s: Suggestion) => setPicked(isPicked(s) ? picked.filter((p) => p.question !== s.question) : [...picked, s]);

  const pages: Record<number, () => ReactNode> = {
    1: () => (
      <Form title="First, who are you?" subtitle="So Lumina can speak to you the right way.">
        <Choice style={r(3)} on={f.role === "family"} icon="house" title="I'm family" detail="Someone I love: a parent, a partner, a friend." onClick={() => set({ role: "family" })} />
        <Choice style={r(4)} on={f.role === "caregiver"} icon="case" title="I'm a caregiver" detail="Caring for people is my work." onClick={() => set({ role: "caregiver" })} />
      </Form>
    ),
    2: () => (
      <Form title="Who is this for?" subtitle="You can add more people later.">
        <Choice style={r(3)} on={f.scope === "one"} icon="person" title="Just one person" detail={f.role === "caregiver" ? "One client." : "Mom, Dad, or someone close."} onClick={() => set({ scope: "one" })} />
        <Choice style={r(4)} on={f.scope === "many"} icon="people" title="Several people" detail="I look after more than one person." onClick={() => set({ scope: "many" })} />
      </Form>
    ),
    3: () => (
      <Form title="Tell us about them" subtitle="Lumina uses these words when it talks with them.">
        <div className="rise stack" style={r(3)}>
          <Field label="Their name" hint="Rosa" value={f.name} onChange={(name) => set({ name })} />
          <Field label="What do you call them?" hint="Mom" value={f.calls} onChange={(calls) => set({ calls })} />
        </div>
        <div className="rise age" style={r(4)}>
          <div className="age-head"><Caps>Age</Caps><span className="serif">{f.age || "—"}</span></div>
          <input type="range" min={50} max={100} step={1} value={f.age || 75} aria-label="Age" onChange={(e) => set({ age: e.target.value })} />
          <div className="ticks">{[50, 60, 70, 80, 90, 100].map((n) => <span key={n}>{n}</span>)}</div>
        </div>
        <div className="rise stack" style={r(5)}>
          <Caps>Condition</Caps>
          <div className="tiles">{conditions.map((c) => <Tile key={c} on={f.condition === c} title={c} onClick={() => set({ condition: c })} />)}</div>
        </div>
        <div className="rise stack" style={r(6)}>
          <Field label="Your name" hint="Ana" value={f.you} onChange={(you) => set({ you })} />
          <p className="soft small">{them} will hear it, as in “Where's {you}?”</p>
        </div>
      </Form>
    ),
    4: () => (
      <Form title={`What does ${them} have at home?`} subtitle="Lumina answers through Alexa and keeps the answer on the TV.">
        <Choice style={r(3)} on={f.firetv} icon="tv" title="Fire TV" detail="The answer stays on screen, big and calm." onClick={() => set({ firetv: !f.firetv })} />
        <Choice style={r(4)} on={f.alexa} icon="speaker" title="Alexa" detail={`${them} asks out loud. Alexa answers in your words.`} onClick={() => set({ alexa: !f.alexa })} />
        <Choice style={r(5)} on={!f.firetv && !f.alexa} icon="clock" title="Not yet" detail="You can add them any time." onClick={() => set({ firetv: false, alexa: false })} />
      </Form>
    ),
    5: () => (
      <Form title={`What does ${them} ask again and again?`} subtitle="Pick the ones you hear most. You'll answer each one next.">
        {picked.length > 0 && (
          <>
            <Caps>Selected</Caps>
            <div className="chips">
              {picked.map((s) => (
                <button key={s.question} className="chip pop" onClick={() => toggle(s)}>{s.question}<Icon name="x" size={14} /></button>
              ))}
            </div>
            <hr />
          </>
        )}
        <div className="rise" style={r(3)}><Caps>Common questions</Caps></div>
        {suggestions.map((s, i) => (
          <Choice key={s.question} style={r(i * 0.6 + 3.5)} on={isPicked(s)} title={s.question} detail={s.phrasings.map((p) => `“${p}”`).join(" · ")} onClick={() => toggle(s)} />
        ))}
        <div className="stack top">
          <Caps>Something else they ask</Caps>
          <input className="box" value={newQuestion} placeholder="e.g. Where's my cat?" onChange={(e) => setNewQuestion(e.target.value)} />
          {newQuestion && (
            <>
              <input className="box fade" value={newWays} placeholder="Other ways they say it, with commas" onChange={(e) => setNewWays(e.target.value)} />
              <button className="btn small ghost fade" onClick={() => {
                const s = { question: newQuestion.trim(), phrasings: newWays.split(",").map((w) => w.trim()).filter(Boolean) };
                setCustom([...custom, s]); setPicked([...picked, s]); setNewQuestion(""); setNewWays("");
              }}><Icon name="plus" size={16} /> Add this question</button>
            </>
          )}
        </div>
      </Form>
    ),
    6: () => (
      <Form title="Answer once" subtitle={`Say it the way you would. ${them} hears these words every time.`}>
        <div className="rise" style={r(3)}>
          {card < topics.length ? (
            <div key={topics[card].id} className="card answer-card in-fwd">
              <Caps>Question {card + 1} of {topics.length}</Caps>
              <h3 className="serif">“{topics[card].question}”</h3>
              <AnswerEditor topic={topics[card].id} text={topics[card].answer?.text ?? ""} saved={() => setCard(card + 1)} />
            </div>
          ) : (
            <p className="ok big fade"><Icon name="check" /> {topics.length ? "All set. You can change any answer later, in Questions." : "No questions yet. You can add them later."}</p>
          )}
        </div>
        {topics.length > 1 && (
          <div className="dots">{topics.map((t, i) => <i key={t.id} className={i === card ? "on" : i < card ? "done" : ""} />)}</div>
        )}
      </Form>
    ),
    7: () => (
      <Form title={`Connect ${them}'s devices`} subtitle="Both can wait. You'll find them later, in About.">
        {f.firetv && <div className="rise" style={r(3)}><Card><Caps>Fire TV</Caps><PairTV /></Card></div>}
        {f.alexa && <div className="rise" style={r(4)}><Card><Caps>Alexa</Caps><AlexaKey /></Card></div>}
        {!f.firetv && !f.alexa && <p className="soft rise" style={r(3)}>No devices yet. When {them} has a Fire TV or Alexa, pair it from About.</p>}
      </Form>
    ),
    8: () => {
      const line = (topics.find((t) => t.pin && t.answer) ?? topics.find((t) => t.answer))?.answer?.tv_line;
      return (
        <div className="form done">
          <svg className="done-check" viewBox="0 0 104 104" aria-hidden>
            <circle cx="52" cy="52" r="48" className="track" />
            <circle cx="52" cy="52" r="48" className="ring" />
            <path d="M34 53l12 12 24-26" className="mark" />
          </svg>
          <h1 className="serif rise" style={r(2)}>You're all set</h1>
          <p className="soft rise" style={r(3)}>{line ? `${them}'s TV now shows` : `${them}'s TV is ready for your answers.`}</p>
          {line && <div className="tv-preview rise" style={r(4)}><i /><p className="serif">{line}</p></div>}
          <p className="soft small rise" style={r(5)}>When {them} asks, Lumina answers in your words. Each ask shows up in Patterns.</p>
        </div>
      );
    },
  };

  const [label, enabled, action] = spec;
  return (
    <div className={`onboarding${adding ? " adding" : ""}`}>
      <header className="onb-head">
        <div className="onb-row">
          {canGoBack && <button className="icon-btn fade" aria-label="Back" onClick={() => go(step - 1)}><Icon name="back" /></button>}
          <span key={step === 3 ? 3 : sections[step]} className="onb-section fade">{(step === 3 ? `About ${them}` : sections[step]).toUpperCase()}</span>
          {adding && <button className="icon-btn close" aria-label="Close" onClick={() => lumina.setAdding(false)}><Icon name="x" /></button>}
        </div>
        <ProgressLine value={(step - first + 1) / (9 - first)} />
      </header>
      <main key={step} className={`onb-page ${forward ? "in-fwd" : "in-back"}`}>{pages[step]()}</main>
      <footer className="onb-bar">
        {problem && <p className="error fade">{problem}</p>}
        <button className="btn wide" disabled={!enabled || busy} onClick={action}>{busy && <span className="spinner" />}{label}</button>
      </footer>
    </div>
  );
}

function Form({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="form">
      <h1 className="serif rise" style={r(1)}>{title}</h1>
      {subtitle && <p className="soft rise" style={r(2)}>{subtitle}</p>}
      <div className="form-body">{children}</div>
    </div>
  );
}

function Welcome() {
  const { signIn } = useLumina();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");

  async function go(body: object) {
    setBusy(true);
    setProblem("");
    try { await signIn(body); } catch { setProblem("Couldn't sign in. Check your internet connection and try again."); }
    setBusy(false);
  }

  return (
    <div className="welcome">
      <div className="welcome-mark">
        <div className="glow" />
        <img src="/emblem.png" alt="" width={200} height={200} />
      </div>
      <div className="wordmark rise" style={r(1)}>LUMINA</div>
      <div className="tagline rise" style={r(2)}>CARE · CONNECT · REMEMBER</div>
      <div className="welcome-actions rise" style={r(3)}>
        <button className="btn wide google" disabled={busy} onClick={() => go({})}><b>G</b>Continue with Google</button>
        <button className="btn wide text" disabled={busy} onClick={() => go({ demo: "1" })}>{busy ? <span className="spinner dark" /> : "Try the demo"}</button>
        {problem && <p className="error">{problem}</p>}
      </div>
    </div>
  );
}
