import { createHash, randomUUID } from "node:crypto";
import { PublishCommand, SNSClient } from "@aws-sdk/client-sns";
import { DEMO, get, pk, put, query } from "./db.js";
import { hhmmToMinutes, local, minutesLabel, now } from "./clock.js";

export type Profile = { rosa: string; ana: string; calls: string; age?: number; condition?: string; createdAt?: string; key?: string; [k: string]: any };
export type Topic = { id: string; question: string; phrasings: string[]; pin: boolean; at: string };
export type Answer = { topic: string; text: string; rosa_text: string; tv_line: string; approvedAt: string };
export type Memory = { id: string; title: string; caption: string; story: string; tags: string[]; photoKey: string; calming?: boolean; label?: string; year?: number; from?: string; pending?: boolean };
export type Reminder = { id: string; label: string; spoken: string; time: string; where: string; doneOn?: string; doneAt?: string; esc?: { date: string; stage: number } };
export type Feed = {
  id: string; at: string; kind: "agent" | "approval" | "escalation" | "asked" | "note" | "info" | "message";
  title: string; body?: string; why?: string; result?: string; ref?: string; approvalId?: string; memory?: string; step?: string;
  actions?: "rate" | "decide"; rating?: "up" | "down"; decision?: "approve" | "deny"; decidedAt?: string; ratedAt?: string;
};

export type Ai = { notify: boolean; tv: boolean; memories: boolean; learn: boolean; analysis: boolean; lastMemory?: string };
export async function ai(): Promise<Ai> {
  const { PK, SK, ...saved } = (await get("AI")) ?? {};
  return { notify: true, tv: true, memories: false, learn: false, analysis: true, ...saved };
}

const sns = process.env.TOPIC_ARN ? new SNSClient({}) : null;

export async function email(subject: string, body: string) {
  if (!sns || !(await ai()).notify) return;
  await sns.send(new PublishCommand({ TopicArn: process.env.TOPIC_ARN, Subject: subject.slice(0, 99), Message: body })).catch((e) => console.warn("[sns]", e.message));
}

export async function addFeed(item: Omit<Feed, "id" | "at">) {
  const at = (await now()).toISOString();
  const id = `${at}#${randomUUID().slice(0, 6)}`;
  await put(`FEED#${id}`, { ...item, id, at });
  return id;
}

export async function updateFeed(id: string, patch: Partial<Feed>) {
  const item = await get<Feed>(`FEED#${id}`);
  if (item) await put(`FEED#${id}`, { ...item, ...patch });
  return item ? { ...item, ...patch } : undefined;
}

export const answers = async () => Object.fromEntries((await query<Answer>("ANSWER#")).map((a) => [a.topic, a])) as Partial<Record<string, Answer>>;
export const profile = async () => (await get<Profile>("PROFILE"))!;
export const topics = async () => (await query<Topic>("TOPIC#")).sort((a, b) => a.at.localeCompare(b.at));
export const topicLabel = (t: Topic) => [t.question, ...t.phrasings].join(" / ");
export const notSure = (p: Profile) => `I'm not sure, ${p.rosa}. I'll let ${p.ana} know.`;
export const memories = async () => (await query<Memory>("MEMORY#")).filter((m) => !m.pending).sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999));
export const reminders = () => query<Reminder>("REMINDER#");

export async function logAsk(topic: string, answered: boolean, said?: string) {
  const at = (await now()).toISOString();
  await put(`ASK#${at}#${randomUUID().slice(0, 4)}`, { topic, answered, at, said });
  await patchTv({ pulse: { topic, at } });
}

export async function patchTv(patch: Record<string, any>) {
  await put("TV", { ...((await get("TV")) ?? {}), ...patch });
}

export async function addActivity(line: string) {
  const tv = (await get("TV")) ?? {};
  const t = local(await now());
  const activity = [{ date: t.date, time: `${t.time} ${t.ampm}`, line }, ...(tv.activity ?? [])].slice(0, 6);
  await put("TV", { ...tv, activity });
}

const FILLER = ["the", "and", "you", "your", "our", "show", "tell", "about", "see", "want", "photo", "photos", "picture", "pictures", "can", "please", "with"];

export function findMemory(list: Memory[], q: string) {
  const words = (q.toLowerCase().match(/[a-zà-ú0-9]{3,}/g) ?? []).filter((w) => !FILLER.includes(w));
  const score = (m: Memory) => words.filter((w) => m.tags.includes(w) || m.title.toLowerCase().includes(w)).length;
  const best = list.map((m) => [score(m), m] as const).sort((a, b) => b[0] - a[0])[0];
  return best && best[0] > 0 ? best[1] : undefined;
}

export async function showMemory(m: Memory) {
  await patchTv({ screen: "memory", memoryId: m.id, since: (await now()).toISOString() });
}
const SLIDE = 20_000, SHOW = 60 * 60_000;

export async function confirmReminder(id: string) {
  const r = await get<Reminder>(`REMINDER#${id}`);
  if (!r) return undefined;
  const t = local(await now());
  if (r.doneOn !== t.date) {
    await put(`REMINDER#${id}`, { ...r, doneOn: t.date, doneAt: `${t.time} ${t.ampm}` });
    await addFeed({ kind: "info", title: `${(await profile()).calls} confirmed ✓ ${r.label}`, body: `At ${t.time} ${t.ampm}.` });
  }
  return r;
}

