import { useEffect, useState, type ReactNode } from "react";
import { call, useLumina, type Patterns } from "./lumina";
import { Caps, Card, Empty, ProgressLine, r } from "./ui";
import { TopicEditor } from "./Inbox";

const hour = (h: number) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? "a" : "p"}`;
const span = (h: number) => `${hour(h)}–${hour((h + 1) % 24)}`;

function Section({ title, i, children }: { title: string; i: number; children: ReactNode }) {
  return <section className="stack rise" style={r(i)}><Caps>{title}</Caps><Card>{children}</Card></section>;
}

export function PatternsView() {
  const { patterns: p, calls, family, send } = useLumina();
  const [adding, setAdding] = useState<Patterns["unanswered"][number] | null>(null);
  if (!p) return <Empty icon="chart" title="No patterns yet">They show up here once {calls} starts asking.</Empty>;

  const byHour = Array.from({ length: 24 }, (_, h) => p.topics.reduce((n, t) => n + (t.byHour[h] ?? 0), 0));
  const most = Math.max(...byHour);
  const peak = byHour.indexOf(most);
  const top = Math.max(...p.topics.map((t) => t.week), 1);
  const now = family?.clock.hour;

  return (
    <div className="patterns">
      {p.learning && (
        <Card>
          <Caps>Learning day {p.learning.day} of {p.learning.of}</Caps>
          <p className="soft small">Lumina is learning {calls}'s rhythm. It compares them with no one else, only their own last 14 days.</p>
          <ProgressLine value={p.learning.day / p.learning.of} />
        </Card>
      )}

      <div className="rise" style={r(0)}>
        <div className="big-number serif">{Math.round(p.topics.reduce((n, t) => n + t.week, 0))}</div>
        <p className="soft">questions this week</p>
        <div className="stats">
          <div><b>{p.topics.reduce((n, t) => n + t.today, 0)}</b><span>today</span></div>
          <div><b>{most ? span(peak) : "—"}</b><span>busiest</span></div>
          <div><b>{p.unanswered.length}</b><span>need you</span></div>
        </div>
      </div>

      <Section title={`When ${calls} asks`} i={1}>
        <div className="hours" role="img" aria-label={`Questions by hour over the last 7 days. Busiest ${span(peak)}.`}>
          {byHour.slice(6).map((n, k) => (
            <div key={k} className="hour">
              {now === k + 6 && <span className="now" />}
              <i className={k + 6 === peak && most ? "peak" : ""} style={{ height: `${most ? Math.max((n / most) * 100, n ? 4 : 0) : 0}%` }} />
            </div>
          ))}
        </div>
        <div className="hour-labels">{[6, 9, 12, 15, 18, 21].map((h) => <span key={h}>{hour(h)}</span>)}</div>
      </Section>

      <Section title={`What ${calls} asks`} i={2}>
        {p.topics.map((t) => (
          <div key={t.id} className="asked">
            <div className="asked-head"><b>{t.question}</b><span>{Math.round(t.week)}</span></div>
            <div className="thin"><i style={{ width: `max(6px, ${(t.week / top) * 100}%)` }} /></div>
          </div>
        ))}
      </Section>

      {p.unanswered.length > 0 && (
        <Section title="Needs an answer" i={3}>
          {p.unanswered.map((item) => <Unanswered key={item.id} item={item} newQuestion={() => setAdding(item)} />)}
        </Section>
      )}

      {adding && (
        <TopicEditor topic={{ id: "", question: adding.text, phrasings: [], answer: null }} onClose={() => setAdding(null)}
          saved={() => send("/api/patterns/resolve", { id: adding.id })} />
      )}
    </div>
  );
}

function Unanswered({ item, newQuestion }: { item: Patterns["unanswered"][number]; newQuestion: () => void }) {
  const { topics, send, time } = useLumina();
  const [match, setMatch] = useState<string | null>(null);
  useEffect(() => { call<{ topic: string | null }>("/api/topics/match", { text: item.text }).then((m) => setMatch(m.topic), () => {}); }, [item.text]);
  const same = topics.find((t) => t.id === match);
  const resolve = (topic: string) => send("/api/patterns/resolve", { id: item.id, topic });

  return (
    <div className="unanswered">
      <b>“{item.text}”</b>
      <span className="soft small">{time(item.at)}</span>
      <div className="row">
        {same ? (
          <button className="btn small" onClick={() => resolve(same.id)}>Same as “{same.question}”</button>
        ) : (
          <select className="btn small ghost" value="" aria-label="Same as…" onChange={(e) => e.target.value && resolve(e.target.value)}>
            <option value="">Same as…</option>
            {topics.map((t) => <option key={t.id} value={t.id}>{t.question}</option>)}
          </select>
        )}
        <button className="btn small ghost" onClick={newQuestion}>New question</button>
      </div>
    </div>
  );
}
