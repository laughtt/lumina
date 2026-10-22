import { Resvg } from "@resvg/resvg-js";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { DEMO, del, get, pk, put, putMany, query, withFamily } from "./db.js";
import { advance, local, now, offsetMs, setClock } from "./clock.js";
import { checkAnswer, chooseTool, draftMemory, extractFacts, matchTopic } from "./claude.js";
import { addActivity, addFeed, ai, answers, memories, patterns, pressTv, showMemory, profile, reminders, resolve, topicLabel, topics, tvView, updateFeed, type Feed, type Profile, type Topic } from "./family.js";
import { account, addPerson, appleSub, caller, googleUser, linkedAccount, claim, demoAccount, newAccount, owns, pairing, people, shared, shareLink, signIn, startPairing, updateAccount } from "./auth.js";
import { act, inbox, runAgent, saveState, tvStep } from "./agent.js";
import { buildServer } from "./mcp.js";
import { alexaCode, skill } from "./alexa.js";
import { tick } from "./jobs.js";
import { seed } from "./seed.js";

export const app = new Hono<{ Variables: { account?: string; household?: boolean } }>();
const TOKEN = process.env.LUMINA_TOKEN;
const authOn = !!TOKEN && process.env.AUTH !== "off";
const OPEN = /^\/api\/(health$|auth\/|tv\/pair(\/|$)|share\/)/;
const keyOf = (p: Profile) => p.key ?? TOKEN ?? "demo";

app.use("*", cors({ origin: "*", allowHeaders: ["authorization", "content-type", "mcp-protocol-version", "mcp-session-id", "x-lumina-person"], exposeHeaders: ["mcp-session-id"] }));
app.use("*", async (c, next) => {
  const path = c.req.path;
  if (OPEN.test(path) || !(path.startsWith("/api/") || path === "/mcp" || path.startsWith("/media/"))) return next();
  const given = c.req.header("authorization")?.replace(/^Bearer /, "") ?? c.req.query("t");
  const hit = given && given !== TOKEN ? await caller(given) : undefined;
  if (hit?.personId) return withFamily(`FAM#${hit.personId}`, next);
  if (hit?.accountId) {
    c.set("account", hit.accountId);
    const person = c.req.header("x-lumina-person");
    if (!person) return withFamily(`ACCT#${hit.accountId}`, next);
    return (await owns(hit.accountId, person)) ? withFamily(`FAM#${person}`, next) : c.json({ error: "not your person" }, 404);
  }
  if (authOn && given !== TOKEN) return c.json({ error: "unauthorized" }, 401);
  c.set("household", true);
  return next();
});
for (const path of ["/api/me", "/api/people"]) app.use(path, async (c, next) => (c.get("account") ? next() : c.json({ error: "sign in first" }, 401)));
for (const path of ["/api/demo/*", "/api/jobs/*", "/api/agent/*"]) app.use(path, async (c, next) => (c.get("household") ? next() : c.json({ error: "household code only" }, 403)));

app.get("/api/health", (c) => c.json({ ok: true, llm: process.env.LLM === "offline" ? "offline" : "bedrock", auth: authOn }));

app.all("/mcp", async (c) => {
  const server = await buildServer();
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  return transport.handleRequest(c.req.raw);
});

app.get("/media/:key", async (c) => {
  const m = await get(`MEDIA#${c.req.param("key")}`);
  if (!m) return c.notFound();
  let body: Buffer = Buffer.from(m.data, "base64"), type = m.contentType;
  if (type === "image/svg+xml" && c.req.query("png")) {
    body = Buffer.from(new Resvg(body, { fitTo: { mode: "width", value: 1920 } }).render().asPng());
    type = "image/png";
  }
  return new Response(new Uint8Array(body), { headers: { "content-type": type, "cache-control": "public, max-age=86400" } });
});

