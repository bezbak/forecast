import pytest

from forecast import auth, db


@pytest.fixture
def store(tmp_data, monkeypatch):
    from forecast import config
    monkeypatch.setattr(config, "DB_FILE", tmp_data / "app.db")
    db.init()
    return tmp_data


def test_password_hash_roundtrip():
    stored = auth.hash_password("секрет-123")
    assert "секрет" not in stored
    assert auth.verify_password("секрет-123", stored)
    assert not auth.verify_password("другой", stored)


def test_same_password_different_hash():
    assert auth.hash_password("abcdefgh") != auth.hash_password("abcdefgh")


def test_register_and_login(store):
    user = auth.register("Trader@Mail.kg ", "password1")
    assert user["email"] == "trader@mail.kg"
    assert user["plan"] == "free"
    token = auth.login("trader@mail.kg", "password1")
    assert auth.user_by_token(token)["email"] == "trader@mail.kg"


def test_register_duplicate(store):
    auth.register("a@b.kg", "password1")
    with pytest.raises(auth.AuthError, match="уже зарегистрирован"):
        auth.register("A@B.kg", "password2")


@pytest.mark.parametrize("email,pw,msg", [
    ("not-an-email", "password1", "корректную почту"),
    ("a@b.kg", "short", "8 символов"),
])
def test_register_validation(store, email, pw, msg):
    with pytest.raises(auth.AuthError, match=msg):
        auth.register(email, pw)


def test_login_wrong_password(store):
    auth.register("a@b.kg", "password1")
    with pytest.raises(auth.AuthError, match="Неверная почта или пароль"):
        auth.login("a@b.kg", "wrong-pass")
    with pytest.raises(auth.AuthError, match="Неверная почта или пароль"):
        auth.login("nobody@b.kg", "password1")


def test_logout_invalidates_token(store):
    auth.register("a@b.kg", "password1")
    token = auth.login("a@b.kg", "password1")
    auth.logout(token)
    assert auth.user_by_token(token) is None


def test_unknown_token(store):
    assert auth.user_by_token("nope") is None
    assert auth.user_by_token(None) is None
