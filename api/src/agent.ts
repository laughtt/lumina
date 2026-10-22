import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { DEMO, get, pk, put, query } from "./db.js";
import { local, now } from "./clock.js";
import { addActivity, addFeed, ai, answers, email, memories, patchTv, showMemory, updateFeed, type Feed } from "./family.js";

export async function inbox(since?: string) {
  const d = await now();
  const [asks, feed, playbook, ans, profile] = await Promise.all([
    query("ASK#", { after: since }),
    query<Feed>("FEED#", { newestFirst: true, limit: 200 }),
    query("PLAYBOOK#"),
    answers(),
    get("PROFILE"),
  ]);
  return {
    now: d.toISOString(),
    local: local(d),
    asks: asks.filter((a) => !since || a.at > since).map(({ topic, at, answered }) => {
      const l = local(new Date(at));
      return { topic, at, answered, date: l.date, hour: l.hour, minute: l.minutes, time: `${l.time} ${l.ampm}` };
    }),
    feedback: feed.filter((f) => f.ref && (f.rating || f.decision)).map(({ id, ref, rating, decision, approvalId }) => ({ id, ref, rating, decision, approvalId })),
    playbook: playbook.map(({ id, label, tier, enabled }) => ({ id, label, tier, enabled })),
    answers: Object.fromEntries(Object.entries(ans).map(([k, a]) => [k, { approvedOn: local(new Date(a!.approvedAt)).date }])),
    backup: profile?.backups?.[0]?.name ?? "Luis",
  };
}

type Act =
  | { kind: "tv_step"; ref: string; step: string; title: string; reason: string; minutes?: number }
  | { kind: "propose"; ref: string; approvalId: string; step: string; title: string; text: string; reason: string }
  | { kind: "send"; ref: string; text: string }
  | { kind: "refresh"; ref: string; topic: string; reason: string }
  | { kind: "check"; ref: string; result: string }
  | { kind: "suggest_check"; ref: string; title: string; reason: string };

export async function act(a: Act) {
  const d = await now();
  if (a.kind === "tv_step") {
    if (!(await ai()).tv) return addFeed({ kind: "approval", title: a.title, body: `May Lumina ${offer[a.step] ?? a.step}?`, why: a.reason, step: a.step, actions: "decide" });
    await tvStep(a.step, a.minutes);
    return addFeed({ kind: "agent", ref: a.ref, title: a.title, body: stepLabel(a.step), why: a.reason, actions: "rate" });
  }
  if (a.kind === "propose") {
    return addFeed({ kind: "approval", ref: a.ref, approvalId: a.approvalId, title: a.title, body: a.text, why: a.reason, actions: "decide" });
  }
  if (a.kind === "send") {
    await email("Lumina: please call Mom", a.text);
    await addActivity("Asked Luis to call");
    return addFeed({ kind: "info", ref: a.ref, title: "Message sent", body: a.text });
  }
  if (a.kind === "refresh") {
    return addFeed({ kind: "agent", ref: a.ref, title: "Rosa is asking, and your answer is old", body: `Update “Where's Ana?” so she hears today's plan.`, why: a.reason, actions: "rate" });
  }
  if (a.kind === "suggest_check") {
    return addFeed({ kind: "agent", ref: a.ref, title: a.title, body: "Worth checking: pain, sleep, toilet, hunger, visitors. Lumina can't tell why.", why: a.reason, actions: "rate" });
  }
  if (a.kind === "check") {
    const item = (await query<Feed>("FEED#", { newestFirst: true, limit: 200 })).find((f) => f.ref === a.ref && f.kind === "agent");
    if (item) await updateFeed(item.id, { result: a.result });
  }
}

export async function tvStep(step: string, minutes = 45) {
  const d = await now();
  if (step === "bigger_answer") {
    await patchTv({ big: { topic: "where_is_ana", until: new Date(d.getTime() + minutes * 60_000).toISOString() }, screen: "today" });
    await addActivity("Showed Ana's answer bigger");
  } else if (step === "calming_memory") {
    const m = (await memories()).find((x) => x.calming);
    if (m) { await showMemory(m); await addActivity(`Showed “${m.title}”`); }
  } else if (step === "music") {
    await patchTv({ music: { until: new Date(d.getTime() + 30 * 60_000).toISOString() } });
    await addActivity("Played Rosa's music");
  }
}

const offer: Record<string, string> = {
  bigger_answer: "show your answer bigger on the TV",
  calming_memory: "switch the TV to the photos she loves",
  music: "play the music you picked for her",
};

const stepLabel = (s: string) => ({
  bigger_answer: "I showed your answer bigger on the TV.",
  calming_memory: "I switched the TV to the Porto photos she loves.",
  music: "I played the music you picked for her.",
}[s] ?? s);

export async function saveState(state: Record<string, any>) {
  await put("AGENT", { ...state, savedAt: new Date().toISOString() });
}

const lambda = process.env.AGENT_FUNCTION ? new LambdaClient({}) : null;

export async function runAgent(path = "tick") {
  if (pk() !== DEMO) return { skipped: "learning" };
  if (process.env.AGENT_URL) {
    const r = await fetch(`${process.env.AGENT_URL}/${path}`, { method: "POST" });
    return r.json();
  }
  if (lambda) {
    await lambda.send(new InvokeCommand({ FunctionName: process.env.AGENT_FUNCTION, InvocationType: "Event", Payload: JSON.stringify({ action: path }) }));
    return { queued: true };
  }
  return { error: "agent not configured (set AGENT_URL)" };
}
