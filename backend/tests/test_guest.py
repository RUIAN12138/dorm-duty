from datetime import timedelta
import importlib.util
from pathlib import Path
from sqlalchemy import func, select
import pytest
from app.core.time import deadline, local_date
from app.models.entities import Dorm, Duty, Member, User
from conftest import account, setup_dorm


def put_tasks(app, dorm, specs):
    with app.state.sessions() as db:
        for day, uid, state in specs:
            nickname = db.get(User, uid).nickname
            task = db.scalar(select(Duty).where(Duty.dorm_id == dorm["id"], Duty.duty_date == day))
            if task is None:
                task = Duty(dorm_id=dorm["id"], duty_date=day)
                db.add(task)
            task.assignee_id = uid
            task.assignee_name_snapshot = nickname
            task.task_text = f"个人任务 {day}"
            task.deadline_at = deadline(day, "22:00")
            task.status = state
            task.completed_at = deadline(day, "21:00") if state == "completed" else None
        db.commit()


def test_guest_dorm_is_scoped_minimal_and_read_only(client, app):
    a, ha, b, hb, room = setup_dorm(client)
    response = client.get("/guest/dorm", params={"invite_code": room["invite_code"].lower()})
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert response.json() == {
        "id": room["id"],
        "name": "6-402",
        "members": [{"user_id": a, "nickname": "张同学"}, {"user_id": b, "nickname": "李同学"}],
    }
    _, other_auth = account(client, "other")
    other = client.post("/dorms", headers=other_auth, json={"name": "other"}).json()
    before = client.get("/dorms/current", headers=ha).json()
    own_task = client.get(
        "/guest/tasks", params={"invite_code": room["invite_code"], "member_id": a}
    )
    assert own_task.status_code == 200
    assert client.get("/guest/dorm", params={"invite_code": "NOTREAL1"}).status_code == 404
    assert (
        client.get("/guest/tasks", params={"invite_code": other["invite_code"], "member_id": a}).status_code
        == 404
    )
    assert client.get("/dorms/current").status_code == 401
    assert client.post("/duties/generate", json={"days": 30}).status_code == 401
    assert client.patch("/dorms/current", json={"name": "changed", "expected_version": 1}).status_code == 401
    assert client.get("/dorms/current", headers=ha).json() == before


def test_guest_personal_today_and_next_follow_shanghai_date(client, app):
    a, ha, b, hb, room = setup_dorm(client)
    # The local day changes at 16:00 UTC, independently of the browser or operating system time zone.
    now = app.state.clock().replace(hour=16, minute=0, second=0, microsecond=0)
    app.state.clock = lambda: now
    day = local_date(now)
    put_tasks(
        app,
        room,
        [
            (day - timedelta(days=1), a, "pending"),
            (day, a, "pending"),
            (day + timedelta(days=1), b, "pending"),
            (day + timedelta(days=2), a, "completed"),
            (day + timedelta(days=3), a, "pending"),
        ],
    )
    params = {"invite_code": room["invite_code"], "member_id": a}
    response = client.get("/guest/tasks", params=params)
    data = response.json()
    assert data["today"] == str(day)
    assert data["member"] == {"user_id": a, "nickname": "张同学"}
    assert data["today_task"]["duty_date"] == str(day)
    assert data["next_task"]["duty_date"] == str(day + timedelta(days=3))
    assert data["today_task"]["can_complete"] is False
    assert data["next_task"]["can_complete"] is False
    assert client.patch(f"/duties/{data['today_task']['id']}/complete").status_code == 401
    assert client.patch(f"/duties/{data['today_task']['id']}/complete", headers=hb).status_code == 403

    app.state.clock = lambda: now - timedelta(seconds=1)
    data = client.get("/guest/tasks", params=params).json()
    assert data["today"] == str(day - timedelta(days=1))
    assert data["today_task"]["duty_date"] == str(day - timedelta(days=1))
    assert data["next_task"]["duty_date"] == str(day)


def test_guest_empty_today_completed_today_and_empty_schedule(client, app):
    a, ha, b, hb, room = setup_dorm(client)
    day = local_date(app.state.clock())
    put_tasks(app, room, [(day, a, "completed"), (day + timedelta(days=1), b, "pending")])
    bob = client.get("/guest/tasks", params={"invite_code": room["invite_code"], "member_id": b}).json()
    assert bob["today_task"] is None
    assert bob["next_task"]["duty_date"] == str(day + timedelta(days=1))
    alice = client.get("/guest/tasks", params={"invite_code": room["invite_code"], "member_id": a}).json()
    assert alice["today_task"]["display_status"] == "completed"
    assert alice["today_task"]["can_complete"] is False
    with app.state.sessions() as db:
        for task in db.scalars(select(Duty).where(Duty.dorm_id == room["id"], Duty.assignee_id == b)):
            db.delete(task)
        db.commit()
    bob = client.get("/guest/tasks", params={"invite_code": room["invite_code"], "member_id": b}).json()
    assert bob["today_task"] is None and bob["next_task"] is None


