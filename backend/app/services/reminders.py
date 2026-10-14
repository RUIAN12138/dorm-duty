import copy
import json
from datetime import datetime, timedelta
from sqlalchemy import select
from pywebpush import webpush, WebPushException
from app.core.time import SHANGHAI, local_date, as_utc
from app.models.entities import Dorm, Duty, Notification, Subscription, User, Member
from app.services.scheduling import generate, cancel_changed, rules_for


def push_ready(settings):
    return bool(settings.vapid_private_key and settings.vapid_public_key and settings.vapid_subject)


def send(subscription, note, settings, url="/messages"):
    try:
        webpush(
            subscription_info={
                "endpoint": subscription.endpoint,
                "keys": {"p256dh": subscription.p256dh, "auth": subscription.auth},
            },
            data=json.dumps({"title": note.title, "body": note.body, "tag": note.dedupe_key, "url": url}),
            vapid_private_key=settings.vapid_private_key,
            vapid_claims={"sub": settings.vapid_subject},
            timeout=5,
            ttl=3600,
        )
        return "accepted"
    except WebPushException as exc:
        status = exc.response.status_code if exc.response is not None else None
        return "expired" if status in (404, 410) else "failed"
    except Exception:
        return "failed"


def device_states(db, user, settings):
    if not user.push_enabled or not push_ready(settings):
        return {}
    return {
        str(s.id): {"status": "pending", "attempts": 0, "next_retry_at": None}
        for s in db.scalars(
            select(Subscription).where(Subscription.user_id == user.id, Subscription.is_active.is_(True))
        )
    }


def scan(db, now, settings):
    """Caller serializes one scan and commits it; clock injection allows boundary tests."""
    dorms = list(db.scalars(select(Dorm).order_by(Dorm.id).with_for_update()))
    for dorm in dorms:
        if dorm.rotation_order:
            result = generate(db, dorm, local_date(now), rules_for(dorm).horizon_days, now)
            if result["added"]:
                dorm.schedule_version += 1
        cancel_changed(db, dorm.id)
    tasks = db.scalars(
        select(Duty).where(
            Duty.status == "pending",
            Duty.duty_date.between(local_date(now), local_date(now) + timedelta(days=1)),
        )
    )
    for task in tasks:
        user = db.get(User, task.assignee_id)
        member = db.scalar(
            select(Member).where(
                Member.dorm_id == task.dorm_id, Member.user_id == user.id, Member.is_active.is_(True)
            )
        )
        if not member or user.current_dorm_id != task.dorm_id:
            continue
        for kind, delta, hour in [("previous", -1, 21), ("morning", 0, 8), ("evening", 0, 19)]:
            day = task.duty_date + timedelta(days=delta)
            scheduled = datetime(day.year, day.month, day.day, hour, tzinfo=SHANGHAI).astimezone(now.tzinfo)
            if not now - timedelta(minutes=60) <= scheduled <= now:
                continue
            key = f"{task.id}:{user.id}:{kind}"
            if db.scalar(select(Notification.id).where(Notification.dedupe_key == key)):
                continue
            title = "明天轮到你值日" if kind == "previous" else "今天轮到你值日"
            note = Notification(
                user_id=user.id,
                dorm_id=task.dorm_id,
                task_id=task.id,
                reminder_kind=kind,
                scheduled_at=scheduled,
                created_at=now,
                title=title,
                body=f"{task.duty_date.isoformat()} · {task.task_text}，截止 {task.deadline_at.astimezone(SHANGHAI):%H:%M}",
                dedupe_key=key,
                delivery_state=device_states(db, user, settings),
            )
            db.add(note)
    db.flush()


def deliver(db, now, settings, sender=send, only_note=None, only_device=None):
    if not push_ready(settings):
        return
    query = select(Notification).where(Notification.is_cancelled.is_(False))
    if only_note is not None:
        query = query.where(Notification.id == only_note)
    for note in db.scalars(query):
        user = db.get(User, note.user_id)
        if not user or not user.push_enabled:
            continue
        url = "/messages"
        if now > note.scheduled_at + timedelta(hours=1):
            note.is_cancelled = True
            continue
        if note.task_id:
            task = db.scalar(select(Duty).where(Duty.id == note.task_id).with_for_update())
            if task is None:
                note.is_cancelled = True
                continue
            url = f"/schedule?date={task.duty_date.isoformat()}"
            member = db.scalar(
                select(Member.id).where(
                    Member.dorm_id == note.dorm_id, Member.user_id == user.id, Member.is_active.is_(True)
                )
            )
            if (
                not member
                or user.current_dorm_id != note.dorm_id
                or task.status != "pending"
                or task.assignee_id != user.id
            ):
                note.is_cancelled = True
                continue
        states = copy.deepcopy(note.delivery_state)
        for sid, state in states.items():
            if only_device is not None and sid != only_device:
                continue
            if state["status"] in ("accepted", "expired", "cancelled") or state["attempts"] >= 4:
                continue
            if state.get("next_retry_at") and as_utc(datetime.fromisoformat(state["next_retry_at"])) > now:
                continue
            sub = db.get(Subscription, int(sid))
            if not sub or not sub.is_active or sub.user_id != user.id:
                state["status"] = "cancelled"
                continue
            outcome = sender(sub, note, settings, url)
            state["status"] = outcome
            state["attempts"] += 1
            state["next_retry_at"] = (now + timedelta(minutes=2 ** state["attempts"])).isoformat()
            if outcome == "expired":
                sub.is_active = False
        note.delivery_state = states
