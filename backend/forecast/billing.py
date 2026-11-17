"""Демо-оплата тарифа «Про». Реальные деньги не списываются: платёж подтверждается
кнопкой на демо-странице, без платёжного провайдера и без данных карты."""
import secrets
from datetime import datetime, timedelta, timezone

from forecast import db

PLANS = {
    "pro": {
        "name": "Про",
        "amount": 490,
        "currency": "KGS",
        "days": 30,
        "features": ["ИИ-аналитик: сводки и чат по бумагам", "Переобучение моделей с сайта"],
    },
}


class BillingError(Exception):
    """Ошибка с понятным пользователю сообщением."""


def _payment(conn, payment_id: str, user_id: int):
    row = conn.execute("SELECT * FROM payments WHERE id = ? AND user_id = ?", (payment_id, user_id)).fetchone()
    if row is None:
        raise BillingError("Платёж не найден")
    return row


def create_checkout(user_id: int, plan: str) -> dict:
    if plan not in PLANS:
        raise BillingError("Неизвестный тариф")
    p = PLANS[plan]
    payment_id = "demo_" + secrets.token_hex(6)
    with db.connect() as conn:
        conn.execute("INSERT INTO payments (id, user_id, plan, amount, currency) VALUES (?, ?, ?, ?, ?)",
                     (payment_id, user_id, plan, p["amount"], p["currency"]))
        return dict(_payment(conn, payment_id, user_id))


def pay(payment_id: str, user_id: int) -> dict:
    """Имитация успешной оплаты: платёж проводится, тариф продлевается."""
    with db.connect() as conn:
        row = _payment(conn, payment_id, user_id)
        if row["status"] != "pending":
            raise BillingError("Платёж уже обработан")
        now = datetime.now(timezone.utc)
        user = conn.execute("SELECT pro_until FROM users WHERE id = ?", (user_id,)).fetchone()
        start = max(now, datetime.fromisoformat(user["pro_until"])) if user["pro_until"] else now
        until = start + timedelta(days=PLANS[row["plan"]]["days"])
        conn.execute("UPDATE payments SET status = 'paid', paid_at = ? WHERE id = ?", (now.isoformat(), payment_id))
        conn.execute("UPDATE users SET plan = ?, pro_until = ? WHERE id = ?", (row["plan"], until.isoformat(), user_id))
        return dict(_payment(conn, payment_id, user_id))


def cancel(payment_id: str, user_id: int) -> dict:
    with db.connect() as conn:
        row = _payment(conn, payment_id, user_id)
        if row["status"] != "pending":
            raise BillingError("Платёж уже обработан")
        conn.execute("UPDATE payments SET status = 'cancelled' WHERE id = ?", (payment_id,))
        return dict(_payment(conn, payment_id, user_id))


def history(user_id: int) -> list[dict]:
    with db.connect() as conn:
        rows = conn.execute("SELECT * FROM payments WHERE user_id = ? AND status != 'pending' ORDER BY created_at DESC",
                            (user_id,)).fetchall()
    return [dict(r) for r in rows]
