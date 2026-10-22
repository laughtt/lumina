import { useState, type ReactNode } from "react";
import { call, feedPath, slug, useLumina, type Feed, type Topic } from "./lumina";
import { AnswerEditor, Empty, Icon, Sheet, r } from "./ui";

const dot = (kind: string) => (kind === "escalation" || kind === "approval" ? "var(--rose)" : kind === "agent" || kind === "note" ? "var(--gold)" : "var(--aqua)");

export function Inbox() {
  const { feed, family, calls } = useLumina();
  if (!feed.length) return family ? <Empty icon="sun" title="Nothing yet today">When {calls} asks something new, or Lumina takes a step, it shows up here.</Empty> : null;
  const open = feed.filter(isOpen), rest = feed.filter((f) => !isOpen(f));
  return (
    <div className="stack">
      {open.length > 0 && <Section title="Needs you" count={open.length}>{open.map((item, i) => <FeedRow key={item.id} item={item} i={i} open />)}</Section>}
      {rest.length > 0 && <Section title={open.length ? "Earlier" : "Today"}>{rest.map((item, i) => <FeedRow key={item.id} item={item} i={i + open.length} />)}</Section>}
    </div>
  );
}

const isOpen = (f: Feed) => (f.actions === "rate" && !f.rating) || (f.actions === "decide" && !f.decision);

function Section({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <section className="sec">
      <h2>{title}{count ? <span className="count">{count}</span> : null}</h2>
      <div className="feed">{children}</div>
    </section>
  );
}

function FeedRow({ item, i, open }: { item: Feed; i: number; open?: boolean }) {
  const { send, time, media } = useLumina();
  const path = feedPath(item.id);
  return (
    <article className={`feed-row rise${open ? " open" : ""}`} style={{ ...r(Math.min(i, 8)), borderLeftColor: open ? dot(item.kind) : undefined }}>
      <div className="feed-meta"><i style={{ background: dot(item.kind) }} /><span className="caps">{time(item.at)}</span></div>
      <h3>{item.title}</h3>
      {item.memory && <div className="feed-photo">{media(`/media/${item.memory}`) && <img src={media(`/media/${item.memory}`)} alt="" onError={(e) => (e.currentTarget.parentElement!.style.display = "none")} />}</div>}
      {item.body && <p className="soft">{item.body}</p>}
      {item.result && <p className="aqua">{item.result}</p>}
      {item.why && <details><summary>Why?</summary><p>{item.why}</p></details>}
      {item.actions === "rate" && (
        <div className="row">
          {(["up", "down"] as const).map((v) => (
            <button key={v} className={`icon-btn ghost${item.rating === v ? " picked" : ""}`} aria-label={v === "up" ? "Useful" : "Not useful"} aria-pressed={item.rating === v}
              onClick={() => send(`${path}/rate`, { rating: v })}><Icon name={v} size={20} /></button>
          ))}
        </div>
      )}
      {item.actions === "decide" && (item.decision ? (
        <p className="soft small">{item.decision === "approve" ? "You approved this." : "You said not now."}</p>
      ) : (
        <div className="row">
          <button className="btn small" onClick={() => send(`${path}/decide`, { decision: "approve" })}>Approve</button>
          <button className="btn small ghost" onClick={() => send(`${path}/decide`, { decision: "deny" })}>Not now</button>
        </div>
      ))}
    </article>
  );
}

const blankTopic: Topic = { id: "", question: "", phrasings: [], answer: null };

export function Questions() {
  const { topics, calls } = useLumina();
  const [editing, setEditing] = useState<Topic | null>(null);
  const todo = topics.filter((t) => !t.answer), done = topics.filter((t) => t.answer);
  return (
    <div className="stack">
      {todo.length > 0 && <section className="sec"><h2>Needs an answer<span className="count">{todo.length}</span></h2>{todo.map((t, i) => <QuestionRow key={t.id} topic={t} i={i} edit={() => setEditing(t)} />)}</section>}
      {done.length > 0 && <section className="sec"><h2>Answered</h2>{done.map((t, i) => <QuestionRow key={t.id} topic={t} i={i + todo.length} edit={() => setEditing(t)} />)}</section>}
      <p className="soft small">Answer once. {calls} can ask as often as needed, and always hears your words.</p>
      <button className="add-someone" onClick={() => setEditing(blankTopic)}><Icon name="plus" size={18} /> Add a question</button>
      {editing && <TopicEditor topic={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function QuestionRow({ topic, i, edit }: { topic: Topic; i: number; edit: () => void }) {
  const { calls, me } = useLumina();
  const [answering, setAnswering] = useState(false);
  return (
    <div className="card question rise" style={r(i)}>
      <div className="question-head">
        <h3>{topic.question}</h3>
        {topic.pin && <span className="soft" title="On the TV" aria-label="On the TV"><Icon name="tv" size={18} /></span>}
        <button className="link" onClick={edit}>Edit</button>
      </div>

      {answering ? (
        <AnswerEditor topic={topic.id} text={topic.answer?.text ?? ""} saved={() => setAnswering(false)} />
      ) : (
        <>
          <div className={`hears${topic.answer ? "" : " none"}`}>
            <span className="caps">{calls} hears</span>
            <p>{topic.answer ? topic.answer.rosa_text : `“I'm not sure, I'll let ${me?.account.name ?? "family"} know.”`}</p>
          </div>
          {topic.phrasings.length > 0 && <p className="soft small"><span className="caps">Also asked as</span> {topic.phrasings.map((p) => `“${p}”`).join(" · ")}</p>}
          <button className={topic.answer ? "link" : "btn small"} onClick={() => setAnswering(true)}>{topic.answer ? "Change answer" : "Answer it"}</button>
        </>
      )}
    </div>
  );
}

export function TopicEditor({ topic, onClose, saved }: { topic: Topic; onClose: () => void; saved?: () => void }) {
  const { calls, send, refresh } = useLumina();
  const [question, setQuestion] = useState(topic.question);
  const [ways, setWays] = useState(topic.phrasings.join("\n"));

  async function save() {
    const phrasings = ways.split("\n").map((w) => w.trim()).filter(Boolean);
    await send(`/api/topics/${topic.id || slug(question)}`, { question: question.trim(), phrasings, pin: topic.pin }, "PUT");
    saved?.();
    onClose();
  }

  return (
    <Sheet title={topic.id ? "Edit question" : "New question"} onClose={onClose}>
      <label className="field"><span className="caps">The question</span>
        <input className="box" value={question} placeholder="e.g. Where's my cat?" onChange={(e) => setQuestion(e.target.value)} />
      </label>
      <label className="field"><span className="caps">Ways {calls} says it</span>
        <textarea className="box" rows={4} value={ways} placeholder="One per line" onChange={(e) => setWays(e.target.value)} />
        <span className="soft small">Lumina and Alexa listen for these too.</span>
      </label>
      <div className="row">
        <button className="btn" disabled={!slug(question)} onClick={save}>Save</button>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
      </div>
      {topic.id && (
        <button className="link danger" onClick={async () => { await call(`/api/topics/${topic.id}`, undefined, "DELETE").catch(() => {}); await refresh(); onClose(); }}>
          Delete this question
        </button>
      )}
    </Sheet>
  );
}
