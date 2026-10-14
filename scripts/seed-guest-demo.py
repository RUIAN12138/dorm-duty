#!/usr/bin/env python3
"""Create one isolated demo room in an explicitly selected, already migrated database.

The marker account makes repeat calls a read-only lookup. Generated account passwords are never retained
or displayed. No pre-existing room is selected by its name or changed by this script.
"""

import argparse
import json
from pathlib import Path
import secrets
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from pwdlib import PasswordHash  # noqa: E402
from sqlalchemy import select, text  # noqa: E402
from app.core.database import make_database  # noqa: E402
from app.core.time import local_date, utcnow  # noqa: E402
from app.models.entities import Dorm, Member, User  # noqa: E402
from app.services.scheduling import generate  # noqa: E402

MARKER_USERNAME = "guest_demo_v1_admin"
NICKNAMES = ("张同学", "李同学", "王同学", "陈同学", "刘同学", "赵同学")
USERNAMES = (MARKER_USERNAME, *(f"guest_demo_v1_{i:02d}" for i in range(2, 7)))


def result(db, room):
    count = len(
        list(db.scalars(select(Member.id).where(Member.dorm_id == room.id, Member.is_active.is_(True))))
    )
    return {"id": room.id, "name": room.name, "invite_code": room.invite_code, "member_count": count}


def seed_guest_demo(sessions, now=None):
    now = now or utcnow()
    with sessions() as db, db.begin():
        if db.bind.dialect.name == "sqlite":
            db.execute(text("BEGIN IMMEDIATE"))
        marker = db.scalar(select(User).where(User.username == MARKER_USERNAME).with_for_update())
        if marker:
            room = db.get(Dorm, marker.current_dorm_id) if marker.current_dorm_id else None
            active_ids = set(
                db.scalars(
                    select(Member.user_id).where(
                        Member.dorm_id == marker.current_dorm_id, Member.is_active.is_(True)
                    )
                )
            )
            users = list(db.scalars(select(User).where(User.username.in_(USERNAMES))))
            if (
                not room
                or room.admin_user_id != marker.id
                or len(users) != len(NICKNAMES)
                or active_ids != {u.id for u in users}
            ):
                raise RuntimeError("演示标记存在但宿舍状态已变化；请先人工核对，不自动覆盖现有数据")
            return result(db, room)
        if db.scalar(select(User.id).where(User.username.in_(USERNAMES))):
            raise RuntimeError("演示账号标记不完整；请先人工核对，不自动覆盖现有数据")

        hasher = PasswordHash.recommended()
        users = []
        for username, nickname in zip(USERNAMES, NICKNAMES, strict=True):
            user = User(
                username=username,
                nickname=nickname,
                password_hash=hasher.hash(secrets.token_urlsafe(48)),
            )
            db.add(user)
            users.append(user)
        db.flush()
        invite_code = secrets.token_hex(4).upper()
        while db.scalar(select(Dorm.id).where(Dorm.invite_code == invite_code)):
            invite_code = secrets.token_hex(4).upper()
        day = local_date(now)
        room = Dorm(
            name="6-402",
            invite_code=invite_code,
            admin_user_id=users[0].id,
            rotation_order=[u.id for u in users],
            rotation_start_date=day,
            schedule_rules={"horizon_days": 30},
        )
        db.add(room)
        db.flush()
        for index, user in enumerate(users):
            user.current_dorm_id = room.id
            db.add(
                Member(
                    dorm_id=room.id,
                    user_id=user.id,
                    role="admin" if index == 0 else "member",
                    sort_order=index,
                )
            )
        db.flush()
        generate(db, room, day, 30, now)
        return result(db, room)


def main():
    parser = argparse.ArgumentParser(description="创建独立的六人免登录演示宿舍，不改动已有宿舍")
    parser.add_argument("--database-url", required=True, help="明确指定已完成 Alembic 迁移的数据库")
    args = parser.parse_args()
    engine, sessions = make_database(args.database_url)
    try:
        print(json.dumps(seed_guest_demo(sessions), ensure_ascii=False))
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
