from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta, datetime, timezone
from sqlalchemy import select, text, inspect
import jwt
from app.models.entities import User, Member, Duty
from app.core.time import local_date, deadline
from app.services.scheduling import task_view
from conftest import account, setup_dorm, current


def test_auth_and_schema(client, app):
    uid, headers = account(client)
    assert client.get("/auth/me").status_code == 401
    assert (
        client.post("/auth/login", json={"username": "alice", "password": "WrongPass123"}).status_code == 401
    )
    assert (
        client.post(
            "/auth/register", json={"username": "alice", "password": "Password123!", "nickname": "x"}
        ).status_code
        == 409
    )
    assert client.get("/auth/me", headers=headers).json()["id"] == uid
    assert client.patch("/auth/me", headers=headers, json={"password_hash": "x"}).status_code == 422
    old = jwt.encode(
        {"sub": str(uid), "exp": datetime.now(timezone.utc) - timedelta(hours=1)},
        app.state.settings.jwt_secret,
        algorithm="HS256",
    )
    assert client.get("/auth/me", headers={"Authorization": "Bearer " + old}).status_code == 401
    with app.state.sessions() as db:
        assert db.get(User, uid).password_hash != "Password123!"
        assert db.execute(text("PRAGMA foreign_keys")).scalar() == 1
    assert set(inspect(app.state.engine).get_table_names()) == {
        "users",
        "dormitories",
        "dorm_members",
        "duty_tasks",
        "notifications",
        "push_subscriptions",
        "alembic_version",
    }


def test_dorm_permissions(client, app):
    a, ha, b, hb, dorm = setup_dorm(client)
    _, hc = account(client, "carol", "陈同学")
    other = client.post("/dorms", headers=hc, json={"name": "other"}).json()
    assert other["id"] != dorm["id"]
    assert (
        client.post("/dorms/join", headers=ha, json={"invite_code": other["invite_code"]}).status_code == 409
    )
    assert (
        client.post("/dorms/join", headers=hb, json={"invite_code": dorm["invite_code"]}).status_code == 200
    )
    assert len(current(client, ha)["members"]) == 2
    assert (
        client.patch(
            "/dorms/current", headers=hb, json={"name": "evil", "expected_version": dorm["schedule_version"]}
        ).status_code
        == 403
    )
    assert client.post("/dorms/current/leave", headers=ha).status_code == 409
    invalid = client.patch(
        "/dorms/current",
        headers=ha,
        json={"rotation_order": [a, a], "expected_version": dorm["schedule_version"]},
    )
    assert invalid.status_code == 422
    assert current(client, ha)["schedule_version"] == dorm["schedule_version"]
    assert (
        client.post(
            "/dorms/current/transfer-admin",
            headers=ha,
            json={"user_id": b, "expected_version": dorm["schedule_version"]},
        ).status_code
        == 200
    )
    assert current(client, hb)["is_admin"]
    assert client.post("/dorms/current/leave", headers=ha).status_code == 200
    assert client.get("/duties/today", headers=ha).status_code == 403
    with app.state.sessions() as db:
        assert db.scalar(select(Member).where(Member.user_id == a)).is_active is False


