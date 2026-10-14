from pathlib import Path
from sqlalchemy import create_engine, event, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker
from sqlalchemy.exc import IntegrityError, OperationalError
from fastapi import Request
from app.core.errors import fail


def make_database(url):
    parsed = make_url(url)
    if parsed.drivername.startswith("sqlite") and parsed.database and parsed.database != ":memory:":
        Path(parsed.database).parent.mkdir(parents=True, exist_ok=True)
    sqlite = parsed.drivername.startswith("sqlite")
    engine = create_engine(
        url, connect_args={"check_same_thread": False, "timeout": 30} if sqlite else {}, pool_pre_ping=True
    )
    if sqlite:

        @event.listens_for(engine, "connect")
        def setup(conn, _):
            conn.execute("PRAGMA foreign_keys=ON")
            conn.execute("PRAGMA busy_timeout=30000")

    return engine, sessionmaker(engine, expire_on_commit=False)


def get_db(request: Request):
    with request.app.state.sessions() as session:
        session.info["write"] = request.method not in ("GET", "HEAD", "OPTIONS")
        try:
            if session.info["write"] and session.bind.dialect.name == "sqlite":
                session.execute(text("BEGIN IMMEDIATE"))
            yield session
            session.commit()
        except IntegrityError:
            session.rollback()
            fail(409, "conflict", "数据已变化或记录重复，请刷新后重试")
        except OperationalError:
            session.rollback()
            fail(409, "busy", "数据库暂忙，请稍后重试")
        except Exception:
            session.rollback()
            raise
