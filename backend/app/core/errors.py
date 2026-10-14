from fastapi import HTTPException


def fail(status, code, message):
    raise HTTPException(status_code=status, detail={"code": code, "message": message})
