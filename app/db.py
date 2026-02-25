from sqlmodel import SQLModel, create_engine  # noqa: F401

from app.core.config import settings
from app.models import credentials, users, workflow  # noqa: F401

# echo=True prints all SQL statements — disable in production
engine = create_engine(settings.database_url)