def test_guest_default_is_explicit_and_can_be_overridden(client, app):
    a, ha, b, hb, room = setup_dorm(client)
    response = client.get("/guest/dorm")
    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "invite_required"
    assert response.headers["cache-control"] == "no-store"
    app.state.settings.guest_default_invite_code = room["invite_code"]
    assert client.get("/guest/dorm").json()["id"] == room["id"]
    assert client.get("/guest/tasks", params={"member_id": a}).status_code == 200
    _, hc = account(client, "other")
    other = client.post("/dorms", headers=hc, json={"name": "other"}).json()
    assert client.get("/guest/dorm", params={"invite_code": other["invite_code"]}).json()["id"] == other["id"]
    assert client.get("/guest/dorm", params={"invite_code": "NOTREAL1"}).status_code == 404


def test_guest_removed_member_and_rotated_invite_are_rejected(client, app):
    a, ha, b, hb, room = setup_dorm(client)
    with app.state.sessions() as db:
        member = db.scalar(select(Member).where(Member.dorm_id == room["id"], Member.user_id == b))
        member.is_active = False
        db.commit()
    assert (
        client.get("/guest/tasks", params={"invite_code": room["invite_code"], "member_id": b}).status_code
        == 404
    )
    assert client.get("/guest/dorm", params={"invite_code": room["invite_code"]}).json()["members"] == [
        {"user_id": a, "nickname": "张同学"}
    ]
    new_code = client.post("/dorms/current/invite-code/rotate", headers=ha).json()["invite_code"]
    assert client.get("/guest/dorm", params={"invite_code": room["invite_code"]}).status_code == 404
    assert client.get("/guest/dorm", params={"invite_code": new_code}).status_code == 200
    assert client.get("/guest/tasks", params={"invite_code": new_code, "member_id": 0}).status_code == 422


def seed_module():
    path = Path(__file__).parents[2] / "scripts" / "seed-guest-demo.py"
    spec = importlib.util.spec_from_file_location("seed_guest_demo", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_demo_seed_is_isolated_idempotent_and_has_30_real_tasks(client, app):
    a, ha, b, hb, original = setup_dorm(client)
    before = client.get("/dorms/current", headers=ha).json()
    module = seed_module()
    result = module.seed_guest_demo(app.state.sessions, app.state.clock())
    assert set(result) == {"id", "name", "invite_code", "member_count"}
    assert result["id"] != original["id"] and result["member_count"] == 6
    assert module.seed_guest_demo(app.state.sessions, app.state.clock() + timedelta(days=1)) == result
    assert client.get("/dorms/current", headers=ha).json() == before
    with app.state.sessions() as db:
        assert db.scalar(select(func.count()).select_from(Dorm)) == 2
        assert db.scalar(select(func.count()).select_from(User)) == 8
        users = list(db.scalars(select(User).where(User.current_dorm_id == result["id"]).order_by(User.id)))
        assert [u.nickname for u in users] == list(module.NICKNAMES)
        assert all(u.username.startswith("guest_demo_") and u.password_hash.startswith("$argon2") for u in users)
        tasks = list(db.scalars(select(Duty).where(Duty.dorm_id == result["id"]).order_by(Duty.duty_date)))
        day = local_date(app.state.clock())
        assert len(tasks) == 30
        assert [t.duty_date for t in tasks] == [day + timedelta(days=i) for i in range(30)]
        assert [t.assignee_id for t in tasks] == [users[i % 6].id for i in range(30)]
    assert client.get("/guest/dorm", params={"invite_code": result["invite_code"]}).status_code == 200


def test_demo_seed_refuses_to_overwrite_changed_marker(client, app):
    module = seed_module()
    result = module.seed_guest_demo(app.state.sessions, app.state.clock())
    with app.state.sessions() as db:
        member = db.scalar(select(Member).where(Member.dorm_id == result["id"]))
        member.is_active = False
        db.commit()
    with pytest.raises(RuntimeError, match="不自动覆盖现有数据"):
        module.seed_guest_demo(app.state.sessions, app.state.clock())
    with app.state.sessions() as db:
        assert db.scalar(select(func.count()).select_from(Dorm)) == 1
        assert db.scalar(select(func.count()).select_from(Member).where(Member.is_active.is_(False))) == 1
