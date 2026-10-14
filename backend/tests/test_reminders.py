from datetime import datetime, timedelta
from sqlalchemy import select, func
from app.core.time import SHANGHAI, local_date
from app.models.entities import Duty, Notification, Subscription, User
from app.services.reminders import scan, deliver
from conftest import setup_dorm, current


def ready_today(client, app):
    a, ha, b, hb, dorm = setup_dorm(client)
    day = local_date(app.state.clock())
    client.post(
        "/duties/generate",
        headers=ha,
        json={"start_date": str(day), "days": 30, "expected_version": dorm["schedule_version"]},
    )
    task = client.get("/duties/today", headers=ha).json()["task"]
    client.patch(
        f"/duties/{task['id']}",
        headers=ha,
        json={"assignee_id": a, "expected_version": current(client, ha)["schedule_version"]},
    )
    return a, ha, b, hb, task, day


def test_reminder_times_dedupe_and_completion(client, app):
    a, ha, b, hb, task, day = ready_today(client, app)
    previous = day - timedelta(days=1)
    times = [
        datetime(previous.year, previous.month, previous.day, 21, tzinfo=SHANGHAI),
        datetime(day.year, day.month, day.day, 8, tzinfo=SHANGHAI),
        datetime(day.year, day.month, day.day, 19, tzinfo=SHANGHAI),
    ]
    with app.state.sessions() as db:
        for now in times:
            scan(db, now, app.state.settings)
            scan(db, now, app.state.settings)
        db.commit()
        assert (
            db.scalar(
                select(func.count()).select_from(Notification).where(Notification.task_id == task["id"])
            )
            == 3
        )
    notes = client.get("/notifications", headers=ha).json()
    assert notes["unread_count"] == 3
    note_id = notes["items"][0]["id"]
    assert client.patch(f"/notifications/{note_id}/read", headers=hb).status_code == 404
    assert client.patch(f"/notifications/{note_id}/read", headers=ha).status_code == 200
    assert client.patch(f"/notifications/{note_id}/read", headers=ha).status_code == 200
    assert client.get("/notifications", headers=ha).json()["unread_count"] == 2
    assert client.patch(f"/duties/{task['id']}/complete", headers=ha).status_code == 200
    kept = client.get("/notifications", headers=ha).json()
    assert kept["total"] == 1 and kept["unread_count"] == 0
    with app.state.sessions() as db:
        scan(db, times[-1] + timedelta(minutes=2), app.state.settings)
        db.commit()
        assert all(
            n.is_cancelled for n in db.scalars(select(Notification).where(Notification.task_id == task["id"]))
        )


def test_scan_window_and_reassignment(client, app):
    a, ha, b, hb, task, day = ready_today(client, app)
    late = datetime(day.year, day.month, day.day, 9, 1, tzinfo=SHANGHAI)
    with app.state.sessions() as db:
        scan(db, late, app.state.settings)
        db.commit()
        assert not db.scalar(select(Notification.id).where(Notification.task_id == task["id"]))
    now = late - timedelta(minutes=3)
    with app.state.sessions() as db:
        scan(db, now, app.state.settings)
        db.commit()
    client.patch(
        f"/duties/{task['id']}",
        headers=ha,
        json={"assignee_id": b, "expected_version": current(client, ha)["schedule_version"]},
    )
    with app.state.sessions() as db:
        scan(db, now, app.state.settings)
        db.commit()
        notes = list(db.scalars(select(Notification).where(Notification.task_id == task["id"])))
        assert len(notes) == 2
        assert next(n for n in notes if n.user_id == a).is_cancelled
        assert not next(n for n in notes if n.user_id == b).is_cancelled


def configure_push(app):
    app.state.settings.vapid_private_key = "test-key"
    app.state.settings.vapid_public_key = "test-public"
    app.state.settings.vapid_subject = "mailto:test@example.com"


def subscribe(client, headers, endpoint="https://fcm.googleapis.com/fcm/send/test"):
    return client.post(
        "/push/subscribe",
        headers=headers,
        json={"endpoint": endpoint, "keys": {"p256dh": "a" * 87, "auth": "b" * 22}},
    )


