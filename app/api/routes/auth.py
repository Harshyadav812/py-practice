from datetime import timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from sqlmodel import select

from app.api.deps import CurrentUser, SessionDep
from app.core import auth, security
from app.models.users import User
from app.schemas.users import UserCreate, UserRead

router = APIRouter()


@router.post("/register", response_model=UserRead)
def register(user_in: UserCreate, session: SessionDep):
    # Check if email exists
    statement = select(User).where(User.email == user_in.email)
    if session.exec(statement).first():
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User.model_validate(
        user_in, update={"hashed_password": security.hash_password(user_in.password)}
    )

    session.add(user)
    session.commit()
    session.refresh(user)
    return user


@router.post("/login")
def login(
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()], session: SessionDep
):
    # Authenticate
    statement = select(User).where(User.email == form_data.username)
    user = session.exec(statement).first()

    if not user or not security.verify_password(
        form_data.password, user.hashed_password
    ):
        raise HTTPException(status_code=400, detail="Incorrect email or password")

    if not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")

    # Create Token
    access_token_expires = timedelta(minutes=30)
    access_token = auth.create_access_token(
        subject=user.id, expires_delta=access_token_expires
    )

    return {"access_token": access_token, "token_type": "bearer"}


@router.post("/me", response_model=UserRead)
def read_users_me(current_user: CurrentUser):
    """Test endpoint. If you can see this, you are authenticated!"""  # noqa: D400
    return current_user
