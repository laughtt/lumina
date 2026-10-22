import { useEffect, useState } from "react";
import { api } from "./api";

type Person = { name: string; calls: string; caregiver: string };

async function shrink(file: File) {
  const img = await createImageBitmap(file);
  const k = Math.min(1, 1024 / Math.max(img.width, img.height));
  const canvas = Object.assign(document.createElement("canvas"), { width: Math.round(img.width * k), height: Math.round(img.height * k) });
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.8);
}

export function Share({ token }: { token: string }) {
  const [person, setPerson] = useState<Person | null>();
  const [from, setFrom] = useState(() => { try { return localStorage.getItem("lumina-from") ?? ""; } catch { return ""; } });
  const [photo, setPhoto] = useState("");
  const [line, setLine] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "failed">("idle");

  useEffect(() => { api<Person>(`/api/share/${token}`).then(setPerson, () => setPerson(null)); }, [token]);

  async function send() {
    setState("sending");
    try { localStorage.setItem("lumina-from", from); } catch {}
    try {
      await api(`/api/share/${token}`, { from, line, image: { data: photo.split(",")[1], mediaType: "image/jpeg" } });
      setState("sent");
    } catch {
      setState("failed");
    }
  }

  if (person === undefined) return <main className="share" />;
  if (person === null) return (
    <main className="share">
      <img className="share-emblem" src="/emblem.png" alt="" />
      <h1>This link doesn't work anymore</h1>
      <p className="muted">Ask for a new one.</p>
    </main>
  );

  if (state === "sent") return (
    <main className="share">
      <img className="share-emblem" src="/emblem.png" alt="" />
      <h1>Thank you, {from}</h1>
      <p className="muted">{person.caregiver} will look at it first. Then {person.calls} can see it on the TV, and Lumina will tell her its story.</p>
      <button className="share-send" onClick={() => { setPhoto(""); setLine(""); setState("idle"); }}>Send another photo</button>
    </main>
  );

  return (
    <main className="share">
      <img className="share-emblem" src="/emblem.png" alt="" />
      <h1>Share a memory with {person.name}</h1>
      <p className="muted">{person.caregiver} is collecting photos for {person.calls}. When she asks, Lumina shows them on her TV and tells their story.</p>

      <label className="share-photo">
        {photo ? <img src={photo} alt="Your photo" /> : <span>Choose a photo</span>}
        <input type="file" accept="image/*" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setPhoto(await shrink(f)); }} />
      </label>

      <label className="share-field">
        <span>What's in it?</span>
        <textarea rows={2} value={line} onChange={(e) => setLine(e.target.value)} placeholder="e.g. Christmas at Tia Graça's, Braga, 1978" />
      </label>
      <label className="share-field">
        <span>Your name</span>
        <input value={from} onChange={(e) => setFrom(e.target.value)} placeholder="e.g. Luis" />
      </label>

      {state === "failed" && <p className="share-error">That didn't go through. Try again?</p>}
      <button className="share-send" disabled={!photo || !line.trim() || !from.trim() || state === "sending"} onClick={send}>
        {state === "sending" ? "Sending…" : `Send to ${person.calls}`}
      </button>
      <p className="muted share-small">{person.caregiver} checks every photo before {person.calls} sees it.</p>
    </main>
  );
}
