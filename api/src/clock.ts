import { DEMO, get, put, withFamily } from "./db.js";

export const TZ = process.env.FAMILY_TZ ?? "America/New_York";
let cache = { offset: 0, at: 0 };

export async function offsetMs() {
  if (Date.now() - cache.at > 1500) cache = { offset: (await withFamily(DEMO, () => get("CLOCK")))?.offsetMs ?? 0, at: Date.now() };
  return cache.offset;
}

export async function now() {
  return new Date(Date.now() + (await offsetMs()));
}

export function local(d: Date) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", weekday: "long",
    }).formatToParts(d).map((x) => [x.type, x.value]),
  );
  const hour = Number(p.hour), minute = Number(p.minute);
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    hour, minute,
    minutes: hour * 60 + minute,
    weekday: p.weekday,
    dayLabel: new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "long", month: "long", day: "numeric" }).format(d),
    time: `${hour % 12 || 12}:${String(minute).padStart(2, "0")}`,
    ampm: hour < 12 ? "am" : "pm",
  };
}

export const hhmmToMinutes = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
export const minutesLabel = (m: number) => `${Math.floor(m / 60) % 12 || 12}:${String(m % 60).padStart(2, "0")}${m < 720 ? " am" : " pm"}`;

export async function setClock(hhmm: string | null) {
  let offset = 0;
  if (hhmm) {
    const real = local(new Date());
    offset = (hhmmToMinutes(hhmm) - real.minutes) * 60_000 - new Date().getSeconds() * 1000;
  }
  await withFamily(DEMO, () => put("CLOCK", { offsetMs: offset }));
  cache = { offset, at: Date.now() };
}

export async function advance(minutes: number) {
  const offset = (await offsetMs()) + minutes * 60_000;
  await withFamily(DEMO, () => put("CLOCK", { offsetMs: offset }));
  cache = { offset, at: Date.now() };
}