def test_generation_idempotency_and_version(client, app):
    a, ha, b, hb, dorm = setup_dorm(client)
    day = local_date(app.state.clock())
    result = client.post(
        "/duties/generate",
        headers=ha,
        json={"start_date": str(day), "days": 30, "expected_version": dorm["schedule_version"]},
    )
    assert result.status_code == 200, result.text
    assert result.json()["added"] == 1  # joining generated tomorrow onwards; today was still empty
    repeated = client.post(
        "/duties/generate",
        headers=ha,
        json={"start_date": str(day), "days": 30, "expected_version": result.json()["schedule_version"]},
    )
    assert repeated.status_code == 200 and repeated.json()["added"] == 0
    assert (
        client.post(
            "/duties/generate", headers=ha, json={"start_date": str(day), "days": 30, "expected_version": 1}
        ).status_code
        == 409
    )
    assert (
        client.post(
            "/duties/generate", headers=hb, json={"start_date": str(day), "days": 30, "expected_version": 1}
        ).status_code
        == 403
    )
    with app.state.sessions() as db:
        tasks = list(db.scalars(select(Duty).where(Duty.dorm_id == dorm["id"]).order_by(Duty.duty_date)))
        assert len(tasks) == 31
        assert tasks[1].assignee_id == a
        assert tasks[2].assignee_id == b
    for start, days in [(day - timedelta(days=1), 30), (day + timedelta(days=89), 2), (day, 91)]:
        response = client.post(
            "/duties/generate",
            headers=ha,
            json={
                "start_date": str(start),
                "days": days,
                "expected_version": current(client, ha)["schedule_version"],
            },
        )
        assert response.status_code == 422


def prepare_today(client, app):
    a, ha, b, hb, dorm = setup_dorm(client)
    day = local_date(app.state.clock())
    assert (
        client.post(
            "/duties/generate",
            headers=ha,
            json={"start_date": str(day), "days": 30, "expected_version": dorm["schedule_version"]},
        ).status_code
        == 200
    )
    task = client.get("/duties/today", headers=ha).json()["task"]
    version = current(client, ha)["schedule_version"]
    assert (
        client.patch(
            f"/duties/{task['id']}", headers=ha, json={"assignee_id": a, "expected_version": version}
        ).status_code
        == 200
    )
    return a, ha, b, hb, dorm, task


def test_complete_permissions_and_preserve_history(client, app):
    a, ha, b, hb, dorm, task = prepare_today(client, app)
    _, hc = account(client, "carol")
    client.post("/dorms", headers=hc, json={"name": "other"})
    url = f"/duties/{task['id']}/complete"
    assert client.patch(url, headers=hb).status_code == 403
    assert client.patch(url, headers=hc).status_code == 404
    result = client.patch(url, headers=ha)
    assert result.status_code == 200
    stamp = result.json()["completed_at"]
    assert client.patch(url, headers=ha).status_code == 409
    client.patch("/auth/me", headers=ha, json={"nickname": "新昵称"})
    assert client.get("/duties/today", headers=ha).json()["task"]["assignee_name_snapshot"] == "张同学"
    assert (
        client.patch(
            f"/duties/{task['id']}",
            headers=ha,
            json={"assignee_id": b, "expected_version": current(client, ha)["schedule_version"]},
        ).status_code
        == 409
    )
    assert (
        client.post(
            "/duties/regenerate",
            headers=ha,
            json={
                "start_date": str(local_date(app.state.clock()) + timedelta(days=1)),
                "days": 30,
                "expected_version": current(client, ha)["schedule_version"],
            },
        ).status_code
        == 200
    )
    assert client.get("/duties/today", headers=ha).json()["task"]["completed_at"] == stamp
    with app.state.sessions() as db:
        future = db.scalar(
            select(Duty).where(Duty.duty_date > local_date(app.state.clock()), Duty.assignee_id == a)
        )
        future_id = future.id
    assert client.patch(f"/duties/{future_id}/complete", headers=ha).status_code == 409


def test_concurrent_complete(client, app):
    a, ha, b, hb, dorm, task = prepare_today(client, app)

    def complete(_):
        return client.patch(f"/duties/{task['id']}/complete", headers=ha).status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(complete, range(2)))
    assert sorted(results) == [200, 409]


