import { AnthropicBedrockMantle } from "@anthropic-ai/bedrock-sdk";
import { topicLabel, type Profile, type Topic } from "./family.js";

const offline = process.env.LLM === "offline";
const client = offline ? null : new AnthropicBedrockMantle({ awsRegion: process.env.AWS_REGION ?? "us-east-1" });
const MODEL = process.env.MODEL_ID ?? "anthropic.claude-opus-5-5";
const FAST = process.env.FAST_MODEL_ID ?? "anthropic.claude-haiku-5-5";

export type Source = "claude" | "offline";
type Content = string | Array<Record<string, any>>;

async function complete(system: string, content: Content, maxTokens = 4096): Promise<string | null> {
  if (!client) return null;
  try {
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: maxTokens,
      system,
      output_config: { effort: "low" },
      messages: [{ role: "user", content: content as any }],
    });
    return msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  } catch (e) {
    console.warn("[claude] falling back to offline:", (e as Error).message);
    return null;
  }
}

function parse<T>(text: string | null): T | null {
  const m = text?.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]) as T; } catch { return null; }
}

const who = (p: Profile) => `${p.rosa}${p.age ? ` is ${p.age} and` : ""} has ${(p.condition ?? "memory loss").toLowerCase()}. ${p.rosa} watches TV and talks to a voice assistant, can't hold new information for long, and asks the same questions many times. ${p.ana} is the caregiver; the family calls ${p.rosa} "${p.calls}".`;

export type Check = { rosa_text: string; tv_line: string; issues: string[]; suggestion: string | null; source: Source };

export async function checkAnswer(asked: string, text: string, p: Profile): Promise<Check> {
  const out = parse<Omit<Check, "source">>(await complete(
    `${who(p)}
${p.ana} writes the answer ${p.rosa} hears when asking: "${asked}". ${p.rosa} hears it from the assistant and reads it on the TV.
Check ${p.ana}'s answer. Rules: concrete clock times, never "later" or "soon"; one or two short, calm sentences; spoken to ${p.rosa} by name; keep ${p.ana}'s meaning and warmth; never add facts ${p.ana} didn't give; no medical advice.
Reply with only JSON: {"rosa_text": "what the assistant says to ${p.rosa}", "tv_line": "the TV board line, at most 40 characters, like '${p.ana} is at work. Home at 6:00.'", "issues": ["short note to ${p.ana} about anything that may confuse ${p.rosa}"], "suggestion": "a better rosa_text if there are issues, else null"}`,
    `${p.ana}'s answer: ${text}`,
  ));
  if (out?.rosa_text && out.tv_line) return { ...out, issues: out.issues ?? [], suggestion: out.suggestion ?? null, source: "claude" };
  const vague = text.match(/\b(later|soon|in a while|sometime|in a bit)\b/i) ?? text.match(/\bback\b/i);
  return {
    rosa_text: `${p.rosa}, ${text[0].toLowerCase()}${text.slice(1).replace(/\.$/, "")}.`,
    tv_line: (text.match(/^[^.!?]*[.!?]?/)?.[0] ?? text).slice(0, 40),
    issues: vague ? [`"${vague[0]}" doesn't say when. ${p.rosa} can't hold that, so try a clock time like "home at 6:00".`] : [],
    suggestion: null,
    source: "offline",
  };
}

export type Draft = { title: string; caption: string; story: string; tags: string[]; source: Source };

export async function draftMemory(line: string, image: { data: string; mediaType: string } | undefined, p: Profile): Promise<Draft> {
  const content: Content = image
    ? [{ type: "image", source: { type: "base64", media_type: image.mediaType, data: image.data } }, { type: "text", text: `${p.ana} says: ${line}` }]
    : `${p.ana} says: ${line}`;
  const out = parse<Omit<Draft, "source">>(await complete(
    `${who(p)}
${p.ana} is adding an old family photo to ${p.rosa}'s TV, with one spoken line. Draft the memory card.
Use only ${p.ana}'s line and what is visible. Never invent names, dates or places. Never describe the photo as something you edited or generated.
Reply with only JSON: {"title": "2 to 4 words", "caption": "one warm sentence in ${p.ana}'s voice to ${p.rosa}", "story": "2 or 3 short sentences the assistant can tell ${p.rosa}", "tags": ["5 to 8 lowercase single words for search: places, people, objects, years"]}`,
    content,
  ));
  if (out?.title && out.caption) return { ...out, tags: (out.tags ?? []).map((t) => t.toLowerCase()), source: "claude" };
  const words = line.toLowerCase().match(/[a-zà-ú0-9]{3,}/g) ?? [];
  return { title: line.split(/[,.]/)[0].slice(0, 30), caption: line, story: line, tags: [...new Set(words)].slice(0, 8), source: "offline" };
}

export type Facts = {
  asked: number; askedForAna: number; peak: string | null;
  reminders: { label: string; done: boolean }[]; memories: string[]; steps: { step: string; result: string }[]; messages: string[];
};

