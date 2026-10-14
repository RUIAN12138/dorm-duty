import os
from dataclasses import dataclass
from pathlib import Path


@dataclass
class Settings:
    database_url: str
    jwt_secret: str
    vapid_private_key: str = ""
    vapid_public_key: str = ""
    vapid_subject: str = ""
    guest_default_invite_code: str = ""

    @classmethod
    def from_env(cls):
        secret = os.getenv("JWT_SECRET", "")
        if len(secret) < 32:
            raise RuntimeError("请设置至少 32 字符的 JWT_SECRET；本地可使用 ./scripts/dev.sh")
        db = os.getenv("DATABASE_URL", f"sqlite:///{Path(__file__).resolve().parents[3] / 'data/dorm.db'}")
        return cls(
            db,
            secret,
            os.getenv("VAPID_PRIVATE_KEY", ""),
            os.getenv("VAPID_PUBLIC_KEY", ""),
            os.getenv("VAPID_SUBJECT", ""),
            os.getenv("GUEST_DEFAULT_INVITE_CODE", ""),
        )
