from datetime import date, datetime
from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    JSON,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy.types import TypeDecorator
from app.core.time import as_utc, utcnow


class UTCDateTime(TypeDecorator):
    impl = DateTime
    cache_ok = True

    def process_bind_param(self, value, dialect):
        return as_utc(value).replace(tzinfo=None) if value else None

    def process_result_value(self, value, dialect):
        return as_utc(value) if value else None


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(32), unique=True)
    password_hash: Mapped[str] = mapped_column(String(256))
    nickname: Mapped[str] = mapped_column(String(32))
    current_dorm_id: Mapped[int | None] = mapped_column(
        ForeignKey("dormitories.id", use_alter=True, name="fk_user_dorm")
    )
    push_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)


class Dorm(Base):
    __tablename__ = "dormitories"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(64))
    invite_code: Mapped[str] = mapped_column(String(16), unique=True)
    admin_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    rotation_order: Mapped[list] = mapped_column(JSON)
    rotation_start_date: Mapped[date] = mapped_column(Date)
    deadline_time: Mapped[str] = mapped_column(String(5), default="22:00")
    task_text: Mapped[str] = mapped_column(String(200), default="扫地、拖地、倒垃圾")
    schedule_rules: Mapped[dict] = mapped_column(JSON, default=dict)
    schedule_version: Mapped[int] = mapped_column(Integer, default=1)


class Member(Base):
    __tablename__ = "dorm_members"
    __table_args__ = (UniqueConstraint("dorm_id", "user_id"), CheckConstraint("role IN ('admin','member')"))
    id: Mapped[int] = mapped_column(primary_key=True)
    dorm_id: Mapped[int] = mapped_column(ForeignKey("dormitories.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    role: Mapped[str] = mapped_column(String(16), default="member")
    sort_order: Mapped[int] = mapped_column(Integer)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    joined_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)
    left_at: Mapped[datetime | None] = mapped_column(UTCDateTime())


class Duty(Base):
    __tablename__ = "duty_tasks"
    __table_args__ = (
        UniqueConstraint("dorm_id", "duty_date"),
        CheckConstraint("status IN ('pending','completed')"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    dorm_id: Mapped[int] = mapped_column(ForeignKey("dormitories.id"), index=True)
    duty_date: Mapped[date] = mapped_column(Date)
    assignee_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    assignee_name_snapshot: Mapped[str] = mapped_column(String(32))
    task_text: Mapped[str] = mapped_column(String(200))
    deadline_at: Mapped[datetime] = mapped_column(UTCDateTime())
    status: Mapped[str] = mapped_column(String(16), default="pending")
    completed_at: Mapped[datetime | None] = mapped_column(UTCDateTime())
    is_override: Mapped[bool] = mapped_column(Boolean, default=False)


class Notification(Base):
    __tablename__ = "notifications"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    dorm_id: Mapped[int | None] = mapped_column(ForeignKey("dormitories.id"))
    task_id: Mapped[int | None] = mapped_column(ForeignKey("duty_tasks.id"))
    reminder_kind: Mapped[str] = mapped_column(String(32))
    scheduled_at: Mapped[datetime] = mapped_column(UTCDateTime())
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)
    read_at: Mapped[datetime | None] = mapped_column(UTCDateTime())
    title: Mapped[str] = mapped_column(String(100))
    body: Mapped[str] = mapped_column(String(300))
    dedupe_key: Mapped[str] = mapped_column(String(120), unique=True)
    is_cancelled: Mapped[bool] = mapped_column(Boolean, default=False)
    delivery_state: Mapped[dict] = mapped_column(JSON, default=dict)


class Subscription(Base):
    __tablename__ = "push_subscriptions"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    endpoint: Mapped[str] = mapped_column(String(2048), unique=True)
    p256dh: Mapped[str] = mapped_column(String(256))
    auth: Mapped[str] = mapped_column(String(128))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