export async function eveningNote(f: Facts, p: Profile): Promise<{ text: string; source: Source }> {
  const text = await complete(
    `${who(p)}
Write ${p.ana}'s evening note about ${p.rosa}'s day from the facts below: three short lines, warm and plain, speaking to ${p.ana} as "you" and calling ${p.rosa} "${p.calls}" (for example "${p.calls} asked for you 4 times"). Say when questions peaked. If a step "seemed to help", say exactly that, never "worked" or "fixed". No medical claims and no alarm words. Only the note, no preamble.`,
    JSON.stringify(f),
  );
  if (text?.trim()) return { text: text.trim(), source: "claude" };
  const pills = `${f.reminders.filter((r) => r.done).length}/${f.reminders.length}`;
  return {
    text: [
      `${f.asked < 15 ? "Calm day" : "Busy day"}. Reminders ${pills}.`,
      f.memories.length ? `Enjoyed ${f.memories.join(", ")}.` : "No memories today.",
      `Asked for you ${f.askedForAna}×${f.peak ? `, mostly ${f.peak}` : ""}.`,
    ].join("\n"),
    source: "offline",
  };
}

export type ToolDef = { name: string; description?: string; inputSchema: Record<string, any> };

let fastModel = FAST;

export async function chooseTool(said: string, tools: ToolDef[], context: string, p: Profile, topics: Topic[]): Promise<{ name: string; arguments: Record<string, any>; source: Source; model?: string }> {
  while (client) {
    const model = fastModel;
    try {
      const msg = await client.messages.create({
        model,
        max_tokens: 1024,
        ...(model.includes("haiku") ? { thinking: { type: "disabled" as const } } : {}),
        output_config: { effort: "low" },
        system: `You are the voice assistant in ${p.rosa}'s living room, playing the role of Alexa+. ${who(p)}
Call exactly one tool for what ${p.rosa} just said. For whats_happening, pick the topic whose question or phrasings mean the same, and pass the exact words as "said". If no tool fits, call message_ana with kind "question" and the exact words.
${context}`,
        tools: tools.map((t) => ({ name: t.name, description: t.description ?? "", input_schema: t.inputSchema as any })),
        tool_choice: { type: "auto" },
        messages: [{ role: "user", content: said }],
      });
      const use = msg.content.find((b) => b.type === "tool_use");
      if (use && use.type === "tool_use") return { name: use.name, arguments: use.input as Record<string, any>, source: "claude", model };
      break;
    } catch (e) {
      const m = (e as Error).message;
      if (model !== MODEL && /not_found|does not exist/.test(m)) { console.warn(`[claude] ${model} not enabled; using ${MODEL}`); fastModel = MODEL; continue; }
      console.warn("[claude] tool choice offline:", m);
      break;
    }
  }
  return { ...offlineTool(said, topics), source: "offline" };
}

function offlineTool(said: string, topics: Topic[]): { name: string; arguments: Record<string, any> } {
  const s = said.toLowerCase();
  if (/\b(took|taken|done)\b.*\b(pill|medicine|it)\b|^i took/.test(s)) return { name: "confirm_reminder", arguments: { item: "afternoon_pills" } };
  if (/\b(pill|medicine|tablet)/.test(s)) return { name: "did_i_take", arguments: { item: /morning/.test(s) ? "morning_pills" : "afternoon_pills" } };
  const topic = offlineMatch(said, topics);
  if (topic) return { name: "whats_happening", arguments: { topic, said } };
  if (/\b(porto|house|wedding|cake|beach|photo|picture|remember)\b/.test(s)) return { name: "show_memory", arguments: { query: said } };
  if (/\b(tell ana|send|love)\b/.test(s)) return { name: "message_ana", arguments: { text: said, kind: "message" } };
  return { name: "message_ana", arguments: { text: said, kind: "question" } };
}

export async function matchTopic(text: string, topics: Topic[], p: Profile): Promise<string | null> {
  const out = parse<{ topic: string | null }>(await complete(
    `${who(p)}
${p.rosa} said something to the voice assistant. Which of these questions does it mean?
${topics.map((t) => `${t.id}: ${topicLabel(t)}`).join("\n")}
Reply with only JSON: {"topic": "the id"} or {"topic": null} if none means the same.`,
    text,
  ));
  if (out && (out.topic === null || topics.some((t) => t.id === out.topic))) return out.topic;
  return offlineMatch(text, topics);
}

const STOP = new Set(["what", "what's", "where", "where's", "when", "when's", "who", "how", "the", "and", "are", "you", "your", "did", "does", "for", "this", "that", "that's", "it's", "our", "can", "has", "have", "was", "will", "with"]);
const words = (s: string) => new Set((s.toLowerCase().replace(/’/g, "'").match(/[a-zà-ú']{3,}/g) ?? []).filter((w) => !STOP.has(w)));

export function offlineMatch(text: string, topics: Topic[]) {
  const said = words(text);
  const best = topics.map((t) => [[...words(topicLabel(t))].filter((w) => said.has(w)).length, t.id] as const).sort((a, b) => b[0] - a[0])[0];
  return best && best[0] > 0 ? best[1] : null;
}

export type Fact = { kind: string; text: string };

export async function extractFacts(text: string, p: Profile): Promise<Fact[]> {
  const out = parse<{ facts: Fact[] }>(await complete(
    `${who(p)}
${p.ana} is telling you about ${p.rosa}. Turn it into short facts a caregiver can scan: one idea each, plain words, in the third person.
Kinds: routine, likes, calms (what calms ${p.rosa}), upsets (what upsets ${p.rosa}), people, health, other. Use only what ${p.ana} said; never add, guess or diagnose.
Reply with only JSON: {"facts": [{"kind": "routine", "text": "Naps after lunch, around 2."}]}`,
    text,
  ));
  return out?.facts?.length ? out.facts : [{ kind: "other", text }];
}
