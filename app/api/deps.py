from typing import Annotated
from uuid import UUID

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from sqlmodel import Session

from app.core.config import settings
from app.db import engine
from app.models.users import User

reusable_oauth2 = OAuth2PasswordBearer(tokenUrl="/auth/login")


def get_session():
    with Session(engine) as session:
        yield session


SessionDep = Annotated[Session, Depends(get_session)]
TokenDep = Annotated[str, Depends(reusable_oauth2)]


def get_current_user(session: SessionDep, token: TokenDep) -> User:
    try:
        # Decode token
        payload = jwt.decode(
            token,
            settings.secret_key.get_secret_value(),
            algorithms=[settings.algorithm],
        )
        token_data = payload.get("sub")

        if token_data is None:
            raise HTTPException(
                status_code=403, detail="Could not validate credentials"
            )

    except jwt.InvalidTokenError as invalidToken:
        raise HTTPException(
            status_code=403, detail="Could not validate credentials"
        ) from invalidToken

    # Get user from DB
    user = session.get(User, UUID(token_data))

    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")

    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
