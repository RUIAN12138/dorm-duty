from datetime import timedelta
from types import SimpleNamespace
from sqlalchemy import select
from app.core.time import local_date
from app.models.entities import Duty
from app.schemas.inputs import ScheduleRules
from app.services.scheduling import planned
from app.services.reminders import scan
from conftest import setup_dorm, current
from test_business import prepare_today


def configure(client, headers, **changes):
    return client.patch(
        "/dorms/current",
        headers=headers,
        json={
            "expected_version": current(client, headers)["schedule_version"],
            **changes,
        },
    )


def test_custom_rotation_preview_and_persistence(client, app):
    a, ha, b, hb, dorm = setup_dorm(client)
    today = local_date(app.state.clock())
    start = today + timedelta(days=1)
    skip = start + timedelta(days=2)
    rules = {
        "weekdays": [1, 2, 3, 4, 5],
        "rotation_days": 2,
        "horizon_days": 60,
        "skip_dates": [str(skip)],
        "weekly_tasks": {
            str(start.isoweekday()): {"task_text": "洗手台\n公共桌面", "deadline_time": "20:15"}
        },
    }
    draft = {
        "rotation_order": [b, a],
        "rotation_start_date": str(start),
        "task_text": "扫地\n倒垃圾",
        "deadline_time": "21:30",
        "schedule_rules": rules,
    }
    preview = client.post("/duties/preview", headers=ha, json={**draft, "start_date": str(start), "days": 14})
    assert preview.status_code == 200, preview.text
    assert (
        client.post("/duties/preview", headers=hb, json={**draft, "start_date": str(start)}).status_code
        == 403
    )
    saved = configure(client, ha, **draft)
    assert saved.status_code == 200, saved.text
    assert current(client, hb)["schedule_rules"]["rotation_days"] == 2
    assert current(client, ha)["task_text"] == "扫地\n倒垃圾"
    rows = client.get(
        "/duties",
        headers=ha,
        params={"start_date": str(start), "end_date": str(start + timedelta(days=13)), "page_size": 100},
    ).json()["items"]
    by_day = {t["duty_date"]: t for t in rows}
    for day in preview.json()["items"]:
        if day["task"] is None:
            assert day["duty_date"] not in by_day
        else:
            stored = by_day[day["duty_date"]]
            assert stored["assignee_id"] == day["task"]["assignee_id"]
            assert stored["task_text"] == day["task"]["task_text"]
            assert stored["deadline_at"] == day["task"]["deadline_at"]
    ids = [day["task"]["assignee_id"] for day in preview.json()["items"] if day["task"]]
    assert ids[:6] == [b, b, a, a, b, b]
    with app.state.sessions() as db:
        assert (
            db.scalar(select(Duty.id).where(Duty.duty_date == today + timedelta(days=59)))
            or (today + timedelta(days=59)).isoweekday() > 5
        )


def test_rules_validation_and_no_partial_write(client):
    a, ha, b, hb, dorm = setup_dorm(client)
    for rules in [
        {"weekdays": []},
        {"weekdays": [1, 1]},
        {"weekdays": [8]},
        {"rotation_days": 0},
        {"horizon_days": 91},
        {"weekly_tasks": {"8": {"task_text": "x"}}},
        {"weekly_tasks": {"1": {"deadline_time": "25:00"}}},
    ]:
        response = configure(client, ha, schedule_rules=rules)
        assert response.status_code == 422, response.text
    assert current(client, ha)["schedule_version"] == dorm["schedule_version"]
    assert configure(client, hb, schedule_rules={"rotation_days": 2}).status_code == 403


def test_single_day_content_time_permissions_and_manual_retention(client, app):
    a, ha, b, hb, dorm, task = prepare_today(client, app)
    version = current(client, ha)["schedule_version"]
    response = client.patch(
        f"/duties/{task['id']}",
        headers=ha,
        json={
            "expected_version": version,
            "task_text": "整理阳台\n擦玻璃",
            "deadline_time": "20:45",
            "assignee_id": b,
        },
    )
    assert response.status_code == 200, response.text
    assert response.json()["task"]["is_override"]
    assert response.json()["task"]["task_text"] == "整理阳台\n擦玻璃"
    assert response.json()["task"]["deadline_at"][11:16] == "12:45"
    assert (
        client.patch(
            f"/duties/{task['id']}",
            headers=hb,
            json={"expected_version": current(client, ha)["schedule_version"], "task_text": "unauthorized"},
        ).status_code
        == 403
    )
    assert (
        client.patch(
            f"/duties/{task['id']}", headers=ha, json={"expected_version": version, "task_text": "stale"}
        ).status_code
        == 409
    )
    assert client.patch(f"/duties/{task['id']}/complete", headers=hb).status_code == 200
    assert (
        client.patch(
            f"/duties/{task['id']}",
            headers=ha,
            json={"expected_version": current(client, ha)["schedule_version"], "task_text": "changed"},
        ).status_code
        == 409
    )
    saved = configure(client, ha, task_text="全新的默认内容", schedule_rules={"rotation_days": 3})
    assert saved.status_code == 200
    completed = client.get("/duties/today", headers=ha).json()["task"]
    assert completed["task_text"] == "整理阳台\n擦玻璃" and completed["status"] == "completed"


