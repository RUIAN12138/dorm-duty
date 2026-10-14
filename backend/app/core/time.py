from datetime import datetime, timezone
from zoneinfo import ZoneInfo

SHANGHAI = ZoneInfo("Asia/Shanghai")


def utcnow():
    return datetime.now(timezone.utc)


def as_utc(value):
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def local_date(now):
    return as_utc(now).astimezone(SHANGHAI).date()


def deadline(day, hhmm):
    return (
        datetime.fromisoformat(f"{day.isoformat()}T{hhmm}:00")
        .replace(tzinfo=SHANGHAI)
        .astimezone(timezone.utc)
    )
