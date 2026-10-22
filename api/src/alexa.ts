import { randomInt } from "node:crypto";
import { DEMO, del, get, put, withFamily } from "./db.js";
import { now } from "./clock.js";
import { matchTopic } from "./claude.js";
import { runAgent } from "./agent.js";
import { addActivity, addFeed, answers, findMemory, logAsk, memories, notSure, profile, showMemory, topics } from "./family.js";

const auth = <T>(fn: () => Promise<T>) => withFamily("AUTH", fn);
const speak = (text: string, end = true) => ({ version: "1.0", response: { outputSpeech: { type: "PlainText", text }, shouldEndSession: end } });

export async function alexaCode(personId: string) {
  const code = String(randomInt(1000, 10000));
  await auth(() => put(`ALEXACODE#${code}`, { personId, expires: new Date(Date.now() + 10 * 60_000).toISOString() }));
  return code;
}

export async function skill(body: any) {
  const req = body?.request ?? {};
  const user = body?.session?.user?.userId ?? body?.context?.System?.user?.userId ?? "";
  const intent: string | undefined = req.intent?.name;
  const slot = (name: string) => req.intent?.slots?.[name]?.value as string | undefined;
  if (req.type === "SessionEndedRequest") return { version: "1.0", response: {} };

  if (intent === "LinkIntent") {
    const code = (slot("code") ?? "").replace(/\D/g, "");
    const c = code && (await auth(() => get(`ALEXACODE#${code}`)));
    if (!c || c.expires < new Date().toISOString()) return speak("That code didn't work. Get a new one in the Lumina app and try again.", false);
    await auth(() => Promise.all([put(`ALEXA#${user}`, { personId: c.personId }), del(`ALEXACODE#${code}`)]));
    const p = await withFamily(`FAM#${c.personId}`, profile);
    return speak(`Done. This Alexa now answers ${p.rosa}'s questions.`);
  }

  const linked = user ? await auth(() => get(`ALEXA#${user}`)) : undefined;
  return withFamily(linked ? `FAM#${linked.personId}` : DEMO, async () => {
    const p = await profile();
    if (req.type === "LaunchRequest" || intent === "AMAZON.HelpIntent") return speak(`Hi ${p.rosa}. What would you like to know?`, false);
    if (intent === "AMAZON.StopIntent" || intent === "AMAZON.CancelIntent" || intent === "AMAZON.NavigateHomeIntent") return speak(`Bye for now, ${p.rosa}.`);
    const said = (slot("question") ?? "").trim();
    if (!said) return speak(`Sorry, ${p.rosa}, could you say that again?`, false);

    const [list, ans] = await Promise.all([topics(), answers()]);
    const topic = await matchTopic(said, list, p);
    const answer = topic ? ans[topic] : undefined;
    if (topic) { await logAsk(topic, !!answer, said); runAgent().catch(() => {}); }
    if (answer) return speak(answer.rosa_text);
    const m = findMemory(await memories(), said);
    if (m) { await showMemory(m); await addActivity(`Showed “${m.title}”`); return speak(m.story); }
    const at = (await now()).toISOString();
    await put(`MSG#${at}`, { text: said, kind: "question", at });
    await addFeed({ kind: "asked", title: `${p.calls} asked something I couldn't answer`, body: `“${said}”` });
    return speak(notSure(p));
  });
}
