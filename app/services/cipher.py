import base64
import os

from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC


class CipherService:
    def __init__(self, master_key: str | None = None):
        # 1. Fix: Make master_key optional in signature so logic works
        self.master_key = master_key or os.environ.get("SENTIENT_FLOW_ENCRYPTION_KEY")
        if not self.master_key:
            raise ValueError(
                "SENTIENT_FLOW_ENCRYPTION_KEY environment variable is not set"
            )

    def _get_fernet(self, salt: bytes) -> Fernet:
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=salt,
            iterations=100_000,  # 2. Note: This is computationally expensive
        )
        key = base64.urlsafe_b64encode(kdf.derive(self.master_key.encode()))  # ty:ignore[possibly-missing-attribute]
        return Fernet(key)

    def encrypt(self, data: str) -> str:
        salt = os.urandom(16)
        f = self._get_fernet(salt)
        token = f.encrypt(data.encode())

        salt_b64 = base64.urlsafe_b64encode(salt).decode()
        token_str = token.decode()

        # Format: $enc$SALT$TOKEN
        return f"$enc${salt_b64}${token_str}"

    def decrypt(self, encrypted_str: str) -> str:
        if not encrypted_str.startswith("$enc$"):
            # You might want to handle legacy/plain text here if migrating
            raise ValueError("Invalid encryption format")

        try:
            # 3. Fix: Correctly handle the split with 4 parts ['', 'enc', 'salt', 'token']
            parts = encrypted_str.split("$")
            if len(parts) != 4:  # noqa: PLR2004
                raise ValueError("Corrupted encryption string")  # noqa: TRY301

            salt_b64 = parts[2]
            token_str = parts[3]

            salt = base64.urlsafe_b64decode(salt_b64)
            f = self._get_fernet(salt)

            return f.decrypt(token_str.encode()).decode()
        except (ValueError, IndexError, InvalidToken) as e:
            # Log the error in production!
            msg = f"Decryption failed: {e!s}"
            raise ValueError(msg) from e


if __name__ == "__main__":
    os.environ["SENTIENT_FLOW_ENCRYPTION_KEY"] = "my-super-secret-master-password"
    cipher = CipherService()
    secret = '{"api_key": "12345"}'  # noqa: S105

    encrypted = cipher.encrypt(secret)
    print(f"Encrypted: {encrypted}")

    decrypted = cipher.decrypt(encrypted)
    print(f"Decrypted: {decrypted}")