def test_push_ownership_retry_and_expiry(client, app):
    a, ha, b, hb, task, day = ready_today(client, app)
    assert client.get("/push/public-key", headers=ha).json()["available"] is False
    assert subscribe(client, ha).status_code == 503
    configure_push(app)
    assert subscribe(client, ha).status_code == 200
    assert subscribe(client, hb).status_code == 409
    assert (
        client.post(
            "/push/unsubscribe", headers=hb, json={"endpoint": "https://fcm.googleapis.com/fcm/send/test"}
        ).status_code
        == 404
    )
    assert subscribe(client, ha, "https://127.0.0.1/private").status_code == 422
    assert client.post("/push/test", headers=ha).status_code == 200
    assert client.post("/push/test", headers=ha).status_code == 429
    now = app.state.clock()
    with app.state.sessions() as db:
        deliver(db, now, app.state.settings, sender=lambda *_: "failed")
        db.commit()
        n = db.scalar(select(Notification).where(Notification.reminder_kind == "test"))
        assert next(iter(n.delivery_state.values()))["attempts"] == 1
        deliver(db, now, app.state.settings, sender=lambda *_: "accepted")
        assert next(iter(n.delivery_state.values()))["attempts"] == 1
        deliver(db, now + timedelta(minutes=3), app.state.settings, sender=lambda *_: "expired")
        db.commit()
        assert not db.scalar(select(Subscription)).is_active
        assert next(iter(n.delivery_state.values()))["status"] == "expired"


def test_max_retries_and_completed_suppression(client, app):
    a, ha, b, hb, task, day = ready_today(client, app)
    configure_push(app)
    subscribe(client, ha)
    now = datetime(day.year, day.month, day.day, 8, tzinfo=SHANGHAI)
    with app.state.sessions() as db:
        scan(db, now, app.state.settings)
        db.commit()
        for i in range(6):
            deliver(
                db,
                now + timedelta(minutes=[0, 3, 8, 17, 34, 55][i]),
                app.state.settings,
                sender=lambda *_: "failed",
            )
        db.commit()
        n = db.scalar(select(Notification).where(Notification.task_id == task["id"]))
        assert next(iter(n.delivery_state.values()))["attempts"] == 4
        n.delivery_state = {
            next(iter(n.delivery_state)): {"status": "pending", "attempts": 0, "next_retry_at": None}
        }
        db.get(Duty, task["id"]).status = "completed"
        db.commit()
        deliver(
            db,
            now + timedelta(hours=8),
            app.state.settings,
            sender=lambda *_: (_ for _ in ()).throw(AssertionError("must not send")),
        )
        assert n.is_cancelled


def test_push_disabled_account(client, app):
    a, ha, b, hb, task, day = ready_today(client, app)
    configure_push(app)
    subscribe(client, ha)
    client.patch("/auth/me", headers=ha, json={"push_enabled": False})
    with app.state.sessions() as db:
        assert db.get(User, a).push_enabled is False
    assert client.post("/push/test", headers=ha).status_code == 409


def test_outdated_delivery_is_cancelled(client, app):
    a, ha, b, hb, task, day = ready_today(client, app)
    configure_push(app)
    subscribe(client, ha)
    now = datetime(day.year, day.month, day.day, 8, tzinfo=SHANGHAI)
    with app.state.sessions() as db:
        scan(db, now, app.state.settings)
        db.commit()
        deliver(
            db,
            now + timedelta(minutes=61),
            app.state.settings,
            sender=lambda *_: (_ for _ in ()).throw(AssertionError("stale push must not send")),
        )
        db.commit()
        assert db.scalar(select(Notification).where(Notification.task_id == task["id"])).is_cancelled


def test_delivery_url_targets_duty_date(client, app):
    a, ha, b, hb, task, day = ready_today(client, app)
    configure_push(app)
    subscribe(client, ha)
    now = datetime(day.year, day.month, day.day, 8, tzinfo=SHANGHAI)
    urls = []

    def sender(sub, note, settings, url):
        urls.append(url)
        return "accepted"

    with app.state.sessions() as db:
        scan(db, now, app.state.settings)
        db.commit()
        deliver(db, now, app.state.settings, sender=sender)
        db.commit()
    assert urls == [f"/schedule?date={day.isoformat()}"]
