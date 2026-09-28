import hashlib
import secrets

PUBLIC_KEY_PREFIX = "nb_pk_"
SECRET_KEY_PREFIX = "nb_sk_"


def sha256(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def new_session_token() -> str:
    return secrets.token_urlsafe(32)


def new_public_key() -> str:
    return PUBLIC_KEY_PREFIX + secrets.token_urlsafe(24)


def new_secret_key() -> tuple[str, str, str]:
    """Returns (raw key, sha256 hash, display mask)."""
    raw = SECRET_KEY_PREFIX + secrets.token_urlsafe(32)
    return raw, sha256(raw), f"{raw[:10]}…{raw[-4:]}"
