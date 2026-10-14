from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from app.core.config import Settings
from app.core.database import make_database
from app.core.time import utcnow
from app.routers import auth, dorms, duties, guest, notifications


def create_app(settings=None):
    app = FastAPI(title="轮到 · 宿舍值日 API", version="1.0.0")
    app.state.settings = settings or Settings.from_env()
    app.state.engine, app.state.sessions = make_database(app.state.settings.database_url)
    app.state.clock = utcnow
    for router in (auth.router, dorms.router, duties.router, guest.router, notifications.router):
        app.include_router(router)

    @app.middleware("http")
    async def guest_cache_policy(request, call_next):
        response = await call_next(request)
        if request.url.path == "/guest" or request.url.path.startswith("/guest/"):
            response.headers["Cache-Control"] = "no-store"
        return response

    @app.exception_handler(RequestValidationError)
    async def validation(_, exc):
        return JSONResponse(
            status_code=422,
            content={
                "detail": {
                    "code": "validation_error",
                    "message": "请检查输入内容与日期范围",
                    "fields": [".".join(map(str, e["loc"])) for e in exc.errors()],
                }
            },
        )

    @app.get("/health")
    def health():
        from sqlalchemy import text

        with app.state.engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"status": "ok", "time": app.state.clock()}

    return app
