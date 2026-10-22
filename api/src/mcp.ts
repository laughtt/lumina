import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { get, put } from "./db.js";
import { local, now } from "./clock.js";
import { runAgent } from "./agent.js";
import { addActivity, addFeed, ai, answers, confirmReminder, findMemory, logAsk, memories, notSure, profile, reminders, resolve, showMemory, topicLabel, topics, tvView, type Reminder } from "./family.js";
import { matchTopic } from "./claude.js";

const say = (text: string) => ({ content: [{ type: "text" as const, text }] });
const CARD = "ui://lumina/today";

export async function buildServer() {
  const [p, list, rems] = await Promise.all([profile(), topics(), reminders()]);
  const { rosa, ana, calls } = p;
  const NOT_SURE = notSure(p);
  const server = new McpServer(
    { name: "lumina", version: "0.1.0" },
    { instructions: `Lumina answers ${rosa}'s everyday questions in ${ana}'s approved words, and drives ${rosa}'s TV. Read tool results to ${rosa} exactly as written.` },
  );
  const ids = rems.map((r) => r.id);
  const topicIds = list.map((t) => t.id);
  const item = z.enum((ids.length ? ids : ["afternoon_pills"]) as [string, ...string[]]).describe("Which reminder: " + ids.join(", "));

  server.registerTool("whats_happening", {
    title: "What's happening",
    description: `Answer ${rosa}'s everyday questions with the answer ${ana} approved, word for word. Topics: ${list.map((t) => `${t.id} (${topicLabel(t)})`).join("; ")}.`,
    inputSchema: {
      topic: z.enum((topicIds.length ? topicIds : ["none"]) as [string, ...string[]]),
      said: z.string().optional().describe(`${rosa}'s words, verbatim`),
    },
    _meta: { ui: { resourceUri: CARD } },
  }, async ({ topic, said }) => {
    const a = (await answers())[topic];
    await logAsk(topic, !!a, said);
    runAgent().catch(() => {});
    if (!a) {
      await addFeed({ kind: "asked", title: `${calls} asked “${list.find((t) => t.id === topic)?.question ?? topic}”`, body: "There's no answer for this yet. Add one so Lumina can answer her." });
      return say(NOT_SURE);
    }
    return say(a.rosa_text);
  });

  server.registerTool("show_memory", {
    title: "Show a memory",
    description: `${rosa} is talking about a family memory (a place, a person, an event). Finds ${ana}'s photo for it, shows it on the TV and returns ${ana}'s story to tell.`,
    inputSchema: { query: z.string().describe(`What ${rosa} said, e.g. 'our house in Porto' or 'the wedding'`) },
  }, async ({ query }) => {
    const m = findMemory(await memories(), query);
    if (!m) {
      await addFeed({ kind: "asked", title: `${calls} talked about a memory I don't have`, body: `“${query}”. Add a photo for it?` });
      return say(`I don't have that photo yet, ${rosa}. I'll ask ${ana} to add it.`);
    }
    await showMemory(m);
    await addActivity(`Showed “${m.title}”`);
    return say(m.story);
  });

  server.registerTool("did_i_take", {
    title: "Did I take it?",
    description: `${rosa} asks whether they already took a medicine or did a routine. Reads the confirmation log only. Never gives dosing advice.`,
    inputSchema: { item },
    annotations: { readOnlyHint: true },
  }, async ({ item }) => {
    const r = await get<Reminder>(`REMINDER#${item}`);
    if (!r) return say(NOT_SURE);
    const today = local(await now()).date;
    return say(r.doneOn === today
      ? `Yes, ${rosa}. You took them at ${r.doneAt}. You pressed Done.`
      : `Not yet, ${rosa}. They're in the ${r.where}. Say "I took it" when you're done.`);
  });

  server.registerTool("confirm_reminder", {
    title: "Confirm a reminder",
    description: `${rosa} says they did it ("I took it"). Marks the reminder done, clears the TV banner and tells ${ana}.`,
    inputSchema: { item },
  }, async ({ item }) => {
    const r = await confirmReminder(item);
    return say(r ? `Thank you, ${rosa}. I'll tell ${ana}.` : NOT_SURE);
  });

  server.registerTool("message_ana", {
    title: `Message ${ana}`,
    description: `Send ${ana} a message from ${rosa}. Use kind 'question' when ${rosa} asked something no other tool can answer.`,
    inputSchema: { text: z.string(), kind: z.enum(["message", "question"]).default("message") },
  }, async ({ text, kind }) => {
    const at = (await now()).toISOString();
    await put(`MSG#${at}`, { text, kind, at });
    if (kind === "question" && (await ai()).learn) {
      const [list, p, ans] = await Promise.all([topics(), profile(), answers()]);
      const topic = await matchTopic(text, list, p);
      const answer = topic ? ans[topic] : undefined;
      if (topic && answer) {
        await resolve(`MSG#${at}`, topic);
        await logAsk(topic, true, text);
        await addFeed({ kind: "agent", title: `Lumina learned a new way ${calls} asks`, body: `“${text}” now gets your answer to “${list.find((t) => t.id === topic)!.question}”.`, actions: "rate" });
        return say(answer.rosa_text);
      }
    }
    await addFeed(kind === "question"
      ? { kind: "asked", title: `${calls} asked something I couldn't answer`, body: `“${text}”` }
      : { kind: "message", title: `${calls} says`, body: `“${text}”` });
    return say(kind === "question" ? NOT_SURE : `I sent it to ${ana}, ${rosa}.`);
  });

  server.registerResource("today-card", CARD, { title: `${rosa}'s Today board`, mimeType: "text/html;profile=mcp-app" }, async (uri) => {
    const v = await tvView();
    const html = `<!doctype html><meta charset="utf-8"><body style="margin:0;font:20px system-ui;background:#0d1420;color:#f6efe3;padding:24px">
<div style="opacity:.8">${v.day}</div><div style="font:700 56px ui-monospace,monospace">${v.time} <small style="font-size:24px">${v.ampm}</small></div>
${v.status ? `<div style="margin-top:12px;padding:12px 16px;border-radius:12px;background:#ffffff14">${v.status}</div>` : ""}
${v.next ? `<div style="margin-top:8px;opacity:.85">Next: ${v.next}</div>` : ""}</body>`;
    return { contents: [{ uri: uri.href, mimeType: "text/html;profile=mcp-app", text: html }] };
  });

  return server;
}
