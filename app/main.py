from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import auth, credentials, executions, workflows
from app.core.config import settings


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Tables are managed by Alembic migrations now.
    # Run: alembic upgrade head
    yield


app = FastAPI(lifespan=lifespan)


origins = settings.cors_origins
if isinstance(origins, str):
    origins = [origin.strip() for origin in origins.split(",")]

app.add_middleware(
    CORSMiddleware,  # ty:ignore[invalid-argument-type]
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(workflows.router, prefix="/workflows", tags=["workflows"])
app.include_router(credentials.router, prefix="/credentials", tags=["credentials"])
app.include_router(executions.router, prefix="/executions", tags=["executions"])


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8000)