def test_add_custom_duty_on_rest_day_and_worker_preserves_it(client, app):
    a, ha, b, hb, dorm = setup_dorm(client)
    day = local_date(app.state.clock()) + timedelta(days=2)
    saved = configure(client, ha, schedule_rules={"skip_dates": [str(day)]})
    assert saved.status_code == 200
    payload = {
        "duty_date": str(day),
        "assignee_id": b,
        "task_text": "临时清洁任务",
        "deadline_time": "19:00",
        "expected_version": current(client, ha)["schedule_version"],
    }
    assert client.post("/duties/custom", headers=hb, json=payload).status_code == 403
    result = client.post("/duties/custom", headers=ha, json=payload)
    assert result.status_code == 201, result.text
    payload["expected_version"] = current(client, ha)["schedule_version"]
    assert client.post("/duties/custom", headers=ha, json=payload).status_code == 409
    with app.state.sessions() as db:
        scan(db, app.state.clock(), app.state.settings)
        db.commit()
        task = db.get(Duty, result.json()["task"]["id"])
        assert task.is_override and task.task_text == "临时清洁任务"


def test_custom_range_and_member_validation(client, app):
    a, ha, b, hb, dorm = setup_dorm(client)
    day = local_date(app.state.clock())
    payload = {
        "assignee_id": a,
        "task_text": "清洁",
        "deadline_time": "22:00",
        "expected_version": dorm["schedule_version"],
    }
    for date in [day - timedelta(days=1), day + timedelta(days=90)]:
        assert (
            client.post("/duties/custom", headers=ha, json={**payload, "duty_date": str(date)}).status_code
            == 422
        )
    assert (
        client.post(
            "/duties/custom", headers=ha, json={**payload, "duty_date": str(day), "assignee_id": 9999}
        ).status_code
        == 422
    )
    assert (
        client.patch("/duties/1", headers=ha, json={"expected_version": dorm["schedule_version"]}).status_code
        == 422
    )


def test_negative_anchor_and_eligible_day_count():
    from datetime import date

    anchor = date(2026, 10, 12)  # Monday
    draft = SimpleNamespace(
        rotation_order=[1, 2],
        rotation_start_date=anchor,
        task_text="clean",
        deadline_time="22:00",
        schedule_rules=ScheduleRules(
            weekdays=[1, 2, 3, 4, 5], rotation_days=2, skip_dates=[date(2026, 10, 14)]
        ).model_dump(mode="json"),
    )
    assert planned(draft, date(2026, 10, 11)) is None
    assert planned(draft, date(2026, 10, 9))["assignee_id"] == 2
    assert planned(draft, date(2026, 10, 12))["assignee_id"] == 1
    assert planned(draft, date(2026, 10, 13))["assignee_id"] == 1
    assert planned(draft, date(2026, 10, 14)) is None
    assert planned(draft, date(2026, 10, 15))["assignee_id"] == 2
    assert planned(draft, date(2026, 10, 16))["assignee_id"] == 2
    assert planned(draft, date(2026, 10, 19))["assignee_id"] == 1


def test_changed_reminder_content_and_rest_day_links(client, app):
    from app.models.entities import Notification

    a, ha, b, hb, dorm = setup_dorm(client)
    tomorrow = local_date(app.state.clock()) + timedelta(days=1)
    with app.state.sessions() as db:
        task = db.scalar(select(Duty).where(Duty.dorm_id == dorm["id"], Duty.duty_date == tomorrow))
        tid = task.id
        note = Notification(
            user_id=task.assignee_id,
            dorm_id=dorm["id"],
            task_id=tid,
            reminder_kind="previous",
            scheduled_at=app.state.clock(),
            title="明天轮到你值日",
            body="old",
            dedupe_key="custom-test-note",
            delivery_state={},
        )
        db.add(note)
        db.commit()
        nid = note.id
    result = client.patch(
        f"/duties/{tid}",
        headers=ha,
        json={
            "expected_version": current(client, ha)["schedule_version"],
            "task_text": "清洁厨房",
            "deadline_time": "20:10",
        },
    )
    assert result.status_code == 200
    with app.state.sessions() as db:
        note = db.get(Notification, nid)
        assert "清洁厨房" in note.body and "20:10" in note.body and not note.is_cancelled
    assert configure(client, ha, schedule_rules={"skip_dates": [str(tomorrow)]}).status_code == 200
    with app.state.sessions() as db:
        assert db.get(Duty, tid) is None
        note = db.get(Notification, nid)
        assert note.is_cancelled and note.task_id is None
