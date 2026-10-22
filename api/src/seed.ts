import { pathToFileURL } from "node:url";
import { ensureTable, get, putMany, wipe, type Item } from "./db.js";
import { local, setClock, TZ } from "./clock.js";
import { photos } from "./photos.js";

const LABEL = "Demo photo · Unsplash";

export async function seed() {
  await ensureTable();
  await wipe();
  await setClock(null);
  const now = new Date();
  const t = local(now);
  const at = now.toISOString();
  const items: { sk: string; item: Item }[] = [];
  const add = (sk: string, item: Item) => items.push({ sk, item });

  add("PROFILE", {
    rosa: "Rosa", ana: "Ana", calls: "Mom", age: 76, condition: "Early Alzheimer's", devices: ["firetv", "alexa"], tvPaired: true,
    backups: [{ name: "Luis", relation: "brother" }], tz: TZ, createdAt: new Date(now.getTime() - 21 * 86_400_000).toISOString(),
  });

  const topics = [
    { id: "where_is_ana", question: "Where's Ana?", phrasings: ["Is my girl coming?", "Where's my girl?", "Is Ana coming home?", "Where is my daughter?"], pin: true },
    { id: "today", question: "What's happening today?", phrasings: ["What day is it?", "What are we doing today?", "Is anything happening today?"], pin: false },
    { id: "next", question: "What's next?", phrasings: ["What happens next?", "What do I do now?", "What's after this?"], pin: false },
    { id: "meals", question: "When do I eat?", phrasings: ["What's for lunch?", "When's lunch?", "What's for dinner?", "I'm hungry"], pin: true },
  ];
  topics.forEach((x, i) => add(`TOPIC#${x.id}`, { ...x, at: new Date(now.getTime() - 22 * 86_400_000 + i * 1000).toISOString() }));
  const said = (topic: string, n: number) => {
    const x = topics.find((y) => y.id === topic)!;
    return [x.question, ...x.phrasings][n % (x.phrasings.length + 1)];
  };

  const answers = [
    { topic: "where_is_ana", text: "At work, home at 6.", rosa_text: "Ana is at work, Rosa. She's home at six o'clock.", tv_line: "Ana is at work. Home at 6:00." },
    { topic: "meals", text: "Soup for lunch, in the fridge.", rosa_text: "Lunch is in the fridge, Rosa. Caldo verde, on the top shelf.", tv_line: "Lunch is soup, in the fridge." },
    { topic: "today", text: "Normal Monday, Luis calls at 7.", rosa_text: "Today is a quiet day at home, Rosa. Ana is at work until six, and Luis calls at seven.", tv_line: "Luis calls at 7:00 tonight." },
    { topic: "next", text: "Pill at 2, then I'm home at 6.", rosa_text: "Your two o'clock pill is next, Rosa. Then Ana is home at six.", tv_line: "Your pill at 2:00, then Ana at 6:00." },
  ];
  for (const a of answers) add(`ANSWER#${a.topic}`, { ...a, approvedAt: at });

  const memories = [
    { id: "father-1953", year: 1953, title: "Papá by the river", caption: "Your father, with you on his shoulders and little Luis.",
      story: "This is your father by the river in Braga, in 1953. You rode on his shoulders and Luis held his hand. He sang the whole way home.",
      tags: ["father", "papa", "dad", "river", "braga", "luis", "1953"] },
    { id: "garden-1955", year: 1955, title: "Mamã's garden", caption: "Your mother holding Luis, with you and cousin Fátima.",
      story: "This is your mother's garden, in 1955. She is holding Luis, and you and cousin Fátima sat very still for the picture.",
      tags: ["mother", "mama", "garden", "luis", "fatima", "cousin", "1955"] },
    { id: "braga-1956", year: 1956, title: "Home in Braga", caption: "You, Luis and your parents, the spring of 1956.",
      story: "This is your family's house in Braga, in the spring of 1956. Your mother grew roses along that fence.",
      tags: ["braga", "home", "house", "parents", "luis", "roses", "1956"] },
    { id: "nazare-1959", year: 1959, title: "Summer in Nazaré", caption: "Luis and cousin Zé, with Tia Graça by the sea.",
      story: "This is Nazaré, the summer of 1959. Luis learned to swim that week, and Tia Graça bought sardines from the boats every evening.",
      tags: ["nazare", "beach", "summer", "luis", "sea", "graca", "1959"] },
    { id: "family-1962", year: 1962, title: "Avó Amélia's birthday", caption: "The whole family, on the steps of the old house.",
      story: "This is your grandmother Amélia's eightieth birthday, in 1962. Everyone came, and you helped bake the cake.",
      tags: ["grandmother", "amelia", "birthday", "family", "cake", "1962"] },
    { id: "wedding-1972", year: 1972, title: "Your wedding day", caption: "Dancing with your friends in Braga.",
      story: "This is your wedding day in Braga, in 1972. You wore your mother's lace, and you danced until the music stopped.",
      tags: ["wedding", "braga", "church", "married", "dress", "dance", "1972"] },
    { id: "porto-1984", year: 1984, title: "Porto, our city", caption: "Sunday walks along the Ribeira.", calming: true,
      story: "This is Porto, where you lived for forty years. Every Sunday you walked along the Ribeira and watched the boats on the Douro.",
      tags: ["porto", "ribeira", "douro", "river", "boats", "home", "city", "1984"] },
    { id: "tiago-2019", year: 2019, title: "Hugs from Tiago", caption: "Luis's grandson, the summer he stayed with you.",
      story: "This is Tiago, Luis's grandson, in 2019. He stayed with you all summer and wouldn't let you go at the station.",
      tags: ["tiago", "luis", "grandson", "hug", "summer", "2019"] },
    { id: "ines-2021", year: 2021, title: "Meeting Inês", caption: "Ana's daughter, the day she came home.",
      story: "This is Inês, Ana's daughter, the day she came home in 2021. You held her for an hour and sang her your lullaby.",
      tags: ["ines", "ana", "baby", "granddaughter", "lullaby", "2021"] },
    { id: "kitchen-2025", year: 2025, title: "Baking with Inês", caption: "Your orange cake, the way you taught Ana.",
      story: "This is your kitchen, last spring. You taught Inês your orange cake, the same way you taught Ana.",
      tags: ["kitchen", "baking", "cake", "orange", "ines", "cooking", "recipe"] },
  ];
  for (const m of memories) {
    add(`MEMORY#${m.id}`, { ...m, photoKey: m.id, label: LABEL });
    add(`MEDIA#${m.id}`, { contentType: "image/jpeg", data: photos[m.id] });
  }

  add("REMINDER#morning_pills", { id: "morning_pills", label: "morning pills", spoken: "Time for your morning pills", time: "09:00", where: "blue box on the kitchen table", doneOn: t.date, doneAt: "9:07 am" });
  add("REMINDER#afternoon_pills", { id: "afternoon_pills", label: "afternoon pill", spoken: "Time for your afternoon pill", time: "14:00", where: "blue box on the kitchen table" });

  const playbook = [
    { id: "bigger_answer", label: "Show my answer bigger on the TV", tier: 1, enabled: true },
    { id: "calming_memory", label: "Switch to the Porto photos she loves", tier: 1, enabled: true },
    { id: "music", label: "Play the music I picked for her", tier: 1, enabled: false },
    { id: "call_luis", label: "Ask Luis to call Mom (I approve first)", tier: 2, enabled: true },
  ];
  for (const p of playbook) add(`PLAYBOOK#${p.id}`, p);

  const rate: Record<number, number> = { 8: 0.2, 9: 0.3, 10: 0.3, 11: 0.4, 12: 0.5, 13: 0.6, 14: 0.8, 15: 1.2, 16: 1.6, 17: 1.4, 18: 0.6, 19: 0.4, 20: 0.3, 21: 0.2 };
  let s = 42;
  const rand = () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const midnight = now.getTime() - t.minutes * 60_000;
  for (let day = 21; day >= 1; day--) {
    for (const [h, r] of Object.entries(rate)) {
      const n = Math.floor(r + rand() * 0.9);
      for (let i = 0; i < n; i++) {
        const when = new Date(midnight - day * 86_400_000 + (Number(h) * 60 + Math.floor(rand() * 60)) * 60_000).toISOString();
        add(`ASK#${when}#${i}${day}`, { topic: "where_is_ana", answered: true, at: when, said: said("where_is_ana", day + Number(h) + i) });
      }
      if ((h === "11" || h === "12") && rand() < 0.5) {
        const when = new Date(midnight - day * 86_400_000 + (Number(h) * 60 + 20) * 60_000).toISOString();
        add(`ASK#${when}#m${day}`, { topic: "meals", answered: true, at: when, said: said("meals", day) });
      }
    }
  }

  for (const [minutes, text] of [[10 * 60 + 12, "Where are my glasses?"], [16 * 60 + 40, "Is it Sunday today?"]] as const) {
    const when = new Date(midnight - 86_400_000 + minutes * 60_000).toISOString();
    add(`MSG#${when}`, { text, kind: "question", at: when });
  }

  add("TV", { screen: "today", activity: [] });
  await putMany(items);
  return { items: items.length };
}

export async function seedIfEmpty() {
  await ensureTable();
  if (!(await get("PROFILE"))) console.log("[seed]", await seed());
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) seed().then((r) => console.log("[seed]", r));