app.post("/api/auth/apple", async (c) => {
  const { identityToken, name } = await c.req.json();
  const sub = await appleSub(identityToken).catch(() => null);
  return sub ? c.json(await signIn(await linkedAccount("APPLE", sub, name))) : c.json({ error: "Apple sign-in failed" }, 401);
});
app.post("/api/auth/guest", async (c) => {
  const { demo } = await c.req.json().catch(() => ({}));
  const id = await newAccount();
  if (demo) {
    await addPerson(id, { name: "Rosa", calls: "Mom", age: 76, condition: "Early Alzheimer's", caregiver: "Ana", devices: ["firetv", "alexa"], demo: "full" });
    await updateAccount(id, { name: "Ana", role: "family", scope: "one", onboarded: true });
  }
  return c.json(await signIn(id));
});
app.post("/api/auth/google", async (c) => {
  const user = await googleUser((await c.req.json()).idToken).catch(() => null);
  return user ? c.json(await signIn(await linkedAccount("GOOGLE", user.sub, user.given_name))) : c.json({ error: "Google sign-in failed" }, 401);
});
app.post("/api/auth/demo", async (c) => {
  const { code, fresh } = await c.req.json();
  return !authOn || code === TOKEN ? c.json(await signIn(fresh ? await newAccount() : await demoAccount())) : c.json({ error: "wrong code" }, 401);
});
app.get("/api/me", async (c) => c.json({ account: await account(c.get("account")!), people: await people(c.get("account")!) }));
app.put("/api/me", async (c) => { await updateAccount(c.get("account")!, await c.req.json()); return c.json({ ok: true }); });
app.post("/api/people", async (c) => {
  const b = await c.req.json();
  return c.json(await addPerson(c.get("account")!, { ...b, demo: b.demo ? "history" : undefined }));
});
app.get("/api/person/devices", async (c) => {
  const p = await profile();
  return c.json({ key: keyOf(p), mcpUrl: `${new URL(c.req.url).origin}/mcp`, tvPaired: !!p.tvPaired });
});

app.get("/api/tv", async (c) => {
  const view = await tvView();
  return c.req.query("v") === view.v ? c.body(null, 204) : c.json(view);
});
app.post("/api/tv/press", async (c) => {
  await pressTv((await c.req.json()).button);
  return c.json(await tvView());
});
app.post("/api/tv/pair", async (c) => c.json(await startPairing()));
app.get("/api/tv/pair/:secret", async (c) => {
  const p = await pairing(c.req.param("secret"));
  return !p ? c.json({ error: "expired" }, 404) : p.token ? c.json({ token: p.token }) : c.body(null, 204);
});
app.post("/api/tv/claim", async (c) => {
  const p = await profile();
  if (!(await claim((await c.req.json()).code, keyOf(p)))) return c.json({ error: "code not found" }, 404);
  await put("PROFILE", { ...p, tvPaired: true });
  const [first] = await memories();
  if (first) await showMemory(first);
  return c.json({ ok: true });
});

