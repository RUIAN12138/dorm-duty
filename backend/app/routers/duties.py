from datetime import date, timedelta
from types import SimpleNamespace
from fastapi import APIRouter, Depends, Request, Query
from sqlalchemy import select, update, func
from app.core.auth import current_user, current_dorm, version
from app.core.database import get_db
from app.core.errors import fail
from app.core.time import local_date, deadline
from app.models.entities import Duty, User, Member
from app.schemas.inputs import Generate, Assign, SchedulePreview, CustomDuty
from app.services.scheduling import generate, task_view, cancel_changed, planned, validate_order

router = APIRouter(prefix="/duties", tags=["值日"])


@router.post("/generate")
def generate_tasks(body: Generate, request: Request, user=Depends(current_user), db=Depends(get_db)):
    dorm = current_dorm(db, user, True)
    version(dorm, body.expected_version)
    return generate(db, dorm, body.start_date, body.days, request.app.state.clock())


@router.post("/regenerate")
def regenerate(body: Generate, request: Request, user=Depends(current_user), db=Depends(get_db)):
    dorm = current_dorm(db, user, True)
    version(dorm, body.expected_version)
    return generate(db, dorm, body.start_date, body.days, request.app.state.clock(), replace=True)


@router.post("/preview")
def preview(body: SchedulePreview, request: Request, user=Depends(current_user), db=Depends(get_db)):
    dorm = current_dorm(db, user, True)
    validate_order(db, dorm, body.rotation_order)
    if abs((body.start_date - local_date(request.app.state.clock())).days) > 365:
        fail(422, "invalid_range", "预览开始日期需在一年以内")
    draft = SimpleNamespace(**body.model_dump())
    draft.schedule_rules = body.schedule_rules.model_dump(mode="json")
    names = {u.id: u.nickname for u in db.scalars(select(User).where(User.id.in_(body.rotation_order)))}
    result = []
    for i in range(body.days):
        day = body.start_date + timedelta(days=i)
        plan = planned(draft, day)
        result.append(
            {
                "duty_date": day,
                "task": {**plan, "assignee_name": names[plan["assignee_id"]]} if plan else None,
            }
        )
    return {"items": result}


def valid_assignee(db, dorm, uid):
    if not db.scalar(
        select(Member.id).where(Member.dorm_id == dorm.id, Member.user_id == uid, Member.is_active.is_(True))
    ):
        fail(422, "invalid_member", "请选择有效宿舍成员")


@router.post("/custom", status_code=201)
def custom(body: CustomDuty, request: Request, user=Depends(current_user), db=Depends(get_db)):
    dorm = current_dorm(db, user, True)
    version(dorm, body.expected_version)
    today = local_date(request.app.state.clock())
    if not today <= body.duty_date <= today + timedelta(days=89):
        fail(422, "invalid_range", "手工安排限今天至未来 90 天")
    if db.scalar(select(Duty.id).where(Duty.dorm_id == dorm.id, Duty.duty_date == body.duty_date)):
        fail(409, "task_exists", "这一天已有排班，请刷新后修改")
    valid_assignee(db, dorm, body.assignee_id)
    task = Duty(
        dorm_id=dorm.id,
        duty_date=body.duty_date,
        assignee_id=body.assignee_id,
        assignee_name_snapshot=db.get(User, body.assignee_id).nickname,
        task_text=body.task_text,
        deadline_at=deadline(body.duty_date, body.deadline_time),
        is_override=True,
    )
    db.add(task)
    db.flush()
    return {
        "task": task_view(task, request.app.state.clock(), user.id),
        "schedule_version": dorm.schedule_version,
    }


