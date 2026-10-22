import { useEffect, useRef, useState } from "react";
import { api, token } from "./api";

type Line = { who: "rosa" | "lumina"; text: string; tool?: string; ms?: number; model?: string };
type Rpc = { method: string; request: unknown; response: unknown; ms: number };

const PHRASES = ["Where's my girl?", "Did I take my pill?", "I took it", "That's our house in Porto!", "What's for lunch?", "Tell Ana I love her"];

let rpcId = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function Alexa({ compact = false }: { compact?: boolean }) {
  const [lines, setLines] = useState<Line[]>([]);
  const [log, setLog] = useState<Rpc[]>([]);
  const [state, setState] = useState<"idle" | "listening" | "thinking" | "speaking">("idle");
  const [showLog, setShowLog] = useState(false);
  const [typed, setTyped] = useState("");
  const tools = useRef<any[] | null>(null);
  const feed = useRef<HTMLDivElement>(null);

  async function rpc(method: string, params?: unknown, notify = false) {
    const request = notify ? { jsonrpc: "2.0", method, params } : { jsonrpc: "2.0", id: ++rpcId, method, params };
    const t0 = performance.now();
    const r = await fetch("/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-11-25",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(request),
    });
    const response = notify ? { status: r.status } : await r.json();
    setLog((l) => [{ method, request, response, ms: Math.round(performance.now() - t0) }, ...l].slice(0, 30));
    return (response as any).result;
  }

  async function connect() {
    if (tools.current) return tools.current;
    await rpc("initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "lumina-alexa-sim", version: "0.1.0" } });
    await rpc("notifications/initialized", undefined, true);
    tools.current = (await rpc("tools/list")).tools;
    return tools.current!;
  }

  async function say(text: string) {
    setLines((l) => [...l, { who: "rosa", text }]);
    setState("thinking");
    try {
      const list = await connect();
      const t0 = performance.now();
      const choice = await api("/api/alexa/choose", { said: text, tools: list });
      const result = await rpc("tools/call", { name: choice.name, arguments: choice.arguments });
      const reply = result?.content?.[0]?.text ?? "I'm not sure, Rosa. I'll let Ana know.";
      setLines((l) => [...l, { who: "lumina", text: reply, tool: choice.name, ms: Math.round(performance.now() - t0), model: choice.model ?? choice.source }]);
      setState("speaking");
      await speak(reply);
    } catch (e) {
      setLines((l) => [...l, { who: "lumina", text: `Lumina can't reach the server (${(e as Error).message}). Check that the API is running.` }]);
    }
    setState("idle");
  }

  function listen() {
    const SR = (window as any).webkitSpeechRecognition ?? (window as any).SpeechRecognition;
    if (!SR) return setLines((l) => [...l, { who: "lumina", text: "Voice input needs Chrome. Type below or tap a phrase." }]);
    const rec = new SR();
    rec.lang = "en-US";
    rec.onresult = (e: any) => say(e.results[0][0].transcript);
    rec.onend = () => setState((s) => (s === "listening" ? "idle" : s));
    setState("listening");
    rec.start();
  }

  useEffect(() => {
    const onSay = (e: Event) => { const { text, done } = (e as CustomEvent).detail; say(text).then(done); };
    window.addEventListener("lumina:say", onSay);
    return () => window.removeEventListener("lumina:say", onSay);
  }, []);
  useEffect(() => { feed.current?.scrollTo({ top: 1e6, behavior: "smooth" }); }, [lines]);

  return (
    <section className={`alexa ${compact ? "alexa-compact" : ""}`} aria-label="Living room speaker (simulated Alexa+)">
      <div className="speaker">
        <button className={`puck puck-${state}`} onClick={listen} aria-label="Talk to the speaker">
          <span className="puck-ring" />
        </button>
        <div>
          <h2>Living room speaker</h2>
          <p className="muted">Simulated Alexa+. A real MCP client, calling Lumina's tools.</p>
        </div>
      </div>
      <div className="transcript" ref={feed} aria-live="polite">
        {lines.length === 0 && <p className="muted">Tap the speaker and talk as Rosa, or tap a phrase.</p>}
        {lines.map((l, i) => (
          <div key={i} className={`say say-${l.who}`}>
            {l.text}
            {l.tool && <small>Called {l.tool} in {l.ms} ms, picked by {l.model?.replace("anthropic.", "")}</small>}
          </div>
        ))}
      </div>
      <div className="phrases">
        {PHRASES.map((p) => <button key={p} onClick={() => say(p)} disabled={state === "thinking"}>{p}</button>)}
      </div>
      <form className="typed" onSubmit={(e) => { e.preventDefault(); if (typed.trim()) { say(typed.trim()); setTyped(""); } }}>
        <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Type what Rosa says" aria-label="What Rosa says" />
        <button type="button" className="link" onClick={() => setShowLog((v) => !v)}>{showLog ? "Hide" : "Show"} MCP traffic</button>
      </form>
      {showLog && (
        <ol className="rpc" aria-label="MCP JSON-RPC traffic">
          {log.map((r, i) => (
            <li key={i}>
              <b>{r.method}</b> <span>{r.ms} ms</span>
              <pre>{JSON.stringify(r.request)}</pre>
              <pre>{JSON.stringify(r.response).slice(0, 400)}</pre>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function speak(text: string) {
  return new Promise<void>((resolve) => {
    if (!("speechSynthesis" in window)) return void sleep(1500).then(() => resolve());
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    u.rate = 0.92;
    u.voice = speechSynthesis.getVoices().find((v) => /Samantha|Google US English|Ava/.test(v.name)) ?? null;
    u.onend = () => resolve();
    u.onerror = () => resolve();
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
    setTimeout(() => resolve(), 12000);
  });
}

export function askLumina(text: string) {
  return new Promise<void>((done) => window.dispatchEvent(new CustomEvent("lumina:say", { detail: { text, done } })));
}
