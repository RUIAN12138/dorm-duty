from datetime import timedelta
from sqlalchemy import select, func
from app.models.entities import Duty, Member, User, Notification
from app.core.errors import fail
from app.core.time import local_date, deadline, SHANGHAI
from app.schemas.inputs import ScheduleRules


def active_ids(db, dorm):
    return list(
        db.scalars(
            select(Member.user_id)
            .where(Member.dorm_id == dorm.id, Member.is_active.is_(True))
            .order_by(Member.sort_order, Member.id)
        )
    )


def validate_order(db, dorm, order):
    if not order or len(set(order)) != len(order) or set(order) != set(active_ids(db, dorm)):
        fail(422, "invalid_order", "轮换顺序必须包含每位有效成员，且不能重复")


def cancel_changed(db, dorm_id):
    notes = db.scalars(
        select(Notification).where(
            Notification.dorm_id == dorm_id,
            Notification.is_cancelled.is_(False),
            Notification.task_id.is_not(None),
        )
    )
    for note in notes:
        task = db.get(Duty, note.task_id)
        member = db.scalar(
            select(Member).where(
                Member.dorm_id == dorm_id, Member.user_id == note.user_id, Member.is_active.is_(True)
            )
        )
        if not task or task.status == "completed" or task.assignee_id != note.user_id or not member:
            note.is_cancelled = True
        else:
            # Pending in-app reminders must reflect the edited task and local deadline.
            note.body = f"{task.duty_date.isoformat()} · {task.task_text}，截止 {task.deadline_at.astimezone(SHANGHAI):%H:%M}"


def rules_for(dorm):
    return ScheduleRules.model_validate(dorm.schedule_rules or {})


def eligible(day, rules):
    return day.isoweekday() in rules.weekdays and day not in rules.skip_dates


def slot_index(anchor, day, rules):
    # Only eligible dates consume a turn. Counting full weeks keeps distant anchors cheap.
    start, end = (anchor, day) if day >= anchor else (day, anchor)
    count_days = (end - start).days
    weeks, tail = divmod(count_days, 7)
    count = weeks * len(rules.weekdays)
    count += sum((start + timedelta(days=i)).isoweekday() in rules.weekdays for i in range(tail))
    count -= sum(start <= skip < end and skip.isoweekday() in rules.weekdays for skip in rules.skip_dates)
    return count if day >= anchor else -count


def planned(dorm, day):
    rules = rules_for(dorm)
    if not eligible(day, rules):
        return None
    index = slot_index(dorm.rotation_start_date, day, rules) // rules.rotation_days
    template = rules.weekly_tasks.get(str(day.isoweekday()))
    return {
        "assignee_id": dorm.rotation_order[index % len(dorm.rotation_order)],
        "task_text": (template.task_text if template else None) or dorm.task_text,
        "deadline_at": deadline(day, (template.deadline_time if template else None) or dorm.deadline_time),
    }


def discard_pending(db, task):
    # Notifications keep their text history but must no longer link to a deleted future task.
    for note in db.scalars(select(Notification).where(Notification.task_id == task.id)):
        note.is_cancelled, note.task_id = True, None
    db.flush()
    db.delete(task)


def generate(db, dorm, start, days, now, replace=False):
    today = local_date(now)
    end = start + timedelta(days=days - 1)
    if start < today or end > today + timedelta(days=89) or (replace and start <= today):
        fail(422, "invalid_range", "生成范围限未来 90 天；重排必须从明天或之后开始")
    validate_order(db, dorm, dorm.rotation_order)
    names = {u.id: u.nickname for u in db.scalars(select(User).where(User.id.in_(dorm.rotation_order)))}
    tasks = {
        t.duty_date: t
        for t in db.scalars(select(Duty).where(Duty.dorm_id == dorm.id, Duty.duty_date.between(start, end)))
    }
    added = updated = skipped = removed = 0
    for offset in range(days):
        day = start + timedelta(days=offset)
        task = tasks.get(day)
        if task and (not replace or task.status == "completed"):
            skipped += 1
            continue
        plan = planned(dorm, day)
        if plan is None:
            if task and replace:
                discard_pending(db, task)
                removed += 1
            else:
                skipped += 1
            continue
        uid = plan["assignee_id"]
        if not task:
            task = Duty(dorm_id=dorm.id, duty_date=day)
            db.add(task)
            added += 1
        else:
            updated += 1
        task.assignee_id = uid
        task.assignee_name_snapshot = names[uid]
        task.task_text = plan["task_text"]
        task.deadline_at = plan["deadline_at"]
        task.status = "pending"
        task.is_override = False
    db.flush()
    cancel_changed(db, dorm.id)
    return {
        "added": added,
        "updated": updated,
        "skipped": skipped,
        "removed": removed,
        "start_date": start,
        "end_date": end,
        "schedule_version": dorm.schedule_version,
    }


def replan(db, dorm, now, reset_anchor=True):
    today = local_date(now)
    last = db.scalar(
        select(func.max(Duty.duty_date)).where(
            Duty.dorm_id == dorm.id, Duty.status == "pending", Duty.duty_date > today
        )
    )
    start = today + timedelta(days=1)
    end = min(
        today + timedelta(days=89),
        max(today + timedelta(days=rules_for(dorm).horizon_days), last or start),
    )
    if reset_anchor:
        dorm.rotation_start_date = start
    return generate(db, dorm, start, (end - start).days + 1, now, replace=True)


def task_view(task, now, uid=None):
    late = bool(task.completed_at and task.completed_at > task.deadline_at)
    display = (
        "completed_late"
        if late
        else "completed"
        if task.status == "completed"
        else ("overdue" if now > task.deadline_at else "pending")
    )
    return {
        "id": task.id,
        "duty_date": task.duty_date,
        "assignee_id": task.assignee_id,
        "assignee_name_snapshot": task.assignee_name_snapshot,
        "task_text": task.task_text,
        "deadline_at": task.deadline_at,
        "status": task.status,
        "completed_at": task.completed_at,
        "is_override": task.is_override,
        "display_status": display,
        "is_late": late,
        "can_complete": task.status == "pending"
        and task.assignee_id == uid
        and task.duty_date <= local_date(now),
    }


def dorm_view(db, dorm, user):
    rows = db.execute(
        select(Member, User)
        .join(User, User.id == Member.user_id)
        .where(Member.dorm_id == dorm.id, Member.is_active.is_(True))
        .order_by(Member.sort_order, Member.id)
    )
    members = [{"user_id": m.user_id, "nickname": u.nickname, "role": m.role} for m, u in rows]
    return {
        "id": dorm.id,
        "name": dorm.name,
        "invite_code": dorm.invite_code,
        "admin_user_id": dorm.admin_user_id,
        "is_admin": dorm.admin_user_id == user.id,
        "members": members,
        "rotation_order": dorm.rotation_order,
        "rotation_start_date": dorm.rotation_start_date,
        "deadline_time": dorm.deadline_time,
        "task_text": dorm.task_text,
        "schedule_rules": rules_for(dorm).model_dump(mode="json"),
        "schedule_version": dorm.schedule_version,
    }
