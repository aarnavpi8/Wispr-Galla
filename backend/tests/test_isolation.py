"""Each Google account and each browser sees only its own shop."""

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import identity
from app.config import settings
from app.db import Base, get_db
from app.main import app

A = {"X-Galla-Device": "device-aaaaaaaaaaaaaaaa"}
B = {"X-Galla-Device": "device-bbbbbbbbbbbbbbbb"}


@pytest.fixture()
def client():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, expire_on_commit=False)

    def db():
        with Session() as s:
            yield s

    app.dependency_overrides[get_db] = db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def setup_shop(client, headers, name):
    body = {"name": name, "kind": "kirana", "vpa": "", "language": "hi", "opening_cash": 0}
    res = client.post("/api/setup", json=body, headers=headers)
    assert res.status_code == 201, res.text


def test_two_browsers_never_see_each_others_shop(client):
    setup_shop(client, A, "Asha Stores")
    assert client.get("/api/setup", headers=B).json() == {"has_shop": False}
    setup_shop(client, B, "Bharat Kirana")
    assert client.get("/api/shop", headers=A).json()["name"] == "Asha Stores"
    assert client.get("/api/shop", headers=B).json()["name"] == "Bharat Kirana"

    e = {"type": "udhaar", "amount": 300, "party_name": "Ramesh", "raw_text": "Ramesh ko 300 udhaar"}
    assert client.post("/api/entries", json=e, headers=A).status_code == 201
    assert len(client.get("/api/entries", headers=A).json()) == 1
    assert client.get("/api/entries", headers=B).json() == []
    assert client.get("/api/khata", headers=B).json() == []


def test_ids_from_another_shop_are_not_found(client):
    setup_shop(client, A, "Asha Stores")
    setup_shop(client, B, "Bharat Kirana")
    item = client.post("/api/items", json={"name": "Soap", "unit": "pc", "price": 30, "stock": 5}, headers=A).json()
    assert client.post(f"/api/items/{item['id']}/stock", json={"reason": "wastage", "qty": 1}, headers=B).status_code == 404
    assert client.get(f"/api/items/{item['id']}/moves", headers=B).status_code == 404
    saved = client.post("/api/entries", json={"type": "expense", "amount": 50, "raw_text": "chai"}, headers=A).json()
    assert client.post(f"/api/entries/{saved['id']}/undo", headers=B).status_code == 404


def test_each_browser_gets_its_own_demo_copy(client):
    assert client.post("/api/setup/demo", headers=A).status_code == 201
    assert client.post("/api/setup/demo", headers=B).status_code == 201
    assert client.post("/api/setup/demo", headers=A).status_code == 409
    client.post("/api/entries", json={"type": "expense", "amount": 77, "raw_text": "x"}, headers=A)
    a = [e["amount"] for e in client.get("/api/entries", headers=A).json()]
    b = [e["amount"] for e in client.get("/api/entries", headers=B).json()]
    assert 77 in a and 77 not in b


def test_a_new_browser_with_no_shop_gets_404_not_someone_elses(client):
    setup_shop(client, A, "Asha Stores")
    assert client.get("/api/shop", headers=B).status_code == 404
    assert client.get("/api/shop").status_code == 404  # no identity: only the old shared shop


def test_bad_device_id_is_rejected(client):
    assert client.get("/api/setup", headers={"X-Galla-Device": "../../etc"}).status_code == 400


@pytest.fixture()
def firebase_on(monkeypatch):
    monkeypatch.setattr(settings, "firebase_api_key", "test-key")
    monkeypatch.setattr(settings, "firebase_auth_domain", "x.firebaseapp.com")
    monkeypatch.setattr(settings, "firebase_project_id", "x")
    identity._cache.clear()

    def fake_lookup(token, client=None):
        def handler(req: httpx.Request) -> httpx.Response:
            assert req.url.params["key"] == "test-key"
            tok = req.read().decode()
            if "good-ansh" in tok:
                return httpx.Response(200, json={"users": [{"localId": "uid-ansh"}]})
            if "good-priya" in tok:
                return httpx.Response(200, json={"users": [{"localId": "uid-priya"}]})
            return httpx.Response(400, json={"error": {"message": "INVALID_ID_TOKEN"}})

        return real(token, httpx.Client(transport=httpx.MockTransport(handler)))

    real = identity.verify_firebase_token
    monkeypatch.setattr(identity, "verify_firebase_token", fake_lookup)


def test_google_accounts_each_get_their_own_shop(client, firebase_on):
    ansh = {"Authorization": "Bearer good-ansh", **A}
    priya = {"Authorization": "Bearer good-priya", **A}  # same browser, different account
    setup_shop(client, ansh, "Ansh General Store")
    assert client.get("/api/setup", headers=priya).json() == {"has_shop": False}
    setup_shop(client, priya, "Priya Medical")
    assert client.get("/api/shop", headers=ansh).json()["name"] == "Ansh General Store"
    assert client.get("/api/shop", headers=priya).json()["name"] == "Priya Medical"
    # The signed-in shop is not the browser's guest shop.
    assert client.get("/api/setup", headers=A).json() == {"has_shop": False}


def test_bad_or_expired_token_is_401_not_a_guest(client, firebase_on):
    res = client.get("/api/setup", headers={"Authorization": "Bearer forged", **A})
    assert res.status_code == 401