@router.get("/today")
def today(request: Request, user=Depends(current_user), db=Depends(get_db)):
    dorm = current_dorm(db, user)
    now = request.app.state.clock()
    day = local_date(now)
    task = db.scalar(select(Duty).where(Duty.dorm_id == dorm.id, Duty.duty_date == day))
    recent = db.scalars(
        select(Duty)
        .where(Duty.dorm_id == dorm.id, Duty.duty_date > day, Duty.duty_date <= day + timedelta(days=7))
        .order_by(Duty.duty_date)
    )
    return {
        "today": day,
        "server_time": now,
        "task": task_view(task, now, user.id) if task else None,
        "recent": [task_view(t, now, user.id) for t in recent],
    }


@router.get("")
def duties(
    request: Request,
    start_date: date,
    end_date: date,
    status: str | None = None,
    assignee_id: int | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(30, ge=1, le=100),
    user=Depends(current_user),
    db=Depends(get_db),
):
    dorm = current_dorm(db, user)
    if end_date < start_date or (end_date - start_date).days > 89:
        fail(422, "invalid_range", "查询范围最长 90 天")
    now = request.app.state.clock()
    query = select(Duty).where(Duty.dorm_id == dorm.id, Duty.duty_date.between(start_date, end_date))
    if assignee_id is not None:
        query = query.where(Duty.assignee_id == assignee_id)
    if status == "overdue":
        query = query.where(Duty.status == "pending", Duty.deadline_at < now)
    elif status == "pending":
        query = query.where(Duty.status == "pending", Duty.deadline_at >= now)
    elif status == "completed":
        query = query.where(Duty.status == "completed")
    elif status == "completed_late":
        query = query.where(Duty.status == "completed", Duty.completed_at > Duty.deadline_at)
    elif status:
        fail(422, "invalid_status", "无效的状态筛选")
    total = db.scalar(select(func.count()).select_from(query.subquery()))
    rows = db.scalars(query.order_by(Duty.duty_date.desc()).offset((page - 1) * page_size).limit(page_size))
    return {
        "items": [task_view(t, now, user.id) for t in rows],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


def get_task(db, user, task_id):
    dorm = current_dorm(db, user)
    task = db.scalar(select(Duty).where(Duty.id == task_id, Duty.dorm_id == dorm.id).with_for_update())
    if not task:
        fail(404, "not_found", "任务不存在")
    return dorm, task


@router.patch("/{task_id}")
def assign(task_id: int, body: Assign, request: Request, user=Depends(current_user), db=Depends(get_db)):
    current_dorm(db, user, True)
    dorm, task = get_task(db, user, task_id)
    version(dorm, body.expected_version)
    if task.status == "completed" or task.duty_date < local_date(request.app.state.clock()):
        fail(409, "immutable_task", "已完成或过去的排班不能修改")
    if body.assignee_id is not None:
        valid_assignee(db, dorm, body.assignee_id)
        task.assignee_id = body.assignee_id
        task.assignee_name_snapshot = db.get(User, body.assignee_id).nickname
    if body.task_text is not None:
        task.task_text = body.task_text
    if body.deadline_time is not None:
        task.deadline_at = deadline(task.duty_date, body.deadline_time)
    task.is_override = True
    db.flush()
    cancel_changed(db, dorm.id)
    return {
        "task": task_view(task, request.app.state.clock(), user.id),
        "schedule_version": dorm.schedule_version,
    }


@router.patch("/{task_id}/complete")
def complete(task_id: int, request: Request, user=Depends(current_user), db=Depends(get_db)):
    dorm, task = get_task(db, user, task_id)
    now = request.app.state.clock()
    if task.assignee_id != user.id:
        fail(403, "not_assignee", "只能完成自己的值日任务")
    if task.duty_date > local_date(now):
        fail(409, "future_task", "不能提前完成未来任务")
    count = db.execute(
        update(Duty)
        .where(Duty.id == task.id, Duty.assignee_id == user.id, Duty.status == "pending")
        .values(status="completed", completed_at=now)
    ).rowcount
    if count != 1:
        fail(409, "already_completed", "该任务已完成")
    dorm.schedule_version += 1
    db.flush()
    db.refresh(task)
    cancel_changed(db, dorm.id)
    return task_view(task, now, user.id)
