"""Регистрация, вход и сессии. Пароли — scrypt из стандартной библиотеки."""
import hashlib
import hmac
import re
import secrets
from datetime import datetime, timedelta, timezone

from forecast import config, db

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
SCRYPT = {"n": 2**14, "r": 8, "p": 1}


class AuthError(Exception):
    """Ошибка с понятным пользователю сообщением."""


def _now() -> datetime:
    return datetime.now(timezone.utc)


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, **SCRYPT)
    return f"scrypt${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _, salt, digest = stored.split("$")
    except ValueError:
        return False
    check = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), **SCRYPT)
    return hmac.compare_digest(check.hex(), digest)


def public_user(row) -> dict:
    """Пользователь без секретов; тариф «Про» действует только до pro_until."""
    pro = row["plan"] == "pro" and row["pro_until"] and row["pro_until"] > _now().isoformat()
    return {"id": row["id"], "email": row["email"], "plan": "pro" if pro else "free",
            "pro_until": row["pro_until"] if pro else None}


def register(email: str, password: str) -> dict:
    email = email.strip().lower()
    if not EMAIL_RE.match(email):
        raise AuthError("Введите корректную почту")
    if len(password) < 8:
        raise AuthError("Пароль должен быть не короче 8 символов")
    with db.connect() as conn:
        if conn.execute("SELECT 1 FROM users WHERE email = ?", (email,)).fetchone():
            raise AuthError("Эта почта уже зарегистрирована")
        cur = conn.execute("INSERT INTO users (email, password) VALUES (?, ?)", (email, hash_password(password)))
        row = conn.execute("SELECT * FROM users WHERE id = ?", (cur.lastrowid,)).fetchone()
    return public_user(row)


def login(email: str, password: str) -> str:
    """Возвращает токен сессии."""
    with db.connect() as conn:
        row = conn.execute("SELECT * FROM users WHERE email = ?", (email.strip().lower(),)).fetchone()
        if row is None or not verify_password(password, row["password"]):
            raise AuthError("Неверная почта или пароль")
        token = secrets.token_urlsafe(32)
        expires = (_now() + timedelta(days=config.SESSION_DAYS)).isoformat()
        conn.execute("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)", (token, row["id"], expires))
    return token


def logout(token: str | None) -> None:
    if not token:
        return
    with db.connect() as conn:
        conn.execute("DELETE FROM sessions WHERE token = ?", (token,))


def user_by_token(token: str | None) -> dict | None:
    if not token:
        return None
    with db.connect() as conn:
        row = conn.execute(
            "SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > ?",
            (token, _now().isoformat()),
        ).fetchone()
    return public_user(row) if row else None