app.get("/api/family", async (c) => {
  const d = await now();
  const t = local(d);
  const [p, list, ans, mems, rems, playbook, agent, note] = await Promise.all([
    profile(), topics(), answers(), memories(), reminders(), query("PLAYBOOK#"), get("AGENT"), get(`NOTE#${t.date}`),
  ]);
  return c.json({
    profile: p, topics: Object.fromEntries(list.map((x) => [x.id, topicLabel(x)])), answers: ans, playbook, agent, note, ai: await ai(),
    memories: mems.map((m) => ({ ...m, url: `/media/${m.photoKey}` })),
    reminders: rems.map((r) => ({ ...r, doneToday: r.doneOn === t.date })),
    clock: { ...t, offsetMs: await offsetMs(), iso: d.toISOString() },
  });
});
app.get("/api/topics", async (c) => {
  const [list, ans] = await Promise.all([topics(), answers()]);
  return c.json(list.map(({ id, question, phrasings, pin }) => {
    const a = ans[id];
    return { id, question, phrasings, pin, answer: a ? { text: a.text, rosa_text: a.rosa_text, tv_line: a.tv_line } : null };
  }));
});
app.put("/api/topics/:id", async (c) => {
  const id = c.req.param("id");
  const { question, phrasings, pin } = await c.req.json();
  const old = await get<Topic>(`TOPIC#${id}`);
  await put(`TOPIC#${id}`, { id, question, phrasings, pin: pin ?? old?.pin ?? false, at: old?.at ?? new Date().toISOString() });
  return c.json({ ok: true });
});
app.delete("/api/topics/:id", async (c) => {
  await Promise.all([del(`TOPIC#${c.req.param("id")}`), del(`ANSWER#${c.req.param("id")}`)]);
  return c.json({ ok: true });
});
app.post("/api/topics/match", async (c) => {
  const [{ text }, list, p] = await Promise.all([c.req.json(), topics(), profile()]);
  return c.json({ topic: await matchTopic(text, list, p) });
});
app.post("/api/answers/check", async (c) => {
  const { topic, text } = await c.req.json();
  const [t, p] = await Promise.all([get<Topic>(`TOPIC#${topic}`), profile()]);
  return c.json(await checkAnswer(t ? topicLabel(t) : topic, text, p));
});
app.put("/api/answers/:topic", async (c) => {
  const topic = c.req.param("topic");
  const { text, rosa_text, tv_line } = await c.req.json();
  await put(`ANSWER#${topic}`, { topic, text, rosa_text, tv_line, approvedAt: (await now()).toISOString() });
  return c.json({ ok: true });
});
app.post("/api/memories/draft", async (c) => {
  const { line, image } = await c.req.json();
  return c.json(await draftMemory(line, image, await profile()));
});
app.post("/api/memories", async (c) => {
  const { title, caption, story, tags, image } = await c.req.json();
  const id = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30)}-${Date.now().toString(36)}`;
  await put(`MEDIA#${id}`, { contentType: image.mediaType, data: image.data });
  await put(`MEMORY#${id}`, { id, title, caption, story, tags, photoKey: id });
  await toTv(id);
  return c.json({ id });
});
app.post("/alexa", async (c) => c.json(await skill(await c.req.json())));
app.post("/api/alexa/code", async (c) => c.json({ code: await alexaCode(pk().slice(4)) }));

app.get("/api/ai", async (c) => c.json(await ai()));
app.put("/api/ai", async (c) => {
  const body = await c.req.json();
  const patch = Object.fromEntries(["notify", "tv", "memories", "learn", "analysis"].filter((k) => typeof body[k] === "boolean").map((k) => [k, body[k]]));
  await put("AI", { ...(await ai()), ...patch });
  return c.json(await ai());
});
async function toTv(id: string) {
  const m = (await memories()).find((x) => x.id === id);
  if (!m || !(await ai()).tv) return;
  await showMemory(m);
  await addActivity(`Showed “${m.title}”`);
}
app.post("/api/tv/memory", async (c) => {
  const { id } = await c.req.json();
  const m = (await memories()).find((x) => x.id === id);
  if (!m) return c.json({ error: "memory not found" }, 404);
  await showMemory(m);
  await addActivity(`Showed “${m.title}”`);
  return c.json({ ok: true });
});

