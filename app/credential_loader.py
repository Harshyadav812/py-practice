"""Standalone credential loading — extracted from WorkflowEngine."""

from __future__ import annotations

import json
from typing import Any
from uuid import UUID

from sqlmodel import Session

from app.models.credentials import Credential
from app.services.cipher import CipherService


class CredentialLoader:
    """Fetches, verifies ownership, and decrypts credentials from the database."""

    def __init__(self, session: Session, user_id: UUID) -> None:
        self.session = session
        self.user_id = user_id
        self.cipher = CipherService()

    def load(self, credential_id: str) -> dict[str, Any]:
        """Fetch credential from DB, verify ownership, decrypt, return dict."""
        cred = self.session.get(Credential, UUID(credential_id))
        if not cred or cred.owner_id != self.user_id:
            raise ValueError(f"Credential '{credential_id}' not found or access denied")
        decrypted_json = self.cipher.decrypt(cred.encrypted_data)
        return json.loads(decrypted_json)
