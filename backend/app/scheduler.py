"""Single standalone worker. Do not import/start this in API workers."""

import logging
from datetime import datetime
from apscheduler.schedulers.blocking import BlockingScheduler
from sqlalchemy import text, select
from app.core.config import Settings
from app.core.database import make_database
from app.core.time import utcnow, as_utc
from app.services.reminders import scan, deliver, push_ready
from app.models.entities import Notification


def main():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    settings = Settings.from_env()
    engine, sessions = make_database(settings.database_url)

    def tick():
        now = utcnow()
        with sessions() as db:
            try:
                if engine.dialect.name == "sqlite":
                    db.execute(text("BEGIN IMMEDIATE"))
                scan(db, now, settings)
                db.commit()
            except Exception:
                db.rollback()
                logging.error("提醒扫描失败；请检查数据库迁移与 worker 状态")
                return
        if not push_ready(settings):
            return
        with sessions() as db:
            candidates = [
                (note.id, sid)
                for note in db.scalars(select(Notification).where(Notification.is_cancelled.is_(False)))
                for sid, state in note.delivery_state.items()
                if state["status"] not in ("accepted", "expired", "cancelled")
                and state["attempts"] < 4
                and (
                    not state.get("next_retry_at")
                    or as_utc(datetime.fromisoformat(state["next_retry_at"])) <= now
                )
            ]
        # One device per transaction: API completion and recipient changes cannot race the send check.
        # A send holds a SQLite write lock for at most the network timeout; never an entire batch.
        for note_id, sid in candidates[:8]:
            with sessions() as db:
                try:
                    if engine.dialect.name == "sqlite":
                        db.execute(text("BEGIN IMMEDIATE"))
                    deliver(db, utcnow(), settings, only_note=note_id, only_device=sid)
                    db.commit()
                except Exception:
                    db.rollback()
                    logging.error("设备投递失败，将按持久状态重试")

    tick()
    scheduler = BlockingScheduler(timezone="Asia/Shanghai")
    scheduler.add_job(tick, "interval", minutes=1, id="reminders", max_instances=1, coalesce=True)
    logging.info("提醒进程启动，扫描周期 1 分钟")
    scheduler.start()


if __name__ == "__main__":
    main()
