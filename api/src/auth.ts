import { createPublicKey, randomBytes, verify } from "node:crypto";
import { DEMO, del, get, put, putMany, query, withFamily } from "./db.js";
import { local, now, TZ } from "./clock.js";
import { profile, unanswered } from "./family.js";

const auth = <T>(fn: () => Promise<T>) => withFamily("AUTH", fn);
const acct = <T>(id: string, fn: () => Promise<T>) => withFamily(`ACCT#${id}`, fn);
const random = (bytes = 18) => randomBytes(bytes).toString("base64url");

async function verifyToken(jwt: string, keysUrl: string, issuers: string[], aud: string) {
  const [h, p, sig] = jwt.split(".");
  const header = JSON.parse(Buffer.from(h, "base64url").toString());
  const claims = JSON.parse(Buffer.from(p, "base64url").toString());
  const { keys } = await (await fetch(keysUrl)).json();
  const jwk = keys.find((k: any) => k.kid === header.kid);
  const ok = jwk && verify("RSA-SHA256", Buffer.from(`${h}.${p}`), createPublicKey({ key: jwk, format: "jwk" }), Buffer.from(sig, "base64url"));
  return ok && issuers.includes(claims.iss) && claims.aud === aud && claims.exp * 1000 > Date.now() ? claims : null;
}

export const appleSub = async (jwt: string) =>
  (await verifyToken(jwt, "https://appleid.apple.com/auth/keys", ["https://appleid.apple.com"], "com.lumina.ana"))?.sub as string | undefined;

export const googleUser = async (jwt: string) => process.env.GOOGLE_CLIENT_ID
  ? verifyToken(jwt, "https://www.googleapis.com/oauth2/v3/certs", ["accounts.google.com", "https://accounts.google.com"], process.env.GOOGLE_CLIENT_ID)
  : null;

export async function linkedAccount(provider: "APPLE" | "GOOGLE", sub: string, name?: string) {
  const known = await auth(() => get(`${provider}#${sub}`));
  if (known) return known.accountId as string;
  const id = await newAccount(name);
  await auth(() => put(`${provider}#${sub}`, { accountId: id }));
  return id;
}

export async function newAccount(name?: string) {
  const id = random(9);
  await acct(id, () => put("PROFILE", { name: name ?? null, role: null, scope: null, onboarded: false }));
  return id;
}

export async function demoAccount() {
  if (!(await acct("demo", () => get("PROFILE")))) {
    await acct("demo", () => putMany([
      { sk: "PROFILE", item: { name: "Ana", role: "family", scope: "one", onboarded: true } },
      { sk: "PERSON#rosa", item: { id: "rosa" } },
    ]));
  }
  return "demo";
}

export async function signIn(accountId: string) {
  const session = `s_${random(24)}`;
  await auth(() => put(`SESSION#${session}`, { accountId, at: new Date().toISOString() }));
  return { session, account: await account(accountId) };
}

export const caller = (token: string) => auth(() => get(token.startsWith("s_") ? `SESSION#${token}` : `KEY#${token}`));
export const owns = (accountId: string, personId: string) => acct(accountId, () => get(`PERSON#${personId}`));

export async function account(id: string) {
  const { PK, SK, ...p } = (await acct(id, () => get("PROFILE")))!;
  return { id, ...p };
}

export async function updateAccount(id: string, body: Record<string, any>) {
  const patch = Object.fromEntries(["name", "role", "scope", "onboarded"].filter((k) => k in body).map((k) => [k, body[k]]));
  await acct(id, async () => put("PROFILE", { ...(await get("PROFILE")), ...patch }));
}

