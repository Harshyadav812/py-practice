import json
from uuid import UUID

from fastapi import APIRouter, HTTPException
from sqlmodel import select

from app.api.deps import CurrentUser, SessionDep
from app.models.credentials import Credential
from app.schemas.credentials import CredentialCreate, CredentialRead
from app.services.cipher import CipherService

router = APIRouter()
cipher = CipherService()


@router.post("/", response_model=CredentialRead)
def create_credential(
    cred_in: CredentialCreate, current_user: CurrentUser, session: SessionDep
):
    # Encrypt the data dict as a JSON string
    json_str = json.dumps(cred_in.data)
    encrypted_str = cipher.encrypt(json_str)

    credential = Credential(
        name=cred_in.name,
        type=cred_in.type,
        encrypted_data=encrypted_str,
        owner_id=current_user.id,
    )

    session.add(credential)
    session.commit()
    session.refresh(credential)
    return credential


@router.get("/", response_model=list[CredentialRead])
def read_credentials(current_user: CurrentUser, session: SessionDep):
    statement = select(Credential).where(Credential.owner_id == current_user.id)
    return session.exec(statement).all()


@router.delete("/{cred_id}")
def delete_credential(cred_id: UUID, current_user: CurrentUser, session: SessionDep):
    cred = session.get(Credential, cred_id)
    if not cred or cred.owner_id != current_user.id:
        raise HTTPException(status_code=404)

    session.delete(cred)
    session.commit()
    return {"ok": True}
