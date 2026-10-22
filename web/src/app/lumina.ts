import { createContext, useContext } from "react";

export type Person = { id: string; name: string; calls?: string; age?: number; condition?: string; devices?: string[]; tvPaired?: boolean; asksToday?: number; open?: number };
export type Me = { account: { id: string; name?: string; role?: string; scope?: string; onboarded?: boolean }; people: Person[] };
export type Answer = { text: string; rosa_text: string; tv_line: string };
export type Memory = { id: string; title: string; caption: string; story?: string; year?: number; calming?: boolean; url: string };
export type Ai = { notify: boolean; tv: boolean; memories: boolean; learn: boolean; analysis: boolean };
export type Family = {
  profile?: { tz?: string };
  topics: Record<string, string>;
  answers: Record<string, Answer>;
  memories: Memory[];
  reminders: { id: string; label: string; time: string; doneToday: boolean }[];
  playbook: { id: string; label: string; enabled: boolean }[];
  ai?: Ai;
  clock: { time: string; ampm: string; hour: number };
};
export type Feed = { id: string; at: string; kind: string; title: string; body?: string; why?: string; result?: string; actions?: string; rating?: string; decision?: string; memory?: string };
export type Topic = { id: string; question: string; phrasings: string[]; pin?: boolean; answer: Answer | null };
export type Patterns = {
  topics: { id: string; question: string; week: number; today: number; byHour: number[] }[];
  unanswered: { id: string; at: string; text: string }[];
  learning?: { day: number; of: number };
};
export type Check = { rosa_text: string; tv_line: string; issues: string[]; suggestion?: string };

export const read = (k: string) => { try { return localStorage.getItem(k) ?? ""; } catch { return ""; } };
export const store = (k: string, v: string) => { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch {} };

export const auth = { session: read("lumina-session"), person: read("lumina-person") };

export async function call<T = any>(path: string, body?: unknown, method = body === undefined ? "GET" : "POST"): Promise<T> {
  const r = await fetch(path, {
    method,
    headers: {
      "content-type": "application/json",
      ...(auth.session ? { authorization: `Bearer ${auth.session}` } : {}),
      ...(auth.person ? { "x-lumina-person": auth.person } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (r.status === 401) window.dispatchEvent(new Event("lumina:signout"));
  if (!r.ok) throw new Error(`${method} ${path}: ${r.status}`);
  return r.json();
}

export const slug = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).join("_");
export const feedPath = (id: string) => `/api/phone/feed/${encodeURIComponent(id)}`;

export type Lumina = {
  me: Me | null;
  person?: Person;
  calls: string;
  family: Family | null;
  feed: Feed[];
  topics: Topic[];
  patterns: Patterns | null;
  key: string;
  offline: boolean;
  refresh: () => Promise<void>;
  send: (path: string, body: unknown, method?: string) => Promise<void>;
  show: (id: string) => void;
  loadMe: () => Promise<Me | undefined>;
  signIn: (body: object) => Promise<Me>;
  signOut: () => void;
  setAdding: (on: boolean) => void;
  setKey: (key: string) => void;
  media: (url: string) => string | undefined;
  time: (iso: string) => string;
};

export const Ctx = createContext<Lumina>(null!);
export const useLumina = () => useContext(Ctx);
