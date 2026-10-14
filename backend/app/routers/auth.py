from datetime import timedelta
from fastapi import APIRouter, Depends, Request
from pwdlib import PasswordHash
from sqlalchemy import select
import jwt
from app.core.auth import current_user
from app.core.time import utcnow
from app.core.database import get_db
from app.core.errors import fail
from app.models.entities import User
from app.schemas.inputs import Login, Register, Profile

router = APIRouter(prefix="/auth", tags=["身份"])
hasher = PasswordHash.recommended()
DUMMY_HASH = hasher.hash("invalid-password-dummy")


def view(user):
    return {
        "id": user.id,
        "username": user.username,
        "nickname": user.nickname,
        "current_dorm_id": user.current_dorm_id,
        "push_enabled": user.push_enabled,
    }


@router.post("/register", status_code=201)
def register(body: Register, db=Depends(get_db)):
    if db.scalar(select(User).where(User.username == body.username)):
        fail(409, "username_taken", "账号已被注册")
    user = User(username=body.username, password_hash=hasher.hash(body.password), nickname=body.nickname)
    db.add(user)
    db.flush()
    return view(user)


@router.post("/login")
def login(body: Login, request: Request, db=Depends(get_db)):
    user = db.scalar(select(User).where(User.username == body.username))
    valid = hasher.verify(body.password, user.password_hash if user else DUMMY_HASH)
    if not user or not valid:
        fail(401, "invalid_credentials", "账号或密码不正确")
    now = utcnow()
    token = jwt.encode(
        {"sub": str(user.id), "exp": now + timedelta(hours=24)},
        request.app.state.settings.jwt_secret,
        algorithm="HS256",
    )
    return {"access_token": token, "token_type": "bearer", "expires_in": 86400}


@router.get("/me")
def me(user=Depends(current_user)):
    return view(user)


@router.patch("/me")
def profile(body: Profile, user=Depends(current_user), db=Depends(get_db)):
    for key, value in body.model_dump(exclude_none=True).items():
        setattr(user, key, value)
    return view(user)
