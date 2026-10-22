from __future__ import annotations

from statistics import median

from pydantic import BaseModel, Field

from activegraph.packs import Pack, PackPolicy, behavior, llm_behavior

from .providers import MODEL

WINDOW = 30
WARMUP_DAYS = 14
COOLDOWN = 60
CHECK_AFTER = 60
NUDGES_PER_DAY = 1
QUIET = (21 * 60, 8 * 60)


def find(view, type_, **where):
    return view.objects(type=type_, where={f"data.{k}": v for k, v in where.items()})


def _one(view, type_, **where):
    found = find(view, type_, **where)
    return found[0] if found else None


def _data(event):
    return event.payload["object"]["data"]


def stats(view, topic, hour, today):
    counts: dict[str, int] = {}
    for a in find(view, "ask", topic=topic):
        if a.data["date"] < today:
            counts[a.data["date"]] = counts.get(a.data["date"], 0) + (a.data["hour"] == hour)
    values = sorted(counts[d] for d in sorted(counts)[-14:])
    if not values:
        return 0, 0.0, 0
    return len(values), float(median(values)), values[min(len(values) - 1, int(len(values) * 0.9))]


@behavior(name="spike_detector", on=["object.created"], where={"object.type": "ask"})
def spike_detector(event, graph, ctx):
    a = _data(event)
    days, usual, high = stats(ctx.view, a["topic"], a["hour"], a["date"])
    if days < WARMUP_DAYS:
        return
    recent = [x for x in find(ctx.view, "ask", topic=a["topic"], date=a["date"])
              if a["minute"] - WINDOW < x.data["minute"] <= a["minute"]]
    if len(recent) < max(3, high + 1):
        return
    if any(a["minute"] - s.data["minute"] < COOLDOWN for s in find(ctx.view, "spike", topic=a["topic"], date=a["date"])):
        return
    answer = _one(ctx.view, "answer", topic=a["topic"])
    graph.add_object("spike", {
        "topic": a["topic"], "date": a["date"], "hour": a["hour"], "minute": a["minute"], "time": a["time"],
        "count": len(recent), "window_minutes": WINDOW, "usual_per_hour": usual, "high_per_hour": high, "days_of_history": days,
        "answer_fresh": bool(answer and answer.data["approved_on"] >= a["date"]),
    })


@behavior(name="stale_answer", on=["object.created"], where={"object.type": "spike", "object.data.answer_fresh": False})
def stale_answer(event, graph, ctx):
    s = _data(event)
    if _one(ctx.view, "refresh_request", topic=s["topic"], date=s["date"]):
        return
    graph.add_object("refresh_request", {
        "topic": s["topic"], "date": s["date"], "spike": event.payload["object"]["id"], "delivered": False,
        "reason": f"Rosa asked {s['count']}× in {s['window_minutes']} min (her usual for this hour: up to {s['high_per_hour']}), and your answer isn't from today. A fresh answer comes first.",
    })


class StepChoice(BaseModel):
    step: str = Field(description="the `key` of one enabled playbook step, or 'none'")
    reason: str = Field(description="one plain sentence to Ana that cites Rosa's numbers")


