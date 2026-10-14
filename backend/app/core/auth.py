from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
import jwt
from app.core.database import get_db
from app.core.errors import fail
from app.models.entities import User, Member, Dorm

bearer = HTTPBearer(auto_error=False)


def current_user(
    request: Request, credentials: HTTPAuthorizationCredentials | None = Depends(bearer), db=Depends(get_db)
):
    if not credentials:
        fail(401, "unauthorized", "请先登录")
    try:
        payload = jwt.decode(
            credentials.credentials,
            request.app.state.settings.jwt_secret,
            algorithms=["HS256"],
            options={"require": ["exp", "sub"]},
        )
        uid = int(payload["sub"])
    except (jwt.PyJWTError, ValueError, TypeError):
        fail(401, "unauthorized", "登录已过期，请重新登录")
    query = select(User).where(User.id == uid)
    if db.info.get("write"):
        query = query.with_for_update()
    user = db.scalar(query)
    if not user:
        fail(401, "unauthorized", "账号不存在")
    return user


def current_dorm(db, user, admin=False):
    query = select(Dorm).where(Dorm.id == user.current_dorm_id)
    if db.info.get("write"):
        query = query.with_for_update()
    dorm = db.scalar(query)
    member = db.scalar(
        select(Member).where(
            Member.dorm_id == user.current_dorm_id, Member.user_id == user.id, Member.is_active.is_(True)
        )
    )
    if not dorm or not member:
        fail(403, "no_dorm", "请先创建或加入宿舍")
    if admin and (member.role != "admin" or dorm.admin_user_id != user.id):
        fail(403, "admin_required", "只有宿舍管理员可以操作")
    return dorm


def version(dorm, expected):
    if dorm.schedule_version != expected:
        fail(409, "stale_version", "排班已被更新，请刷新后重试")
    dorm.schedule_version += 1
