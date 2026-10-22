from __future__ import annotations

import json
import os
import shutil
import threading
import urllib.request
from pathlib import Path

from activegraph import Graph, Runtime

from .pack import find, pack, stats
from .providers import provider

API = os.environ.get("API_URL", "http://localhost:8787").rstrip("/")
TOKEN = os.environ.get("LUMINA_TOKEN", "")
DATA = Path(os.environ.get("AGENT_DATA", Path(__file__).resolve().parent.parent / ".data"))
DB = DATA / "rosa.db"
STATE = DATA / "state.json"
lock = threading.Lock()


def call(method: str, path: str, body: dict | None = None):
    req = urllib.request.Request(f"{API}{path}", method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"content-type": "application/json", **({"authorization": f"Bearer {TOKEN}"} if TOKEN else {})})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read() or b"null")


def load_state() -> dict:
    return json.loads(STATE.read_text()) if STATE.exists() else {}


def open_runtime(state: dict) -> Runtime:
    DATA.mkdir(parents=True, exist_ok=True)
    if state.get("run_id") and DB.exists():
        rt = Runtime.load(f"sqlite:///{DB}", run_id=state["run_id"], llm_provider=provider())
    else:
        rt = Runtime(Graph(), persist_to=str(DB), llm_provider=provider())
    rt.load_pack(pack)
    return rt


def upsert(graph, type_, key: dict, data: dict):
    found = find(graph, type_, **key)
    if not found:
        graph.add_object(type_, {**key, **data}, actor="host")
    elif any(found[0].data.get(k) != v for k, v in data.items()):
        graph.patch_object(found[0].id, data, actor="host")


def tick() -> dict:
    with lock:
        state = load_state()
        box = call("GET", "/api/agent/inbox" + (f"?since={state['cursor']}" if state.get("cursor") else ""))
        rt = open_runtime(state)
        g = rt.graph

        for p in box["playbook"]:
            upsert(g, "playbook_step", {"key": p["id"]}, {"label": p["label"], "tier": p["tier"], "enabled": p["enabled"]})
        for topic, a in box["answers"].items():
            upsert(g, "answer", {"topic": topic}, {"approved_on": a["approvedOn"]})
        rt.run_until_idle()
        for a in box["asks"]:
            g.add_object("ask", a, actor="rosa")
            rt.run_until_idle()
        seen = set(state.get("feedback", []))
        for f in box["feedback"]:
            if f["id"] in seen:
                continue
            seen.add(f["id"])
            if f.get("rating"):
                g.add_object("rating", {"ref": f["ref"], "value": f["rating"]}, actor="ana")
            if f.get("decision"):
                g.add_object("decision", {"approval": f.get("approvalId"), "value": f["decision"]}, actor="ana")
                if f["decision"] == "approve" and f.get("approvalId") in {p.id for p in rt.pending_approvals()}:
                    rt.approve(f["approvalId"], approved_by="ana")
        loc = box["local"]
        g.add_object("tick", {"at": box["now"], "date": loc["date"], "minute": loc["minutes"]}, actor="host")
        rt.run_until_idle()

        delivered = deliver(rt)
        summary = summarize(rt, loc)
        call("PUT", "/api/agent/state", summary)
        if box["asks"]:
            state["cursor"] = max(a["at"] for a in box["asks"])
        state.update(run_id=rt.run_id, feedback=sorted(seen))
        STATE.write_text(json.dumps(state))
        return {"asks_in": len(box["asks"]), "delivered": delivered, "pending_approvals": len(rt.pending_approvals()), "errors": [e.message for e in rt.errors][-3:]}


def deliver(rt: Runtime) -> int:
    g, n = rt.graph, 0
    for o in find(g, "tv_step", delivered=False):
        title = f"Rosa asked for you {o.data['count']}× in 30 min (usual at this hour: up to {o.data['high']})"
        call("POST", "/api/agent/act", {"kind": "tv_step", "ref": o.data["spike"], "step": o.data["step"], "title": title, "reason": o.data["reason"]})
        g.patch_object(o.id, {"delivered": True}, actor="host"); n += 1
    for o in find(g, "nudge_proposed", delivered=False):
        pa = next((p for p in rt.pending_approvals() if p.id == o.data["approval"]), None)
        if pa:
            call("POST", "/api/agent/act", {"kind": "propose", "ref": o.data["spike"], "approvalId": pa.id, "step": pa.data["step"],
                                            "title": f"Ask {pa.data['to']} to call Mom?", "text": pa.data["text"], "reason": pa.reason})
        g.patch_object(o.id, {"delivered": True}, actor="host"); n += 1
    for o in find(g, "family_nudge", delivered=False):
        call("POST", "/api/agent/act", {"kind": "send", "ref": o.data["spike"], "text": o.data["text"]})
        g.patch_object(o.id, {"delivered": True}, actor="host"); n += 1
    for o in find(g, "refresh_request", delivered=False):
        call("POST", "/api/agent/act", {"kind": "refresh", "ref": o.data["spike"], "topic": o.data["topic"], "reason": o.data["reason"]})
        g.patch_object(o.id, {"delivered": True}, actor="host"); n += 1
    for o in find(g, "check", delivered=False):
        call("POST", "/api/agent/act", {"kind": "check", "ref": o.data["ref"], "result": o.data["result"]})
        g.patch_object(o.id, {"delivered": True}, actor="host"); n += 1
    return n


def summarize(rt: Runtime, loc: dict) -> dict:
    g = rt.graph
    today = loc["date"]
    asks = find(g, "ask", topic="where_is_ana", date=today)
    rhythm = []
    for hour in range(8, 22):
        _, usual, high = stats(g, "where_is_ana", hour, today)
        rhythm.append({"hour": hour, "usual": usual, "high": high, "today": sum(a.data["hour"] == hour for a in asks)})
    steps = []
    for o in sorted(g.objects(type="tv_step") + g.objects(type="family_nudge"), key=lambda o: (o.data["date"], o.data["minute"], o.type), reverse=True)[:6]:
        check = next((c.data["result"] for c in find(g, "check", ref=o.data["spike"])), None)
        steps.append({"ref": o.data["spike"], "step": o.data["step"], "time": o.data["time"], "reason": o.data["reason"],
                      "check": check, "chain": rt.trace.causal_chain(o.id).splitlines()[:8]})
    return {
        "lastRun": loc,
        "rhythm": rhythm,
        "playbook": [{"key": p.data["key"], **{k: p.data.get(k, 0) for k in ("wins", "tries", "thumbs_up", "thumbs_down")}} for p in g.objects(type="playbook_step")],
        "steps": steps,
        "events": len(g.events),
        "runId": rt.run_id,
        "llm": type(rt._llm_provider).__name__ if hasattr(rt, "_llm_provider") else "",
    }


def reset() -> dict:
    with lock:
        shutil.rmtree(DATA, ignore_errors=True)
    return {"reset": True}