def test_concurrent_join_only_one_dorm(client, app):
    _, ha = account(client)
    _, hb = account(client, "bob")
    _, hc = account(client, "carol")
    d1 = client.post("/dorms", headers=ha, json={"name": "one"}).json()
    d2 = client.post("/dorms", headers=hb, json={"name": "two"}).json()

    def join(code):
        return client.post("/dorms/join", headers=hc, json={"invite_code": code}).status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(join, [d1["invite_code"], d2["invite_code"]]))
    assert sorted(results) == [200, 409]
    with app.state.sessions() as db:
        assert (
            len(list(db.scalars(select(Member).where(Member.user_id == 3, Member.is_active.is_(True))))) == 1
        )


def test_leave_today_and_future(client, app):
    a, ha, b, hb, dorm, task = prepare_today(client, app)
    v = current(client, ha)["schedule_version"]
    client.patch(f"/duties/{task['id']}", headers=ha, json={"assignee_id": b, "expected_version": v})
    assert client.post("/dorms/current/leave", headers=hb).status_code == 409
    client.patch(f"/duties/{task['id']}/complete", headers=hb)
    assert client.post("/dorms/current/leave", headers=hb).status_code == 200
    with app.state.sessions() as db:
        assert not db.scalar(
            select(Duty.id).where(
                Duty.assignee_id == b,
                Duty.status == "pending",
                Duty.duty_date > local_date(app.state.clock()),
            )
        )
        assert db.get(Duty, task["id"]).assignee_name_snapshot == "李同学"


def test_override_and_rolling_range(client, app):
    a, ha, b, hb, dorm, task = prepare_today(client, app)
    day = local_date(app.state.clock())
    version = current(client, ha)["schedule_version"]
    client.post(
        "/duties/generate", headers=ha, json={"start_date": str(day), "days": 90, "expected_version": version}
    )
    with app.state.sessions() as db:
        future = db.scalar(select(Duty).where(Duty.duty_date == day + timedelta(days=89)))
        tid = future.id
    assigned = client.patch(
        f"/duties/{tid}",
        headers=ha,
        json={"assignee_id": b, "expected_version": current(client, ha)["schedule_version"]},
    )
    assert assigned.status_code == 200
    client.post(
        "/duties/generate",
        headers=ha,
        json={
            "start_date": str(day),
            "days": 90,
            "expected_version": current(client, ha)["schedule_version"],
        },
    )
    with app.state.sessions() as db:
        assert db.get(Duty, tid).assignee_id == b and db.get(Duty, tid).is_override
    assert client.post("/dorms/current/leave", headers=hb).status_code == 200
    with app.state.sessions() as db:
        assert db.get(Duty, tid).assignee_id == a and not db.get(Duty, tid).is_override


def test_deadline_and_late_completion(client, app):
    a, ha, b, hb, dorm, task = prepare_today(client, app)
    with app.state.sessions() as db:
        t = db.get(Duty, task["id"])
        boundary = t.deadline_at
        assert task_view(t, boundary, a)["display_status"] == "pending"
        assert task_view(t, boundary + timedelta(seconds=1), a)["display_status"] == "overdue"
    app.state.clock = lambda: boundary + timedelta(minutes=1)
    result = client.patch(f"/duties/{task['id']}/complete", headers=ha)
    assert result.status_code == 200 and result.json()["is_late"]
    assert local_date(deadline(local_date(boundary), "00:00")) == local_date(boundary)
    assert local_date(boundary.replace(hour=16, minute=0)) == local_date(boundary) + timedelta(days=1)


def test_invite_rotate_and_invalid_fields(client, app):
    a, ha, b, hb, dorm = setup_dorm(client)
    old = dorm["invite_code"]
    assert client.post("/dorms/current/invite-code/rotate", headers=hb).status_code == 403
    assert client.post("/dorms/current/invite-code/rotate", headers=ha).status_code == 200
    _, hc = account(client, "carol")
    assert client.post("/dorms/join", headers=hc, json={"invite_code": old}).status_code == 404
    assert (
        client.patch(
            "/dorms/current",
            headers=ha,
            json={"expected_version": current(client, ha)["schedule_version"], "deadline_time": "25:00"},
        ).status_code
        == 422
    )
