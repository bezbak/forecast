"""Аккаунты, демо-оплата и ИИ-аналитик."""
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, field_validator

from forecast import ai, auth, billing
from forecast.universe import load_universe

COOKIE = "session"
router = APIRouter(prefix="/api")


class Credentials(BaseModel):
    email: str = Field(max_length=200)
    password: str = Field(max_length=200)


class Checkout(BaseModel):
    plan: str


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=3000)


class ChatRequest(BaseModel):
    ticker: str
    messages: list[ChatMessage] = Field(min_length=1, max_length=30)

    @field_validator("messages")
    @classmethod
    def alternating(cls, msgs: list[ChatMessage]) -> list[ChatMessage]:
        for i, m in enumerate(msgs):
            if m.role != ("user" if i % 2 == 0 else "assistant"):
                raise ValueError("Сообщения должны чередоваться и начинаться с вопроса пользователя")
        if msgs[-1].role != "user":
            raise ValueError("Последним должно быть сообщение пользователя")
        return msgs


def current_user(request: Request) -> dict | None:
    return auth.user_by_token(request.cookies.get(COOKIE))


def require_user(user: dict | None = Depends(current_user)) -> dict:
    if user is None:
        raise HTTPException(401, "Войдите в аккаунт")
    return user


def require_pro(user: dict = Depends(require_user)) -> dict:
    if user["plan"] != "pro":
        raise HTTPException(403, "Доступно в тарифе Про")
    return user


def _known_ticker(ticker: str) -> None:
    if not any(c.ticker == ticker for c in load_universe()):
        raise HTTPException(404, "Тикер не найден")


def _start_session(response: Response, request: Request, email: str, password: str) -> dict:
    token = auth.login(email, password)
    secure = request.headers.get("x-forwarded-proto", request.url.scheme) == "https"
    response.set_cookie(COOKIE, token, httponly=True, samesite="lax", secure=secure, max_age=30 * 86400)
    return auth.user_by_token(token)


# ── Аккаунт

@router.post("/auth/register")
def register(body: Credentials, request: Request, response: Response):
    try:
        auth.register(body.email, body.password)
        return _start_session(response, request, body.email, body.password)
    except auth.AuthError as e:
        raise HTTPException(400, str(e)) from None


@router.post("/auth/login")
def login(body: Credentials, request: Request, response: Response):
    try:
        return _start_session(response, request, body.email, body.password)
    except auth.AuthError as e:
        raise HTTPException(400, str(e)) from None


@router.post("/auth/logout")
def logout(request: Request, response: Response):
    auth.logout(request.cookies.get(COOKIE))
    response.delete_cookie(COOKIE)
    return {"ok": True}


@router.get("/auth/me")
def me(user: dict | None = Depends(current_user)):
    return user


# ── Демо-оплата

@router.get("/billing/plans")
def plans():
    return [{"id": pid, **p} for pid, p in billing.PLANS.items()]


@router.post("/billing/checkout")
def checkout(body: Checkout, user: dict = Depends(require_user)):
    try:
        return billing.create_checkout(user["id"], body.plan)
    except billing.BillingError as e:
        raise HTTPException(400, str(e)) from None


@router.post("/billing/{payment_id}/pay")
def pay(payment_id: str, request: Request, user: dict = Depends(require_user)):
    try:
        payment = billing.pay(payment_id, user["id"])
    except billing.BillingError as e:
        raise HTTPException(400, str(e)) from None
    return {"payment": payment, "user": current_user(request)}


@router.post("/billing/{payment_id}/cancel")
def cancel(payment_id: str, user: dict = Depends(require_user)):
    try:
        return billing.cancel(payment_id, user["id"])
    except billing.BillingError as e:
        raise HTTPException(400, str(e)) from None


@router.get("/billing/history")
def history(user: dict = Depends(require_user)):
    return billing.history(user["id"])


# ── ИИ-аналитик

@router.get("/ai/status")
def ai_status(user: dict | None = Depends(current_user)):
    return {"enabled": ai.ai_enabled(), "pro": bool(user and user["plan"] == "pro")}


@router.get("/ai/summary/{ticker}")
async def summary(ticker: str, user: dict | None = Depends(current_user)):
    _known_ticker(ticker)
    ctx = ai.build_context(ticker)
    if user and user["plan"] == "pro" and ai.ai_enabled() and ctx["status"] == "ok":
        try:
            return {"ticker": ticker, "source": "ai", "text": await ai.summarize(ctx)}
        except Exception:  # noqa: BLE001 — при сбое ИИ показываем сводку по шаблону
            pass
    return {"ticker": ticker, "source": "template", "text": ai.template_summary(ctx)}


@router.post("/ai/chat")
async def chat(body: ChatRequest, user: dict = Depends(require_pro)):
    _known_ticker(body.ticker)
    if not ai.ai_enabled():
        raise HTTPException(503, "ИИ не настроен на сервере: не задан ключ ANTHROPIC_API_KEY")
    ctx = ai.build_context(body.ticker)
    messages = [m.model_dump() for m in body.messages]

    async def stream():
        try:
            async for chunk in ai.chat(ctx, messages):
                yield chunk
        except Exception:  # noqa: BLE001 — обрыв посреди ответа показываем текстом
            yield "\n\n[Ответ прерван: ИИ временно недоступен]"

    return StreamingResponse(stream(), media_type="text/plain; charset=utf-8")
