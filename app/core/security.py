from pwdlib import PasswordHash

# Initialize PasswordHash with Argon2 as the default
# This automatically handles salting and algorithm selection
password_hash = PasswordHash.recommended()


def hash_password(password: str) -> str:
    """Hash a password using Argon2id."""
    return password_hash.hash(password)


def verify_password(plain_password: str, hashed_password) -> bool:
    """Verify a password against a hash."""
    return password_hash.verify(plain_password, hashed_password)
