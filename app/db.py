import os

from dotenv import load_dotenv
from sqlmodel import SQLModel, create_engine  # noqa: F401

from app.models import credentials, users  # noqa: F401

load_dotenv()

DATABASE_URL = os.environ.get("DATABASE_URL")

if not DATABASE_URL:
    raise ValueError("DATABASE_URL not found in .env file")

# echo=True will make the engine print all the SQL statements it executes.
# remove it in prod
engine = create_engine(DATABASE_URL, echo=True)