app.post("/api/share", async (c) => {
  const { fresh } = await c.req.json().catch(() => ({}));
  return c.json({ path: `/share/${await shareLink(pk().slice(4), fresh)}` });
});
app.get("/api/share/:token", async (c) => {
  const s = await shared(c.req.param("token"));
  if (!s) return c.json({ error: "link not found" }, 404);
  const p = await withFamily(`FAM#${s.personId}`, profile);
  return c.json({ name: p.rosa, calls: p.calls, caregiver: p.ana });
});
app.post("/api/share/:token", async (c) => {
  const s = await shared(c.req.param("token"));
  if (!s) return c.json({ error: "link not found" }, 404);
  const { from, line, image } = await c.req.json();
  if (!from || !line || !image?.data || image.data.length > 380_000) return c.json({ error: "name, photo and a line, please" }, 400);
  return withFamily(`FAM#${s.personId}`, async () => {
    const p = await profile();
    const { source, ...d } = await draftMemory(line, image, p);
    const id = `${d.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30)}-${Date.now().toString(36)}`;
    await put(`MEDIA#${id}`, { contentType: image.mediaType, data: image.data });
    await put(`MEMORY#${id}`, { ...d, id, photoKey: id, from, pending: true, year: Number(line.match(/\b(19|20)\d\d\b/)?.[0]) || undefined });
    await addFeed({ kind: "approval", title: `${from} sent a photo for ${p.calls}`, body: d.caption, memory: id, actions: "decide" });
    return c.json({ ok: true });
  });
});
app.put("/api/playbook/:id", async (c) => {
  const step = await get(`PLAYBOOK#${c.req.param("id")}`);
  if (step) await put(`PLAYBOOK#${step.id}`, { ...step, enabled: (await c.req.json()).enabled });
  return c.json({ ok: !!step });
});
app.get("/api/patterns", async (c) => c.json(await patterns()));
app.post("/api/patterns/resolve", async (c) => {
  const { id, topic } = await c.req.json();
  await resolve(id, topic);
  return c.json({ ok: true });
});
app.get("/api/about", async (c) => c.json({ facts: (await query("FACT#")).map(({ id, kind, text, at }) => ({ id, kind, text, at })) }));
app.post("/api/about", async (c) => {
  const { text } = await c.req.json();
  const at = (await now()).toISOString();
  const facts = (await extractFacts(text, await profile())).map((f, i) => ({ id: `${Date.parse(at).toString(36)}-${i}`, kind: f.kind, text: f.text, at }));
  await putMany(facts.map((f) => ({ sk: `FACT#${f.id}`, item: f })));
  return c.json({ facts });
});
app.delete("/api/about/:id", async (c) => { await del(`FACT#${c.req.param("id")}`); return c.json({ ok: true }); });
app.get("/api/phone/feed", async (c) => c.json(await query<Feed>("FEED#", { newestFirst: true, limit: 60 })));
app.post("/api/phone/feed/:id/rate", async (c) => {
  const { rating } = await c.req.json();
  return c.json(await updateFeed(c.req.param("id"), { rating, ratedAt: (await now()).toISOString() }));
});
app.post("/api/phone/feed/:id/decide", async (c) => {
  const { decision } = await c.req.json();
  const item = await updateFeed(c.req.param("id"), { decision, decidedAt: (await now()).toISOString() });
  if (item?.ref) runAgent().catch(() => {});
  if (item?.step && decision === "approve") await tvStep(item.step);
  if (item?.memory) {
    const m = await get(`MEMORY#${item.memory}`);
    if (decision === "approve") await put(`MEMORY#${item.memory}`, { ...m, pending: false }).then(() => toTv(item.memory!));
    else await Promise.all([del(`MEMORY#${item.memory}`), del(`MEDIA#${item.memory}`), updateFeed(item.id, { memory: undefined })]);
  }
  return c.json(item);
});

app.post("/api/alexa/choose", async (c) => {
  const { said, tools } = await c.req.json();
  const t = local(await now());
  const [list, p, rems] = await Promise.all([topics(), profile(), reminders()]);
  const due = rems.map((r) => `${r.id} at ${r.time} (${r.doneOn === t.date ? "done" : "not done yet"})`).join("; ");
  return c.json(await chooseTool(said, tools, `It is ${t.time} ${t.ampm}. Today's reminders: ${due}. "I took it" confirms the reminder that is due and not done.`, p, list));
});

app.get("/api/agent/inbox", async (c) => c.json(await inbox(c.req.query("since"))));
app.post("/api/agent/act", async (c) => c.json({ id: await act(await c.req.json()) }));
app.put("/api/agent/state", async (c) => { await saveState(await c.req.json()); return c.json({ ok: true }); });
app.post("/api/agent/run", async (c) => c.json(await runAgent()));

app.post("/api/jobs/tick", async (c) => c.json(await tick(c.req.query("force"))));

app.post("/api/demo/clock", async (c) => {
  const { at, minutes } = await c.req.json();
  if (minutes) await advance(minutes); else await setClock(at ?? null);
  return c.json(await tick());
});
app.post("/api/demo/reset", async (c) => {
  await withFamily(DEMO, async () => {
    await seed();
    await runAgent("reset").catch(() => {});
  });
  return c.json({ ok: true });
});