@llm_behavior(
    name="pick_step",
    on=["object.created"],
    where={"object.type": "spike", "object.data.answer_fresh": True},
    model=MODEL,
    output_schema=StepChoice,
    max_tokens=2048,
    view={"include_types": ["playbook_step", "tv_step", "check", "nudge_proposed"], "recent_events": 0},
    description=(
        "You help Ana care for her mother Rosa (76, early Alzheimer's). The triggering event is a spike: Rosa asked the same "
        "question more often in the last 30 minutes than her own usual for this hour. Choose ONE step from Ana's playbook "
        "(the playbook_step objects): tier 1 is a reversible TV change that runs now; tier 2 contacts family and Ana approves first. "
        "Rules: pick only an enabled step, or 'none'. Prefer bigger_answer first: written answers reduce repeated questions. "
        "Prefer steps with more wins and thumbs_up; avoid steps Ana rated thumbs_down more than thumbs_up. Use a tier-2 step only "
        "if a tier-1 step was already used today for this topic (see tv_step objects) and the questions continued. "
        "Never give health advice. The reason is one plain sentence to Ana, citing Rosa's numbers."
    ),
)
def pick_step(event, graph, ctx, out: StepChoice):
    spike_id = event.payload["object"]["id"]
    s = _data(event)
    step = _one(ctx.view, "playbook_step", key=out.step)
    if step is None or not step.data["enabled"]:
        graph.add_object("no_action", {"spike": spike_id, "date": s["date"], "choice": out.step, "reason": out.reason})
        return
    record = {
        "step": out.step, "spike": spike_id, "topic": s["topic"], "date": s["date"], "minute": s["minute"], "time": s["time"],
        "count": s["count"], "high": s["high_per_hour"], "reason": out.reason, "delivered": False,
    }
    if step.data["tier"] == 1:
        graph.add_object("tv_step", record)
        return
    quiet = s["minute"] >= QUIET[0] or s["minute"] < QUIET[1]
    if quiet or len(find(ctx.view, "nudge_proposed", date=s["date"])) >= NUDGES_PER_DAY:
        graph.add_object("no_action", {"spike": spike_id, "date": s["date"], "choice": out.step, "reason": "Alert budget: one family nudge a day, none in quiet hours."})
        return
    approval = ctx.propose_object("family_nudge", {**record, "to": "Luis", "text": (
        f"Hi Luis, Mom has asked for Ana {s['count']} times in the last half hour, more than usual for her. "
        "A quick call might help. (Sent by Lumina for Ana.)")}, reason=out.reason)
    graph.add_object("nudge_proposed", {"date": s["date"], "approval": approval, "spike": spike_id, "reason": out.reason, "delivered": False})


@behavior(name="check_step", on=["object.created"], where={"object.type": "tick"})
def check_step(event, graph, ctx):
    t = _data(event)
    for st in find(ctx.view, "tv_step", date=t["date"]):
        if st.data.get("checked") or t["minute"] < st.data["minute"] + CHECK_AFTER:
            continue
        asks = [a.data["minute"] for a in find(ctx.view, "ask", topic=st.data["topic"], date=t["date"])]
        before = sum(st.data["minute"] - CHECK_AFTER <= m <= st.data["minute"] for m in asks)
        after = sum(st.data["minute"] < m <= st.data["minute"] + CHECK_AFTER for m in asks)
        helped = after <= before // 2
        graph.add_object("check", {
            "ref": st.data["spike"], "step": st.data["step"], "date": t["date"], "before": before, "after": after,
            "result": f"Seemed to help, so far: {before} asks in the hour before, {after} after." if helped
                      else f"No clear change: {before} asks before, {after} after.",
            "helped": helped, "delivered": False,
        })
        graph.patch_object(st.id, {"checked": True})
        pb = _one(ctx.view, "playbook_step", key=st.data["step"])
        if pb:
            graph.patch_object(pb.id, {"tries": pb.data.get("tries", 0) + 1, "wins": pb.data.get("wins", 0) + int(helped)})


@behavior(name="record_rating", on=["object.created"], where={"object.type": "rating"})
def record_rating(event, graph, ctx):
    r = _data(event)
    st = _one(ctx.view, "tv_step", spike=r["ref"]) or _one(ctx.view, "family_nudge", spike=r["ref"])
    pb = _one(ctx.view, "playbook_step", key=st.data["step"]) if st else None
    if pb:
        field = "thumbs_up" if r["value"] == "up" else "thumbs_down"
        graph.patch_object(pb.id, {field: pb.data.get(field, 0) + 1})


pack = Pack(
    name="lumina",
    version="0.1.0",
    description="Notices when Rosa's questions rise above her own normal, takes one step from Ana's playbook, and checks whether it helped.",
    behaviors=(spike_detector, stale_answer, pick_step, check_step, record_rating),
    policies=(PackPolicy(name="family_contact", requires_approval=("family_nudge",)),),
)
