import pytest

from forecast import auth, billing, db


@pytest.fixture
def user(tmp_data, monkeypatch):
    from forecast import config
    monkeypatch.setattr(config, "DB_FILE", tmp_data / "app.db")
    db.init()
    return auth.register("a@b.kg", "password1")


def test_plan_catalog():
    pro = billing.PLANS["pro"]
    assert pro["amount"] == 490
    assert pro["currency"] == "KGS"
    assert pro["days"] == 30


def test_checkout_then_pay_upgrades_user(user):
    payment = billing.create_checkout(user["id"], "pro")
    assert payment["status"] == "pending"
    assert payment["amount"] == 490
    assert auth.user_by_token(auth.login("a@b.kg", "password1"))["plan"] == "free"
    paid = billing.pay(payment["id"], user["id"])
    assert paid["status"] == "paid"
    me = auth.user_by_token(auth.login("a@b.kg", "password1"))
    assert me["plan"] == "pro"
    assert me["pro_until"] is not None


def test_cancel_keeps_free(user):
    payment = billing.create_checkout(user["id"], "pro")
    assert billing.cancel(payment["id"], user["id"])["status"] == "cancelled"
    with pytest.raises(billing.BillingError, match="уже"):
        billing.pay(payment["id"], user["id"])
    assert auth.user_by_token(auth.login("a@b.kg", "password1"))["plan"] == "free"


def test_cannot_pay_twice(user):
    payment = billing.create_checkout(user["id"], "pro")
    billing.pay(payment["id"], user["id"])
    with pytest.raises(billing.BillingError, match="уже"):
        billing.pay(payment["id"], user["id"])


def test_foreign_payment_rejected(user):
    other = auth.register("c@d.kg", "password1")
    payment = billing.create_checkout(user["id"], "pro")
    with pytest.raises(billing.BillingError, match="не найден"):
        billing.pay(payment["id"], other["id"])


def test_unknown_plan(user):
    with pytest.raises(billing.BillingError, match="тариф"):
        billing.create_checkout(user["id"], "gold")


def test_history(user):
    p = billing.create_checkout(user["id"], "pro")
    billing.pay(p["id"], user["id"])
    hist = billing.history(user["id"])
    assert [h["status"] for h in hist] == ["paid"]
