from datetime import date
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Login(Input):
    username: str = Field(min_length=3, max_length=32, pattern=r"^[A-Za-z0-9_]+$")
    password: str = Field(min_length=8, max_length=128)


class Register(Login):
    nickname: str = Field(min_length=1, max_length=32)


class Profile(Input):
    nickname: str | None = Field(default=None, min_length=1, max_length=32)
    push_enabled: bool | None = None


class CreateDorm(Input):
    name: str = Field(min_length=1, max_length=64)


class JoinDorm(Input):
    invite_code: str = Field(min_length=6, max_length=16)


class Version(Input):
    expected_version: int = Field(ge=1)


class WeekdayTask(Input):
    task_text: str | None = Field(default=None, min_length=1, max_length=200)
    deadline_time: str | None = Field(default=None, pattern=r"^([01]\d|2[0-3]):[0-5]\d$")


class ScheduleRules(Input):
    weekdays: list[int] = Field(default_factory=lambda: list(range(1, 8)), min_length=1, max_length=7)
    rotation_days: int = Field(default=1, ge=1, le=14)
    horizon_days: int = Field(default=30, ge=7, le=90)
    skip_dates: list[date] = Field(default_factory=list, max_length=180)
    weekly_tasks: dict[str, WeekdayTask] = Field(default_factory=dict)

    @field_validator("weekdays")
    @classmethod
    def valid_weekdays(cls, value):
        if len(set(value)) != len(value) or any(day not in range(1, 8) for day in value):
            raise ValueError("每周值日日期必须为不重复的 1 至 7")
        return sorted(value)

    @field_validator("weekly_tasks")
    @classmethod
    def valid_templates(cls, value):
        if any(key not in [str(i) for i in range(1, 8)] for key in value):
            raise ValueError("任务模板的星期必须为 1 至 7")
        return value

    @field_validator("skip_dates")
    @classmethod
    def unique_dates(cls, value):
        return sorted(set(value))


class DormPatch(Version):
    name: str | None = Field(default=None, min_length=1, max_length=64)
    task_text: str | None = Field(default=None, min_length=1, max_length=200)
    deadline_time: str | None = Field(default=None, pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    rotation_order: list[int] | None = None
    rotation_start_date: date | None = None
    schedule_rules: ScheduleRules | None = None
    regenerate: bool = False


class SchedulePreview(Input):
    rotation_order: list[int]
    rotation_start_date: date
    task_text: str = Field(min_length=1, max_length=200)
    deadline_time: str = Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    schedule_rules: ScheduleRules
    start_date: date
    days: int = Field(default=7, ge=1, le=14)


class Generate(Version):
    start_date: date
    days: int = Field(default=30, ge=1, le=90)


class Assign(Version):
    assignee_id: int | None = Field(default=None, gt=0)
    task_text: str | None = Field(default=None, min_length=1, max_length=200)
    deadline_time: str | None = Field(default=None, pattern=r"^([01]\d|2[0-3]):[0-5]\d$")

    @model_validator(mode="after")
    def has_change(self):
        if self.assignee_id is None and self.task_text is None and self.deadline_time is None:
            raise ValueError("至少修改人员、内容或截止时间中的一项")
        return self


class CustomDuty(Version):
    duty_date: date
    assignee_id: int = Field(gt=0)
    task_text: str = Field(min_length=1, max_length=200)
    deadline_time: str = Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")


class Transfer(Version):
    user_id: int = Field(gt=0)


class Endpoint(Input):
    endpoint: str = Field(max_length=2048)

    @field_validator("endpoint")
    @classmethod
    def valid_endpoint(cls, value):
        from urllib.parse import urlparse

        p = urlparse(value)
        domains = [
            "push.apple.com",
            "fcm.googleapis.com",
            "updates.push.services.mozilla.com",
            "notify.windows.com",
        ]
        host = p.hostname or ""
        if p.scheme != "https" or p.username or p.password or p.port not in (None, 443):
            raise ValueError("推送地址必须使用 HTTPS")
        if not any(host == domain or host.endswith("." + domain) for domain in domains):
            raise ValueError("不支持的推送服务地址")
        return value


class Keys(Input):
    p256dh: str = Field(min_length=80, max_length=256, pattern=r"^[A-Za-z0-9_=-]+$")
    auth: str = Field(min_length=16, max_length=128, pattern=r"^[A-Za-z0-9_=-]+$")


class Subscribe(Endpoint):
    keys: Keys
