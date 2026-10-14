from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import select
from app.core.database import get_db
from app.core.errors import fail
from app.core.time import local_date
from app.models.entities import Dorm, Duty, Member, User
from app.services.scheduling import task_view

router = APIRouter(prefix="/guest", tags=["免登录查看"])


def guest_dorm(db, invite_code, request):
    code = (invite_code if invite_code is not None else request.app.state.settings.guest_default_invite_code)
    code = code.strip().upper()
    if not code:
        fail(400, "invite_required", "请先输入宿舍邀请码")
    dorm = db.scalar(select(Dorm).where(Dorm.invite_code == code))
    if not dorm:
        fail(404, "invalid_invite", "邀请码无效或已更新")
    return dorm


@router.get("/dorm")
def dorm(
    request: Request,
    invite_code: str | None = Query(None, min_length=6, max_length=16),
    db=Depends(get_db),
):
    room = guest_dorm(db, invite_code, request)
    rows = db.execute(
        select(Member.user_id, User.nickname)
        .join(User, User.id == Member.user_id)
        .where(Member.dorm_id == room.id, Member.is_active.is_(True))
        .order_by(Member.sort_order, Member.id)
    )
    return {
        "id": room.id,
        "name": room.name,
        "members": [{"user_id": uid, "nickname": nickname} for uid, nickname in rows],
    }


@router.get("/tasks")
def tasks(
    request: Request,
    invite_code: str | None = Query(None, min_length=6, max_length=16),
    member_id: int = Query(ge=1),
    db=Depends(get_db),
):
    room = guest_dorm(db, invite_code, request)
    member = db.execute(
        select(Member.user_id, User.nickname)
        .join(User, User.id == Member.user_id)
        .where(Member.dorm_id == room.id, Member.user_id == member_id, Member.is_active.is_(True))
    ).first()
    if not member:
        fail(404, "member_missing", "成员已离开宿舍或不存在")
    now = request.app.state.clock()
    day = local_date(now)
    query = select(Duty).where(Duty.dorm_id == room.id, Duty.assignee_id == member_id)
    today_task = db.scalar(query.where(Duty.duty_date == day))
    next_task = db.scalar(
        query.where(Duty.duty_date > day, Duty.status == "pending").order_by(Duty.duty_date).limit(1)
    )
    # Selecting a name is a viewing preference, never authentication or permission to complete a duty.
    return {
        "today": day,
        "server_time": now,
        "member": {"user_id": member.user_id, "nickname": member.nickname},
        "today_task": task_view(today_task, now) if today_task else None,
        "next_task": task_view(next_task, now) if next_task else None,
    }
