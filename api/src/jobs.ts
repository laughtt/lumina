import { DEMO, get, put, query, withFamily } from "./db.js";
import { hhmmToMinutes, local, minutesLabel, now } from "./clock.js";
import { eveningNote } from "./claude.js";
import { addActivity, addFeed, ai, email, memories, profile, reminders, showMemory, type Feed } from "./family.js";

export async function tick(force?: string) {
  const t = await withFamily(DEMO, () => run(force));
  const keys = await withFamily("AUTH", () => query("KEY#"));
  for (const id of new Set(keys.map((k) => `FAM#${k.personId}`))) {
    if (id !== DEMO) await withFamily(id, () => run()).catch((e) => console.warn("[tick]", id, e.message));
  }
  return t;
}

async function run(force?: string) {
  const t = local(await now());
  const profile = (await get("PROFILE")) ?? {};
  if (!profile.rosa) return t;
  const backup = profile.backups?.[0];
  const settings = await ai();

  const slot = `${t.date}-${t.hour}`;
  if (settings.memories && [10, 16].includes(t.hour) && settings.lastMemory !== slot) {
    const list = await memories();
    if (list.length) {
      const m = list[Math.floor(Date.parse(t.date) / 86_400_000 + t.hour) % list.length];
      await showMemory(m);
      await addActivity(`Showed “${m.title}”`);
      await addFeed({ kind: "info", title: `Lumina showed “${m.title}” on ${profile.calls}'s TV`, body: m.caption, memory: m.id });
      await put("AI", { ...settings, lastMemory: slot });
    }
  }

  for (const r of await reminders()) {
    if (r.doneOn === t.date) continue;
    const late = t.minutes - hhmmToMinutes(r.time);
    const stage = r.esc?.date === t.date ? r.esc.stage : 0;
    if (late >= 30 && stage < 1) {
      const title = `${profile.calls} hasn't confirmed the ${r.label}`;
      await addFeed({ kind: "escalation", title, body: `It was due at ${minutesLabel(hhmmToMinutes(r.time))}. Maybe give her a call?` });
      await email(title, `It was due at ${minutesLabel(hhmmToMinutes(r.time))}. If you can't reach her, ${backup?.name ?? "your backup"} will be asked next.`);
      await put(`REMINDER#${r.id}`, { ...r, esc: { date: t.date, stage: 1 } });
    }
    if (late >= 45 && stage < 2 && backup) {
      await addFeed({ kind: "escalation", title: `Asked ${backup.name} to call ${profile.calls}`, body: `The ${r.label} still isn't confirmed. ${backup.name} got the message.` });
      await email(`Please call Mom: ${r.label}`, `${backup.name}, Mom hasn't confirmed her ${r.label} and Ana couldn't respond. Could you give her a call?`);
      await put(`REMINDER#${r.id}`, { ...r, esc: { date: t.date, stage: 2 } });
    }
  }

  if ((force === "note" || (settings.analysis && t.minutes >= 20 * 60)) && (force || !(await get(`NOTE#${t.date}`)))) await writeNote(t.date);
  return t;
}

async function writeNote(date: string) {
  const sameDay = (iso: string) => local(new Date(iso)).date === date;
  const [asks, rems, feed, msgs, tv, p] = await Promise.all([
    query("ASK#", { after: new Date(Date.parse(date) - 86_400_000).toISOString() }),
    reminders(), query<Feed>("FEED#", { newestFirst: true, limit: 80 }), query("MSG#", { newestFirst: true, limit: 20 }), get("TV"), profile(),
  ]);
  const today = asks.filter((a) => sameDay(a.at));
  const forAna = today.filter((a) => a.topic === "where_is_ana");
  const byHour = new Map<number, number>();
  for (const a of forAna) { const h = local(new Date(a.at)).hour; byHour.set(h, (byHour.get(h) ?? 0) + 1); }
  let peak: string | null = null, best = 0;
  for (const [h, n] of byHour) {
    const two = n + (byHour.get(h + 1) ?? 0);
    if (two > best) { best = two; peak = `${minutesLabel(h * 60).replace(":00", "")}–${minutesLabel((h + 2) * 60).replace(":00", "")}`; }
  }
  const facts = {
    asked: today.length,
    askedForAna: forAna.length,
    peak,
    reminders: rems.map((r) => ({ label: r.label, done: r.doneOn === date })),
    memories: (tv?.activity ?? []).filter((a: any) => a.date === date && a.line.includes("Showed")).map((a: any) => a.line.split("“")[1]?.replace("”", "")).filter(Boolean),
    steps: feed.filter((f) => f.kind === "agent" && sameDay(f.at)).map((f) => ({ step: f.body ?? "", result: f.result ?? "not checked yet" })),
    messages: msgs.filter((m) => sameDay(m.at)).map((m) => m.text),
  };
  const note = await eveningNote(facts, p);
  await put(`NOTE#${date}`, { date, text: note.text, source: note.source, facts });
  await addFeed({ kind: "note", title: "Evening note", body: note.text });
  await email("Lumina evening note", note.text);
}
