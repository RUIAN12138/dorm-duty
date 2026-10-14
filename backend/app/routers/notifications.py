from fastapi import APIRouter, Depends, Request, Query
from sqlalchemy import select, func, or_
from app.core.auth import current_user
from app.core.database import get_db
from app.core.errors import fail
from app.models.entities import Notification, Subscription
from app.schemas.inputs import Subscribe, Endpoint
from app.services.reminders import push_ready, device_states

router = APIRouter(tags=["通知"])


@router.get("/notifications")
def notes(
    unread_only: bool = False,
    page: int = Query(1, ge=1),
    page_size: int = Query(30, ge=1, le=100),
    user=Depends(current_user),
    db=Depends(get_db),
):
    base = select(Notification).where(
        Notification.user_id == user.id,
        or_(Notification.is_cancelled.is_(False), Notification.read_at.is_not(None)),
    )
    unread = db.scalar(
        select(func.count()).select_from(base.where(Notification.read_at.is_(None)).subquery())
    )
    query = base.where(Notification.read_at.is_(None)) if unread_only else base
    total = db.scalar(select(func.count()).select_from(query.subquery()))
    rows = db.scalars(
        query.order_by(Notification.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    )
    return {
        "items": [
            {
                "id": n.id,
                "title": n.title,
                "body": n.body,
                "read_at": n.read_at,
                "created_at": n.created_at,
                "task_id": n.task_id,
            }
            for n in rows
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
        "unread_count": unread,
    }


@router.patch("/notifications/{note_id}/read")
def read(note_id: int, request: Request, user=Depends(current_user), db=Depends(get_db)):
    note = db.scalar(select(Notification).where(Notification.id == note_id, Notification.user_id == user.id))
    if not note:
        fail(404, "not_found", "消息不存在")
    note.read_at = note.read_at or request.app.state.clock()
    return {"ok": True}


@router.get("/push/public-key")
def public_key(request: Request, user=Depends(current_user)):
    settings = request.app.state.settings
    return {
        "available": push_ready(settings),
        "public_key": settings.vapid_public_key if push_ready(settings) else None,
    }


@router.post("/push/subscribe")
def subscribe(body: Subscribe, request: Request, user=Depends(current_user), db=Depends(get_db)):
    if not push_ready(request.app.state.settings):
        fail(503, "push_unconfigured", "服务尚未配置系统推送，站内通知仍可使用")
    sub = db.scalar(select(Subscription).where(Subscription.endpoint == body.endpoint).with_for_update())
    if sub and sub.user_id != user.id:
        fail(409, "subscription_owned", "设备订阅已关联其他账号，请先取消旧订阅")
    if not sub:
        sub = Subscription(user_id=user.id, endpoint=body.endpoint)
        db.add(sub)
    sub.p256dh, sub.auth = body.keys.p256dh, body.keys.auth
    sub.is_active, sub.updated_at = True, request.app.state.clock()
    user.push_enabled = True
    db.flush()
    return {"ok": True, "id": sub.id}


@router.post("/push/unsubscribe")
def unsubscribe(body: Endpoint, user=Depends(current_user), db=Depends(get_db)):
    sub = db.scalar(select(Subscription).where(Subscription.endpoint == body.endpoint))
    if sub and sub.user_id != user.id:
        fail(404, "not_found", "订阅不存在")
    if sub:
        sub.is_active = False
    return {"ok": True}


@router.post("/push/test")
def test_push(request: Request, user=Depends(current_user), db=Depends(get_db)):
    settings = request.app.state.settings
    if not push_ready(settings):
        fail(503, "push_unconfigured", "服务尚未配置系统推送")
    states = device_states(db, user, settings)
    if not states:
        fail(409, "no_device", "请先开启通知并订阅本设备")
    now = request.app.state.clock()
    key = f"test:{user.id}:{now:%Y%m%d%H%M}"
    if db.scalar(select(Notification.id).where(Notification.dedupe_key == key)):
        fail(429, "rate_limit", "每分钟只能发送一次测试通知")
    db.add(
        Notification(
            user_id=user.id,
            reminder_kind="test",
            scheduled_at=now,
            created_at=now,
            title="轮到 · 测试通知",
            body="系统推送已接通。记得把宿舍的小事轮流做好。",
            dedupe_key=key,
            delivery_state=states,
        )
    )
    return {"status": "queued", "devices": len(states)}
