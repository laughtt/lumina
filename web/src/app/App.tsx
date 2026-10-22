import { useEffect, useState } from "react";
import { auth, call, Ctx, read, store, useLumina, type Family, type Feed, type Lumina, type Me, type Patterns, type Topic } from "./lumina";
import { Onboarding } from "./Onboarding";
import { Inbox, Questions } from "./Inbox";
import { PatternsView } from "./Patterns";
import { About } from "./About";
import { Memories, MemoriesMenu } from "./Memories";
import { Icon, Sheet, r } from "./ui";
import "./app.css";

export function App() {
  const [session, setSession] = useState(auth.session);
  const [personId, setPersonId] = useState(auth.person);
  const [me, setMe] = useState<Me | null>(null);
  const [family, setFamily] = useState<Family | null>(null);
  const [feed, setFeed] = useState<Feed[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [patterns, setPatterns] = useState<Patterns | null>(null);
  const [key, setKey] = useState("");
  const [adding, setAdding] = useState(false);
  const [offline, setOffline] = useState(false);

  function show(id: string) {
    setFamily(null); setFeed([]); setTopics([]); setPatterns(null); setKey("");
    auth.person = id;
    store("lumina-person", id);
    setPersonId(id);
  }

  function signOut() {
    auth.session = "";
    store("lumina-session", "");
    store("lumina-onb", "");
    setSession(""); setMe(null); setAdding(false);
    show("");
  }

  async function loadMe() {
    try {
      const m = await call<Me>("/api/me");
      setMe(m);
      setOffline(false);
      const id = m.people.length === 1 && m.account.scope !== "many" ? m.people[0].id : m.people.some((p) => p.id === auth.person) ? auth.person : "";
      if (id !== auth.person) show(id);
      return m;
    } catch {
      setOffline(true);
    }
  }

  async function signIn(body: object) {
    const s = await call<{ session: string }>("/api/auth/guest", body);
    auth.session = s.session;
    store("lumina-session", s.session);
    const m = await loadMe();
    if (!m) throw new Error("offline");
    setSession(s.session);
    return m;
  }

  async function refresh() {
    const id = auth.person;
    const [f, items, t, p] = await Promise.all(
      [call<Family>("/api/family"), call<Feed[]>("/api/phone/feed"), call<Topic[]>("/api/topics"), call<Patterns>("/api/patterns")].map((x) => x.catch(() => null)),
    ) as [Family | null, Feed[] | null, Topic[] | null, Patterns | null];
    if (id !== auth.person) return;
    if (f) setFamily(f);
    if (items) setFeed(items);
    if (t) setTopics(t);
    if (p) setPatterns(p);
    setOffline(!f);
  }

  async function send(path: string, body: unknown, method = "POST") {
    await call(path, body, method).catch(() => {});
    await refresh();
  }

  useEffect(() => { if (session) loadMe(); }, [session]);
  useEffect(() => {
    window.addEventListener("lumina:signout", signOut);
    return () => window.removeEventListener("lumina:signout", signOut);
  }, []);

  const person = me?.people.find((p) => p.id === personId);
  const value: Lumina = {
    me, person, calls: person?.calls ?? person?.name ?? "Mom", family, feed, topics, patterns, key, offline,
    refresh, send, show, loadMe, signIn, signOut, setAdding, setKey,
    media: (url) => (key ? `${url}?t=${key}` : undefined),
    time: (iso) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", timeZone: family?.profile?.tz }),
  };

  return (
    <Ctx.Provider value={value}>
      <div className="lumina-app">
        {!session || me?.account.onboarded === false ? <Onboarding /> : !me ? <Waiting /> : !personId ? <People /> : <Home key={personId} />}
        {adding && <div className="cover"><Onboarding adding /></div>}
      </div>
    </Ctx.Provider>
  );
}

const tabs = [["inbox", "Updates", "bell"], ["questions", "Questions", "quote"], ["patterns", "Patterns", "chart"], ["about", "About", "heart"], ["memories", "Memories", "photos"]] as const;

function Home() {
  const lumina = useLumina();
  const [tab, setTab] = useState(() => read("lumina-tab") || "inbox");
  const [settings, setSettings] = useState(false);
  const open = lumina.feed.filter((i) => (i.actions === "rate" && !i.rating) || (i.actions === "decide" && !i.decision)).length;
  const many = (lumina.me?.people.length ?? 0) > 1 || lumina.me?.account.scope === "many";

  useEffect(() => {
    call("/api/person/devices").then((d) => lumina.setKey(d.key), () => {});
    lumina.refresh();
    const id = setInterval(() => document.hidden || lumina.refresh(), 4000);
    return () => clearInterval(id);
  }, []);

  function pick(id: string) {
    setTab(id);
    store("lumina-tab", id);
    window.scrollTo(0, 0);
  }

  const label = tabs.find((t) => t[0] === tab)?.[1] ?? "Updates";
  return (
    <div className="home">
      <header className="top">
        <div className="top-row">
          {many && <button className="icon-btn" aria-label="People" onClick={() => lumina.show("")}><Icon name="people" /></button>}
          {tab === "memories" && <MemoriesMenu />}
          <button className="icon-btn end" aria-label="Settings" onClick={() => setSettings(true)}><Icon name="gear" /></button>
        </div>
        <h1 key={tab} className="title serif fade">{tab === "about" ? `About ${lumina.calls}` : label}</h1>
      </header>
      <main key={tab} className="tab-page">
        {tab === "inbox" && <Inbox />}
        {tab === "questions" && <Questions />}
        {tab === "patterns" && <PatternsView />}
        {tab === "about" && <About />}
        {tab === "memories" && <Memories />}
      </main>
      {lumina.offline && <div className="offline">Can't reach Lumina. Check your internet connection.</div>}
      <nav className="tabbar" aria-label="Sections">
        {tabs.map(([id, name, icon]) => (
          <button key={id} aria-current={tab === id ? "page" : undefined} onClick={() => pick(id)}>
            <span className="tab-icon"><Icon name={icon} size={24} />{id === "inbox" && open > 0 && <i>{open}</i>}</span>
            {name}
          </button>
        ))}
      </nav>
      {settings && <Settings onClose={() => setSettings(false)} />}
    </div>
  );
}

function People() {
  const { me, show, setAdding } = useLumina();
  const [settings, setSettings] = useState(false);
  return (
    <div className="home">
      <header className="top">
        <div className="top-row"><button className="icon-btn end" aria-label="Settings" onClick={() => setSettings(true)}><Icon name="gear" /></button></div>
        <h1 className="title serif fade">The people you care for</h1>
      </header>
      <main className="tab-page stack">
        {me?.people.map((p, i) => (
          <button key={p.id} className="person-card rise" style={r(i)} onClick={() => show(p.id)}>
            <span className="avatar">{p.name.slice(0, 1)}</span>
            <span className="person-text">
              <b>{p.name}</b>
              <span>{[p.calls, p.age, p.condition].filter(Boolean).join(" · ")}</span>
              <small>{p.asksToday ?? 0} asks today{(p.open ?? 0) > 0 && <em> · {p.open} waiting for you</em>}</small>
            </span>
            <Icon name="next" size={18} />
          </button>
        ))}
        <button className="add-someone rise" style={r(me?.people.length ?? 0)} onClick={() => setAdding(true)}><Icon name="plus" size={18} /> Add someone</button>
      </main>
      {settings && <Settings onClose={() => setSettings(false)} />}
    </div>
  );
}

function Settings({ onClose }: { onClose: () => void }) {
  const { me, setAdding, signOut } = useLumina();
  return (
    <Sheet title="Settings" onClose={onClose}>
      <div className="list">
        {me?.account.onboarded && <button onClick={() => { onClose(); setAdding(true); }}><Icon name="plus" size={18} /> Add someone</button>}
        <button className="danger" onClick={signOut}>Sign out</button>
      </div>
      {me?.account.name && <p className="soft small">Signed in as {me.account.name}.</p>}
    </Sheet>
  );
}

function Waiting() {
  const { offline, loadMe, signOut } = useLumina();
  return (
    <div className="waiting">
      {offline ? (
        <div className="empty fade">
          <h3>Can't reach Lumina</h3>
          <p>Check your internet connection, then try again.</p>
          <button className="btn" onClick={loadMe}>Try again</button>
          <button className="btn text" onClick={signOut}>Sign out</button>
        </div>
      ) : <span className="spinner dark" />}
    </div>
  );
}
