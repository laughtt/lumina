import React, { useEffect, useRef, useState } from "react";
import { Image, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";

export type TvView = {
  v: string; day: string; time: string; ampm: string; part: "morning" | "afternoon" | "evening" | "night"; ana: string;
  status: string | null; statusFrom: string | null; line2: string | null; next: string | null;
  banner: { id: string; text: string; where: string } | null;
  screen: "today" | "memory";
  memory: { id: string; title: string; caption: string; label: string | null; url: string } | null;
  big: { text: string } | null; pulse: string | null;
  activity: { time: string; line: string }[];
};

const LIGHT = { morning: "#CFE3EE", afternoon: "#F2C46D", evening: "#B9A0D6", night: "#4A5C8A" };
const FONT = Platform.OS === "web" ? "'Lumina Digits', 'Atkinson Hyperlegible Next', system-ui, sans-serif" : undefined;
const GOLD = "#F2B33D";

export function TvApp({ api, token: given, pair = false, onPaired }: { api: string; token?: string; pair?: boolean; onPaired?: (token: string) => void }) {
  const { width } = useWindowDimensions();
  const [view, setView] = useState<TvView | null>(null);
  const [focus, setFocus] = useState(0);
  const [token, setToken] = useState(given);
  const [pairing, setPairing] = useState(pair);
  const [code, setCode] = useState("");
  const version = useRef("");
  const headers: Record<string, string> = { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) };

  useEffect(() => {
    if (pairing) return;
    let alive = true;
    const poll = async () => {
      try {
        const r = await fetch(`${api}/api/tv?v=${version.current}`, { headers });
        if (r.status === 401 && alive) setPairing(true);
        if (r.status === 200) {
          const v: TvView = await r.json();
          version.current = v.v;
          if (alive) setView(v);
        }
      } catch {}
    };
    poll();
    const id = setInterval(poll, 2000);
    return () => { alive = false; clearInterval(id); };
  }, [api, token, pairing]);

  useEffect(() => {
    if (!pairing) return;
    let alive = true, secret = "";
    const poll = async () => {
      try {
        if (!secret) {
          const p = await (await fetch(`${api}/api/tv/pair`, { method: "POST" })).json();
          secret = p.secret;
          if (alive) setCode(p.code);
          return;
        }
        const r = await fetch(`${api}/api/tv/pair/${secret}`);
        if (r.status === 404) secret = "";
        if (r.status === 200 && alive) {
          const { token: key } = await r.json();
          version.current = "";
          setToken(key);
          setPairing(false);
          onPaired?.(key);
        }
      } catch {}
    };
    poll();
    const id = setInterval(poll, 2000);
    return () => { alive = false; clearInterval(id); };
  }, [api, pairing]);

  const press = async (button: string) => {
    const r = await fetch(`${api}/api/tv/press`, { method: "POST", headers, body: JSON.stringify({ button }) });
    const v: TvView = await r.json();
    version.current = v.v;
    setView(v);
  };

  const fit = Platform.OS === "web" ? undefined : { transform: [{ scale: width / 1920 }], transformOrigin: "top left" as const };
  if (pairing) {
    return (
      <View style={[s.screen, fit, s.pair]}>
        <Text style={s.pairText}>To connect this TV, open Lumina on your phone and enter</Text>
        <Text style={s.pairCode}>{code ? `${code.slice(0, 3)} ${code.slice(3)}` : "…"}</Text>
      </View>
    );
  }
  if (!view) return <View style={[s.screen, fit, { justifyContent: "center", alignItems: "center" }]}><Text style={s.dim}>Lumina</Text></View>;

  const buttons = view.screen === "memory"
    ? [["Today", "back"], ["Next photo", "next"], [`Tell ${view.ana} ❤`, "tell_ana"]]
    : [["Memories", "memories"], [view.banner ? "Done ✓" : "Done", "done"], [`Tell ${view.ana} ❤`, "tell_ana"]];

  return (
    <View style={[s.screen, fit]}>
      <View style={[s.light, { backgroundColor: LIGHT[view.part] }]} />
      {view.screen === "memory" && view.memory ? (
        <Memory memory={view.memory} ana={view.ana} src={`${api}${view.memory.url}?png=1${token ? `&t=${token}` : ""}`} />
      ) : (
        <Today view={view} />
      )}
      {view.banner && view.screen === "today" ? (
        <View style={s.banner}>
          <Text style={s.bannerText}>{view.banner.text}. It's in the {view.banner.where}.</Text>
          <Text style={s.bannerHint}>Press Done when you've taken it.</Text>
        </View>
      ) : null}
      <View style={s.buttons}>
        {buttons.map(([label, id], i) => (
          <Pressable
            key={id}
            focusable
            onFocus={() => setFocus(i)}
            onPress={() => press(id)}
            style={[s.button, focus === i && s.buttonFocus]}
            {...(Platform.OS === "web" ? {} : { hasTVPreferredFocus: i === 0 })}
            accessibilityRole="button"
            accessibilityLabel={label}
          >
            <Text style={[s.buttonText, focus === i && { color: "#1F2638" }]}>{label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function Today({ view }: { view: TvView }) {
  const asked = view.pulse === "where_is_ana";
  return (
    <View style={s.today}>
      <View style={s.when}>
        <Text style={s.day}>{view.day}</Text>
        <View style={s.clockRow}>
          <Text style={s.clock}>{view.time}</Text>
          <Text style={s.ampm}>{view.ampm}</Text>
        </View>
        <Text style={[s.part, { color: LIGHT[view.part] }]}>It's {view.part === "night" ? "night" : `the ${view.part}`}.</Text>
        {view.activity[0] ? (
          <Text style={s.activity}>What Lumina did today: {view.activity[0].time}, {view.activity[0].line[0].toLowerCase() + view.activity[0].line.slice(1)}</Text>
        ) : null}
      </View>
      <View style={s.side}>
        {view.big ? (
          <View style={[s.card, s.cardBig]}>
            <Text style={s.from}>From {view.ana}</Text>
            <Text style={s.bigText}>{view.big.text}</Text>
          </View>
        ) : (
          <>
            {view.status ? (
              <View style={[s.card, asked && s.cardAsked]}>
                <Text style={s.from}>From {view.ana}{view.statusFrom ? ` at ${view.statusFrom}` : ""}</Text>
                <Text style={s.status}>{view.status}</Text>
              </View>
            ) : null}
            {view.line2 ? <Text style={s.line}>{view.line2}</Text> : null}
            {view.next ? <Text style={s.next}>Next: {view.next}</Text> : null}
          </>
        )}
      </View>
    </View>
  );
}

const FADE = Array.from({ length: 24 }, (_, i) => +(0.8 * ((i + 1) / 24) ** 1.6).toFixed(3));

function Memory({ memory, ana, src }: { memory: NonNullable<TvView["memory"]>; ana: string; src: string }) {
  return (
    <View style={StyleSheet.absoluteFill}>
      <Image source={{ uri: src }} style={s.memoryPhoto} resizeMode="cover" accessibilityLabel={memory.title} />
      <View style={s.memoryFade} pointerEvents="none">
        {FADE.map((o) => <View key={o} style={{ flex: 1, backgroundColor: `rgba(10,14,24,${o})` }} />)}
      </View>
      <View style={s.memoryShade}>
        <Text style={s.memoryTitle}>{memory.title}</Text>
        <Text style={s.memoryCaption}>{ana} says: “{memory.caption}”</Text>
        {memory.label ? <Text style={s.memoryLabel}>{memory.label}</Text> : null}
      </View>
    </View>
  );
}

const ink = "#FFF4DE";
const s = StyleSheet.create({
  screen: { width: 1920, height: 1080, backgroundColor: "#0E1626", overflow: "hidden" },
  light: { position: "absolute", left: 0, right: 0, top: 0, height: 14 },
  dim: { color: "#8C97AE", fontSize: 64, fontFamily: FONT },
  pair: { justifyContent: "center", alignItems: "center", paddingHorizontal: 120 },
  pairText: { color: ink, fontSize: 56, lineHeight: 72, fontWeight: "600", textAlign: "center", fontFamily: FONT },
  pairCode: { color: GOLD, fontSize: 220, fontWeight: "700", letterSpacing: 24, marginTop: 48, fontFamily: FONT },
  today: { position: "absolute", left: 120, right: 120, top: 96, bottom: 260, flexDirection: "row" },
  when: { flex: 1, paddingRight: 80 },
  day: { color: ink, fontSize: 72, fontWeight: "600", fontFamily: FONT },
  clockRow: { flexDirection: "row", alignItems: "flex-end", marginTop: 8 },
  clock: { color: ink, fontSize: 260, lineHeight: 280, fontWeight: "300", fontFamily: FONT, letterSpacing: -6 },
  ampm: { color: ink, fontSize: 88, marginLeft: 20, marginBottom: 40, fontFamily: FONT },
  part: { fontSize: 64, fontWeight: "600", fontFamily: FONT },
  activity: { color: "#A9B4C9", fontSize: 34, marginTop: 56, fontFamily: FONT, maxWidth: 760 },
  side: { width: 820, justifyContent: "center" },
  card: { backgroundColor: "#1B2740", borderRadius: 28, padding: 48, borderWidth: 6, borderColor: "#1B2740" },
  cardAsked: { borderColor: GOLD },
  cardBig: { borderColor: GOLD, paddingVertical: 64 },
  from: { color: GOLD, fontSize: 40, fontWeight: "700", marginBottom: 12, fontFamily: FONT },
  status: { color: ink, fontSize: 76, lineHeight: 92, fontWeight: "700", fontFamily: FONT },
  bigText: { color: ink, fontSize: 92, lineHeight: 112, fontWeight: "700", fontFamily: FONT },
  line: { color: ink, fontSize: 52, marginTop: 44, fontFamily: FONT },
  next: { color: "#C9D2E3", fontSize: 52, marginTop: 20, fontFamily: FONT },
  banner: { position: "absolute", left: 120, right: 120, bottom: 230, backgroundColor: GOLD, borderRadius: 24, paddingHorizontal: 48, paddingVertical: 28 },
  bannerText: { color: "#1F2638", fontSize: 56, fontWeight: "700", fontFamily: FONT },
  bannerHint: { color: "#1F2638", fontSize: 40, marginTop: 6, fontFamily: FONT },
  buttons: { position: "absolute", left: 120, right: 120, bottom: 64, flexDirection: "row", justifyContent: "center" },
  button: { width: 440, height: 128, marginHorizontal: 24, borderRadius: 64, backgroundColor: "#24324F", justifyContent: "center", alignItems: "center", borderWidth: 6, borderColor: "#24324F" },
  buttonFocus: { backgroundColor: GOLD, borderColor: "#FFF4DE", transform: [{ scale: 1.06 }] },
  buttonText: { color: ink, fontSize: 52, fontWeight: "700", fontFamily: FONT },
  memoryPhoto: { position: "absolute", top: 0, left: 0, width: 1920, height: 1080 },
  memoryFade: { position: "absolute", left: 0, right: 0, bottom: 0, height: 760 },
  memoryShade: { position: "absolute", left: 0, right: 0, bottom: 0, height: 640, paddingHorizontal: 120, paddingBottom: 236, justifyContent: "flex-end" },
  memoryTitle: { color: ink, fontSize: 96, fontWeight: "700", fontFamily: FONT },
  memoryCaption: { color: ink, fontSize: 56, marginTop: 8, fontFamily: FONT, maxWidth: 1680 },
  memoryLabel: { color: "#A9B4C9", fontSize: 30, marginTop: 16, fontFamily: FONT },
});