export async function people(accountId: string) {
  const list = await acct(accountId, () => query("PERSON#"));
  return Promise.all(list.map(({ id }) => withFamily(`FAM#${id}`, async () => {
    const d = await now();
    const [p, asks, open] = await Promise.all([profile(), query("ASK#", { after: new Date(d.getTime() - local(d).minutes * 60_000).toISOString() }), unanswered()]);
    return { id, name: p.rosa, calls: p.calls, age: p.age ?? null, condition: p.condition ?? null, devices: p.devices ?? [], tvPaired: !!p.tvPaired, asksToday: asks.length, open: open.length };
  })));
}

const PLAYBOOK = [
  { id: "bigger_answer", label: "Show my answer bigger on the TV", tier: 1, enabled: true },
  { id: "calming_memory", label: "Switch to the photos they love", tier: 1, enabled: true },
  { id: "music", label: "Play the music I picked for them", tier: 1, enabled: false },
];

const renamed = (item: Record<string, any>, b: { name: string; calls: string; caregiver: string }) => item.data ? item
  : JSON.parse(JSON.stringify(item).replace(/\bRosa\b/g, b.name).replace(/\bMom\b/g, b.calls).replace(/\bAna\b/g, b.caregiver));

export async function addPerson(accountId: string, b: { name: string; calls: string; age?: number; condition?: string; caregiver: string; devices: string[]; demo?: "history" | "full" }) {
  const id = `${b.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 20)}-${randomBytes(3).toString("hex")}`;
  const key = random();
  const demo = b.demo ? await withFamily(DEMO, () => query("")) : [];
  const rest = b.demo
    ? demo.filter((x) => !(b.demo === "full" ? /^(PROFILE|CLOCK)/ : /^(PROFILE|CLOCK|TOPIC#|ANSWER#)/).test(x.SK)).map(({ PK, SK, ...item }) => ({ sk: SK as string, item: renamed(item, b) }))
    : [{ sk: "TV", item: { screen: "today", activity: [] } }, ...PLAYBOOK.map((p) => ({ sk: `PLAYBOOK#${p.id}`, item: p }))];
  const backups = demo.find((x) => x.SK === "PROFILE")?.backups ?? [];
  await withFamily(`FAM#${id}`, () => putMany([
    { sk: "PROFILE", item: { rosa: b.name, ana: b.caregiver, calls: b.calls, age: b.age, condition: b.condition, devices: b.devices, tvPaired: false, backups, tz: TZ, key, createdAt: new Date().toISOString() } },
    ...rest,
  ]));
  await auth(() => put(`KEY#${key}`, { personId: id }));
  await acct(accountId, () => put(`PERSON#${id}`, { id }));
  return { id, key };
}

export async function shareLink(personId: string, fresh = false) {
  const p = await withFamily(`FAM#${personId}`, () => get("PROFILE"));
  if (p?.share && !fresh) return p.share as string;
  if (p?.share) await auth(() => del(`SHARE#${p.share}`));
  const token = random(12);
  await auth(() => put(`SHARE#${token}`, { personId }));
  await withFamily(`FAM#${personId}`, () => put("PROFILE", { ...p, share: token }));
  return token;
}
export const shared = (token: string) => auth(() => get(`SHARE#${token}`));

const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export async function startPairing() {
  const code = [...randomBytes(6)].map((b) => LETTERS[b % 32]).join("");
  const secret = random();
  const expires = new Date(Date.now() + 10 * 60_000).toISOString();
  await auth(() => putMany([{ sk: `CODE#${code}`, item: { secret, expires } }, { sk: `PAIR#${secret}`, item: { expires } }]));
  return { code, secret };
}

export async function pairing(secret: string) {
  const p = await auth(() => get(`PAIR#${secret}`));
  return p && p.expires > new Date().toISOString() ? p : undefined;
}

export async function claim(code: string, key: string) {
  const c = await auth(() => get(`CODE#${code.toUpperCase().replace(/[^A-Z0-9]/g, "")}`));
  if (!c || c.expires < new Date().toISOString()) return false;
  await auth(() => put(`PAIR#${c.secret}`, { expires: c.expires, token: key }));
  return true;
}
