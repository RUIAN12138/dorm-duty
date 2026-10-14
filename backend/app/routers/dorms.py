import secrets
from fastapi import APIRouter, Depends, Request
from sqlalchemy import select, update
from app.core.database import get_db
from app.core.auth import current_user, current_dorm, version
from app.core.errors import fail
from app.core.time import local_date
from app.models.entities import Dorm, Member, User, Duty
from app.schemas.inputs import CreateDorm, JoinDorm, DormPatch, Transfer
from app.services.scheduling import dorm_view, replan, validate_order, cancel_changed

router = APIRouter(prefix="/dorms", tags=["宿舍"])


def code():
    return secrets.token_hex(4).upper()


def claim(db, user, dorm_id):
    count = db.execute(
        update(User).where(User.id == user.id, User.current_dorm_id.is_(None)).values(current_dorm_id=dorm_id)
    ).rowcount
    if count != 1:
        fail(409, "already_joined", "请先退出当前宿舍")
    user.current_dorm_id = dorm_id


@router.post("", status_code=201)
def create(body: CreateDorm, request: Request, user=Depends(current_user), db=Depends(get_db)):
    if user.current_dorm_id:
        fail(409, "already_joined", "你已经加入宿舍")
    dorm = Dorm(
        name=body.name,
        invite_code=code(),
        admin_user_id=user.id,
        rotation_order=[user.id],
        rotation_start_date=local_date(request.app.state.clock()),
    )
    db.add(dorm)
    db.flush()
    claim(db, user, dorm.id)
    db.add(Member(dorm_id=dorm.id, user_id=user.id, role="admin", sort_order=0))
    db.flush()
    return dorm_view(db, dorm, user)


@router.post("/join")
def join(body: JoinDorm, request: Request, user=Depends(current_user), db=Depends(get_db)):
    dorm = db.scalar(select(Dorm).where(Dorm.invite_code == body.invite_code.upper()).with_for_update())
    if not dorm:
        fail(404, "invalid_invite", "邀请码无效或已更新")
    if user.current_dorm_id == dorm.id:
        current_dorm(db, user)
        return dorm_view(db, dorm, user)
    claim(db, user, dorm.id)
    member = db.scalar(select(Member).where(Member.dorm_id == dorm.id, Member.user_id == user.id))
    if member:
        member.is_active, member.left_at, member.role = True, None, "member"
        member.joined_at = request.app.state.clock()
        member.sort_order = len(dorm.rotation_order)
    else:
        db.add(Member(dorm_id=dorm.id, user_id=user.id, sort_order=len(dorm.rotation_order)))
    dorm.rotation_order = [*dorm.rotation_order, user.id]
    dorm.schedule_version += 1
    db.flush()
    replan(db, dorm, request.app.state.clock())
    return dorm_view(db, dorm, user)


@router.get("/current")
def current(user=Depends(current_user), db=Depends(get_db)):
    if not user.current_dorm_id:
        return None
    return dorm_view(db, current_dorm(db, user), user)


@router.patch("/current")
def configure(body: DormPatch, request: Request, user=Depends(current_user), db=Depends(get_db)):
    dorm = current_dorm(db, user, admin=True)
    version(dorm, body.expected_version)
    changed_rotation = any(
        getattr(body, key) is not None
        for key in ("rotation_order", "rotation_start_date", "schedule_rules", "task_text", "deadline_time")
    )
    if body.rotation_order is not None:
        validate_order(db, dorm, body.rotation_order)
        for index, uid in enumerate(body.rotation_order):
            db.execute(
                update(Member)
                .where(Member.dorm_id == dorm.id, Member.user_id == uid)
                .values(sort_order=index)
            )
    for key, value in body.model_dump(exclude_none=True, mode="json").items():
        if key not in ("expected_version", "regenerate"):
            setattr(dorm, key, body.rotation_start_date if key == "rotation_start_date" else value)
    effect = None
    if changed_rotation or body.regenerate:
        effect = replan(db, dorm, request.app.state.clock(), reset_anchor=False)
    db.flush()
    return {**dorm_view(db, dorm, user), "effect": effect}


def remove_member(db, dorm, uid, now):
    if uid == dorm.admin_user_id:
        fail(409, "transfer_first", "管理员请先转移管理权限")
    member = db.scalar(
        select(Member).where(Member.dorm_id == dorm.id, Member.user_id == uid, Member.is_active.is_(True))
    )
    if not member:
        fail(404, "member_missing", "成员不存在")
    if db.scalar(
        select(Duty.id).where(
            Duty.dorm_id == dorm.id,
            Duty.assignee_id == uid,
            Duty.duty_date == local_date(now),
            Duty.status == "pending",
        )
    ):
        fail(409, "today_pending", "该成员今天尚未完成值日，请先完成或调整今天排班")
    member.is_active, member.left_at = False, now
    db.execute(update(User).where(User.id == uid).values(current_dorm_id=None))
    dorm.rotation_order = [x for x in dorm.rotation_order if x != uid]
    dorm.schedule_version += 1
    db.flush()
    effect = replan(db, dorm, now)
    cancel_changed(db, dorm.id)
    return effect


@router.post("/current/leave")
def leave(request: Request, user=Depends(current_user), db=Depends(get_db)):
    dorm = current_dorm(db, user)
    effect = remove_member(db, dorm, user.id, request.app.state.clock())
    return {"ok": True, "effect": effect}


@router.delete("/current/members/{uid}")
def remove(uid: int, expected_version: int, request: Request, user=Depends(current_user), db=Depends(get_db)):
    dorm = current_dorm(db, user, admin=True)
    if dorm.schedule_version != expected_version:
        fail(409, "stale_version", "成员已变化，请刷新")
    return remove_member(db, dorm, uid, request.app.state.clock())


@router.post("/current/transfer-admin")
def transfer(body: Transfer, user=Depends(current_user), db=Depends(get_db)):
    dorm = current_dorm(db, user, admin=True)
    version(dorm, body.expected_version)
    target = db.scalar(
        select(Member).where(
            Member.dorm_id == dorm.id, Member.user_id == body.user_id, Member.is_active.is_(True)
        )
    )
    if not target or target.user_id == user.id:
        fail(422, "invalid_admin", "请选择其他有效成员")
    db.execute(
        update(Member).where(Member.dorm_id == dorm.id, Member.is_active.is_(True)).values(role="member")
    )
    target.role = "admin"
    dorm.admin_user_id = target.user_id
    db.flush()
    return dorm_view(db, dorm, user)


@router.post("/current/invite-code/rotate")
def rotate(user=Depends(current_user), db=Depends(get_db)):
    dorm = current_dorm(db, user, admin=True)
    dorm.invite_code = code()
    dorm.schedule_version += 1
    return {"invite_code": dorm.invite_code, "schedule_version": dorm.schedule_version}
