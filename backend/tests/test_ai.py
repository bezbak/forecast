import pytest

from forecast import ai, auth, billing, config
from tests.test_api import client  # noqa: F401 — фикстура с тестовыми данными


class FakeStream:
    def __init__(self, chunks):
        self.chunks = chunks

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    @property
    def text_stream(self):
        async def gen():
            for c in self.chunks:
                yield c
        return gen()

    async def get_final_message(self):
        class Block:
            type = "text"
            text = "".join(self.chunks)

        class Msg:
            content = [Block()]
            stop_reason = "end_turn"
        return Msg()


class FakeClient:
    """Повторяет форму client.beta.messages.stream(...) из SDK."""

    def __init__(self, chunks):
        self.calls = []
        chunks_ = chunks

        class Messages:
            def stream(_self, **kwargs):
                self.calls.append(kwargs)
                return FakeStream(chunks_)

        class Beta:
            messages = Messages()

        self.beta = Beta()


@pytest.fixture
def db_file(tmp_data, monkeypatch):
    monkeypatch.setattr(config, "DB_FILE", tmp_data / "app.db")


def login(client, email="a@b.kg", pro=False):
    r = client.post("/api/auth/register", json={"email": email, "password": "password1"})
    assert r.status_code == 200, r.text
    if pro:
        uid = r.json()["id"]
        p = billing.create_checkout(uid, "pro")
        billing.pay(p["id"], uid)
    return r


def test_context_has_forecasts_and_metrics(client):
    ctx = ai.build_context("AAA")
    assert ctx["ticker"] == "AAA"
    assert ctx["name"] == "Aaa Inc."
    assert {m["model"] for m in ctx["models"]} == {"naive", "boosting"}
    boosting = next(m for m in ctx["models"] if m["model"] == "boosting")
    assert boosting["forecast_7d_pct"] is not None
    assert "mape" in boosting


def test_template_summary_is_honest(client):
    text = ai.template_summary(ai.build_context("AAA"))
    assert "AAA" in text
    assert "Бустинг" in text
    assert "не является инвестиционной рекомендацией" in text


def test_template_summary_without_results(client):
    text = ai.template_summary(ai.build_context("BBB"))
    assert "ещё не рассчитан" in text


def test_summary_endpoint_free_user_gets_template(client, db_file, monkeypatch):
    monkeypatch.setattr(ai, "ai_enabled", lambda: True)
    body = client.get("/api/ai/summary/AAA").json()
    assert body["source"] == "template"
    assert "AAA" in body["text"]


def test_summary_endpoint_pro_gets_ai(client, db_file, monkeypatch):
    fake = FakeClient(["Коротко: ", "рост вероятен."])
    monkeypatch.setattr(ai, "ai_enabled", lambda: True)
    monkeypatch.setattr(ai, "get_client", lambda: fake)
    ai._summary_cache.clear()
    login(client, pro=True)
    body = client.get("/api/ai/summary/AAA").json()
    assert body == {"ticker": "AAA", "source": "ai", "text": "Коротко: рост вероятен."}
    call = fake.calls[0]
    assert call["model"] == "claude-opus-5-5"
    assert "AAA" in call["system"]


def test_chat_requires_login(client, db_file):
    r = client.post("/api/ai/chat", json={"ticker": "AAA", "messages": [{"role": "user", "content": "привет"}]})
    assert r.status_code == 401


def test_chat_requires_pro(client, db_file):
    login(client)
    r = client.post("/api/ai/chat", json={"ticker": "AAA", "messages": [{"role": "user", "content": "привет"}]})
    assert r.status_code == 403
    assert r.json()["detail"] == "Доступно в тарифе Про"


def test_chat_without_key_503(client, db_file, monkeypatch):
    monkeypatch.setattr(ai, "ai_enabled", lambda: False)
    login(client, pro=True)
    r = client.post("/api/ai/chat", json={"ticker": "AAA", "messages": [{"role": "user", "content": "привет"}]})
    assert r.status_code == 503


def test_chat_streams_answer(client, db_file, monkeypatch):
    fake = FakeClient(["Модель ", "ждёт ", "рост."])
    monkeypatch.setattr(ai, "ai_enabled", lambda: True)
    monkeypatch.setattr(ai, "get_client", lambda: fake)
    login(client, pro=True)
    msgs = [{"role": "user", "content": "Что с AAA?"}, {"role": "assistant", "content": "Смотрю."},
            {"role": "user", "content": "А точность?"}]
    r = client.post("/api/ai/chat", json={"ticker": "AAA", "messages": msgs})
    assert r.status_code == 200
    assert r.text == "Модель ждёт рост."
    assert fake.calls[0]["messages"] == msgs


@pytest.mark.parametrize("msgs", [
    [],
    [{"role": "assistant", "content": "x"}],
    [{"role": "user", "content": "x" * 3001}],
    [{"role": "system", "content": "x"}],
])
def test_chat_rejects_bad_history(client, db_file, monkeypatch, msgs):
    monkeypatch.setattr(ai, "ai_enabled", lambda: True)
    login(client, pro=True)
    r = client.post("/api/ai/chat", json={"ticker": "AAA", "messages": msgs})
    assert r.status_code == 422


def test_auth_endpoints(client, db_file):
    assert client.get("/api/auth/me").json() is None
    login(client)
    assert client.get("/api/auth/me").json()["email"] == "a@b.kg"
    client.post("/api/auth/logout")
    assert client.get("/api/auth/me").json() is None
    r = client.post("/api/auth/login", json={"email": "a@b.kg", "password": "bad-pass1"})
    assert r.status_code == 400
    assert r.json()["detail"] == "Неверная почта или пароль"


def test_billing_endpoints(client, db_file):
    login(client)
    plans = client.get("/api/billing/plans").json()
    assert plans[0]["id"] == "pro"
    pay = client.post("/api/billing/checkout", json={"plan": "pro"}).json()
    assert pay["status"] == "pending"
    assert client.post(f"/api/billing/{pay['id']}/pay").json()["user"]["plan"] == "pro"
    assert client.get("/api/auth/me").json()["plan"] == "pro"


def test_retrain_requires_pro(client, db_file):
    assert client.post("/api/retrain/AAA").status_code == 401
    login(client)
    assert client.post("/api/retrain/AAA").status_code == 403