export async function tvView() {
  const d = await now();
  const t = local(d);
  const [tv, ans, rems, mems, list, p] = await Promise.all([get("TV"), answers(), reminders(), memories(), topics(), profile()]);
  const state = tv ?? {};
  const [first, second] = list.filter((x) => x.pin).map((x) => ans[x.id]);
  const due = rems.find((r) => r.doneOn !== t.date && t.minutes >= hhmmToMinutes(r.time) && t.minutes <= hhmmToMinutes(r.time) + 90);
  const next = rems.filter((r) => r.doneOn !== t.date && hhmmToMinutes(r.time) > t.minutes).sort((a, b) => a.time.localeCompare(b.time))[0];
  const shown = Math.max(0, d.getTime() - Date.parse(state.since ?? d.toISOString()));
  const start = Math.max(0, mems.findIndex((m) => m.id === state.memoryId));
  const memory = state.screen === "memory" && shown < SHOW && mems.length ? mems[(start + Math.floor(shown / SLIDE)) % mems.length] : undefined;
  const big = state.big && state.big.until > d.toISOString() ? ans[state.big.topic] : undefined;
  const view = {
    day: t.dayLabel,
    time: t.time,
    ampm: t.ampm,
    part: t.hour < 5 ? "night" : t.hour < 12 ? "morning" : t.hour < 17 ? "afternoon" : t.hour < 21 ? "evening" : "night",
    ana: p.ana,
    status: first?.tv_line ?? null,
    statusFrom: first ? (({ time, ampm, date }) => `${date === t.date ? "" : "yesterday "}${time} ${ampm}`)(local(new Date(first.approvedAt))) : null,
    line2: second?.tv_line ?? null,
    next: next ? `${next.label[0].toUpperCase()}${next.label.slice(1)} at ${minutesLabel(hhmmToMinutes(next.time))}` : null,
    banner: due ? { id: due.id, text: due.spoken, where: due.where } : null,
    screen: memory ? "memory" : "today",
    memory: memory ? { id: memory.id, title: memory.title, caption: memory.caption, label: memory.label ?? null, url: `/media/${memory.photoKey}` } : null,
    big: big ? { text: big.rosa_text } : null,
    pulse: state.pulse && Date.parse(state.pulse.at) > d.getTime() - 8000 ? state.pulse.topic : null,
    activity: (state.activity ?? []).filter((a: any) => a.date === t.date).slice(0, 2).map((a: any) => ({ time: a.time, line: a.line })),
  };
  return { v: createHash("sha1").update(JSON.stringify(view)).digest("hex").slice(0, 12), ...view };
}

export async function pressTv(button: string) {
  const [mems, view] = await Promise.all([memories(), tvView()]);
  if (button === "done" && view.banner) return confirmReminder(view.banner.id);
  if (button === "memories" || button === "next") {
    const i = mems.findIndex((m) => m.id === view.memory?.id);
    return showMemory(mems[(i + 1) % mems.length]);
  }
  if (button === "back") return patchTv({ screen: "today" });
  if (button === "tell_ana") {
    const m = view.memory;
    const p = await profile();
    await addFeed({ kind: "message", title: m ? `❤ ${p.calls} sent you love from “${m.title}”` : `❤ ${p.calls} pressed “Tell ${p.ana}”`, body: m ? m.caption : "She's thinking of you." });
    await addActivity(`Sent ${p.ana} a ❤`);
  }
}

const week = async () => new Date((await now()).getTime() - 7 * 86_400_000).toISOString();

export async function unanswered() {
  const since = await week();
  const [asks, msgs, list] = await Promise.all([query("ASK#", { after: since }), query("MSG#", { after: since }), topics()]);
  return [
    ...msgs.filter((m) => m.kind === "question" && !m.resolved).map((m) => ({ id: m.SK as string, at: m.at as string, text: m.text as string })),
    ...asks.filter((a) => !a.answered && !a.resolved).map((a) => ({ id: a.SK as string, at: a.at as string, text: a.said ?? list.find((t) => t.id === a.topic)?.question ?? a.topic })),
  ].sort((a, b) => b.at.localeCompare(a.at));
}

export async function patterns() {
  const d = await now();
  const today = local(d).date;
  const since = await week();
  const [list, ans, asks, msgs, feed, open, p] = await Promise.all([
    topics(), answers(), query("ASK#", { after: since }), query("MSG#", { after: since }), query<Feed>("FEED#", { newestFirst: true, limit: 200 }), unanswered(), profile(),
  ]);
  const stats = list.map((t) => {
    const mine = asks.filter((a) => a.topic === t.id);
    const byHour = Array(24).fill(0);
    for (const a of mine) byHour[local(new Date(a.at)).hour]++;
    return { id: t.id, question: t.question, week: mine.length, today: mine.filter((a) => local(new Date(a.at)).date === today).length, byHour, answer: ans[t.id]?.rosa_text ?? null };
  }).sort((a, b) => b.week - a.week);
  const recent = [
    ...asks.map((a) => ({ at: a.at, topic: a.topic, said: a.said ?? null, reply: a.answered ? ans[a.topic]?.rosa_text ?? null : notSure(p), answered: a.answered })),
    ...msgs.filter((m) => m.kind === "question").map((m) => ({ at: m.at, topic: null, said: m.text, reply: notSure(p), answered: false })),
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 30);
  return {
    topics: stats,
    recent,
    unanswered: open,
    steps: feed.filter((f) => f.kind === "agent").map((f) => ({ at: f.at, title: f.title, body: f.body ?? null, result: f.result ?? null })),
    learning: pk() === DEMO ? null : { day: Math.floor((Date.now() - Date.parse(p.createdAt!)) / 86_400_000) + 1, of: 14 },
  };
}

export async function resolve(id: string, topic?: string) {
  const item = await get(id);
  if (item) await put(id, { ...item, resolved: true });
  const t = topic ? await get<Topic>(`TOPIC#${topic}`) : undefined;
  const text = item?.said ?? item?.text;
  if (t && text && !t.phrasings.includes(text)) await put(`TOPIC#${t.id}`, { ...t, phrasings: [...t.phrasings, text] });
}
