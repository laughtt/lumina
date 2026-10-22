import { useEffect, useRef, useState } from "react";
import { call, useLumina, type Memory } from "./lumina";
import { Caps, Empty, Icon, Sheet, r } from "./ui";

const sorted = (list: Memory[]) => [...list].sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999));

export function Memories() {
  const { family, calls, media } = useLumina();
  const [open, setOpen] = useState<number | null>(null);
  if (!family) return null;
  const memories = sorted(family.memories);
  if (!memories.length) return <Empty icon="photos" title="No photos yet">Add an old photo and Lumina tells {calls} its story.</Empty>;

  const hero = memories.find((m) => m.calming) ?? memories[memories.length - 1];
  const decades = new Map<number, Memory[]>();
  for (const m of memories) {
    const d = Math.floor((m.year ?? 0) / 10) * 10;
    decades.set(d, [...(decades.get(d) ?? []), m]);
  }

  return (
    <div className="album">
      <button className="featured rise" style={r(0)} onClick={() => setOpen(memories.indexOf(hero))}>
        {media(hero.url) && <img src={media(hero.url)} alt="" />}
        <span className="featured-text">
          <small>{calls.toUpperCase()}'S FAVOURITE</small>
          <b className="serif">{hero.title}</b>
          <span>{hero.caption}</span>
        </span>
      </button>
      {[...decades].map(([decade, list], i) => (
        <section key={decade} className="stack rise" style={r(i + 1)}>
          <Caps>{decade === 0 ? "Undated" : `${decade}s · ${list.length}`}</Caps>
          <div className="grid">
            {list.map((m) => (
              <button key={m.id} className="thumb" aria-label={m.title} onClick={() => setOpen(memories.indexOf(m))}>
                {media(m.url) && <img src={media(m.url)} alt="" loading="lazy" />}
              </button>
            ))}
          </div>
        </section>
      ))}
      {open !== null && <Viewer memories={memories} start={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function Viewer({ memories, start, onClose }: { memories: Memory[]; start: number; onClose: () => void }) {
  const { calls, media } = useLumina();
  const strip = useRef<HTMLDivElement>(null);
  const [i, setI] = useState(start);
  const [shown, setShown] = useState("");
  const goTo = (n: number) => strip.current?.scrollTo({ left: n * strip.current.clientWidth, behavior: "smooth" });

  useEffect(() => {
    strip.current!.scrollLeft = start * strip.current!.clientWidth;
    document.body.style.overflow = "hidden";
    const keys = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") goTo(Math.min(Math.round(strip.current!.scrollLeft / strip.current!.clientWidth) + 1, memories.length - 1));
      if (e.key === "ArrowLeft") goTo(Math.max(Math.round(strip.current!.scrollLeft / strip.current!.clientWidth) - 1, 0));
    };
    window.addEventListener("keydown", keys);
    return () => { document.body.style.overflow = ""; window.removeEventListener("keydown", keys); };
  }, []);

  return (
    <div className="viewer" role="dialog" aria-label="Photo">
      <div className="strip" ref={strip} onScroll={(e) => setI(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}>
        {memories.map((m) => (
          <article key={m.id} className="slide">
            <div className="slide-inner">
              {media(m.url) && <img src={media(m.url)} alt={m.title} />}
              {m.year && <Caps>{m.year}</Caps>}
              <h2 className="serif">{m.title}</h2>
              <p className="soft story">{m.story ?? m.caption}</p>
              <button className={`btn wide${shown === m.id ? " shown" : ""}`} onClick={async () => { await call("/api/tv/memory", { id: m.id }).catch(() => {}); setShown(m.id); }}>
                <Icon name={shown === m.id ? "check" : "tv"} size={20} /> {shown === m.id ? `On ${calls}'s TV now` : `Show on ${calls}'s TV`}
              </button>
            </div>
          </article>
        ))}
      </div>
      <button className="icon-btn viewer-close" aria-label="Close" onClick={onClose}><Icon name="x" /></button>
      {i > 0 && <button className="icon-btn viewer-arrow prev" aria-label="Previous photo" onClick={() => goTo(i - 1)}><Icon name="back" /></button>}
      {i < memories.length - 1 && <button className="icon-btn viewer-arrow next" aria-label="Next photo" onClick={() => goTo(i + 1)}><Icon name="next" /></button>}
      <div className="dots viewer-dots">{memories.map((m, k) => <i key={m.id} className={k === i ? "on" : ""} />)}</div>
    </div>
  );
}

export function MemoriesMenu() {
  const [menu, setMenu] = useState(false);
  const [sheet, setSheet] = useState<"" | "add" | "invite">("");
  const pick = (s: "add" | "invite") => { setMenu(false); setSheet(s); };
  return (
    <div className="menu-wrap">
      <button className="icon-btn" aria-label="Add" aria-expanded={menu} onClick={() => setMenu(!menu)}><Icon name="plus" /></button>
      {menu && (
        <>
          <div className="menu-back" onClick={() => setMenu(false)} />
          <div className="menu pop" role="menu">
            <button role="menuitem" onClick={() => pick("add")}><Icon name="photo" size={18} /> Add a photo</button>
            <button role="menuitem" onClick={() => pick("invite")}><Icon name="people" size={18} /> Invite family</button>
          </div>
        </>
      )}
      {sheet === "invite" && <Invite onClose={() => setSheet("")} />}
      {sheet === "add" && <AddMemory onClose={() => setSheet("")} />}
    </div>
  );
}

function Invite({ onClose }: { onClose: () => void }) {
  const { calls } = useLumina();
  const [link, setLink] = useState("");
  const [copied, setCopied] = useState(false);
  const load = (fresh: boolean) => call<{ path: string }>("/api/share", { fresh }).then((o) => { setLink(location.origin + o.path); setCopied(false); }, () => {});
  useEffect(() => { load(false); }, []);

  return (
    <Sheet title="Invite family" onClose={onClose}>
      <p className="soft">Anyone with this link can send photos for {calls}, no app needed. You see each one in Updates first, and only the ones you approve reach {calls}'s TV.</p>
      {link ? (
        <>
          <code className="box link-box">{link}</code>
          <div className="row">
            <button className="btn" onClick={() => { navigator.clipboard?.writeText(link); setCopied(true); }}><Icon name={copied ? "check" : "copy"} size={18} /> {copied ? "Copied" : "Copy link"}</button>
            {"share" in navigator && <button className="btn ghost" onClick={() => navigator.share({ url: link, text: `Send a photo for ${calls}'s album` }).catch(() => {})}><Icon name="share" size={18} /> Share</button>}
          </div>
          <button className="link soft" onClick={() => load(true)}>Make a new link (the old one stops working)</button>
        </>
      ) : <span className="spinner dark" />}
    </Sheet>
  );
}

async function shrink(file: File) {
  const img = await createImageBitmap(file);
  const k = Math.min(1, 1024 / Math.max(img.width, img.height));
  const canvas = Object.assign(document.createElement("canvas"), { width: Math.round(img.width * k), height: Math.round(img.height * k) });
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.8);
}

type Draft = { title: string; caption: string; story: string; tags: string[] };

function AddMemory({ onClose }: { onClose: () => void }) {
  const { calls, send } = useLumina();
  const [photo, setPhoto] = useState("");
  const [line, setLine] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const image = { data: photo.split(",")[1], mediaType: "image/jpeg" };
  const edit = (k: keyof Draft, v: string) => setDraft({ ...draft!, [k]: v });

  return (
    <Sheet title="Add a memory" onClose={onClose}>
      <label className="photo-pick">
        {photo ? <img src={photo} alt="Your photo" /> : <span><Icon name="photo" /> Choose an old photo</span>}
        <input type="file" accept="image/*" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { setPhoto(await shrink(f)); setDraft(null); } }} />
      </label>
      <input className="box" value={line} placeholder="One line, e.g. Dad's 40th, Porto, 1984" onChange={(e) => setLine(e.target.value)} />
      {draft ? (
        <>
          <input className="box" value={draft.title} aria-label="Title" onChange={(e) => edit("title", e.target.value)} />
          <textarea className="box" rows={2} value={draft.caption} aria-label="Caption" onChange={(e) => edit("caption", e.target.value)} />
          <textarea className="box" rows={4} value={draft.story} aria-label="Story Lumina tells" onChange={(e) => edit("story", e.target.value)} />
          <p className="soft small">{calls} can find it by saying: {draft.tags.join(", ")}</p>
          <button className="btn wide" onClick={async () => { await send("/api/memories", { ...draft, image }); onClose(); }}>Add to {calls}'s album</button>
        </>
      ) : (
        <button className="btn wide" disabled={!photo || !line.trim() || busy} onClick={async () => {
          setBusy(true);
          setDraft(await call<Draft>("/api/memories/draft", { line, image }).catch(() => null));
          setBusy(false);
        }}>{busy ? "Lumina is looking…" : "Draft the card"}</button>
      )}
    </Sheet>
  );
}
