import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def test_starts_without_keys_and_seeds_demo_shop(client):
    assert client.get("/api/health").json() == {"ok": True, "llm_configured": False}

    shop = client.get("/api/shop").json()
    assert shop["name"] == "Shree Ganesh Kirana"
    assert shop["items"] == 25
    assert shop["customers"] == 8
    assert shop["suppliers"] == 2
    assert shop["entries"] > 0


def test_config_without_keys_turns_login_off(client):
    assert client.get("/api/config").json() == {"llm_configured": False, "firebase": None}


def test_config_with_firebase_keys(client, monkeypatch):
    monkeypatch.setattr(settings, "firebase_api_key", "test-api-key")
    monkeypatch.setattr(settings, "firebase_auth_domain", "galla-test.firebaseapp.com")
    monkeypatch.setattr(settings, "firebase_project_id", "galla-test")
    monkeypatch.setattr(settings, "firebase_app_id", "1:123:web:abc")
    fb = client.get("/api/config").json()["firebase"]
    assert fb["projectId"] == "galla-test"
    assert fb["authDomain"] == "galla-test.firebaseapp.com"


def test_entries_are_newest_first_with_party_names(client):
    rows = client.get("/api/entries?limit=5").json()
    assert len(rows) == 5
    times = [r["created_at"] for r in rows]
    assert times == sorted(times, reverse=True)
    assert rows[0]["raw_text"] == "Ramesh ne 200 cash diye"
    assert rows[0]["party_name"] == "Ramesh"


def test_entries_filter_by_party(client):
    ramesh = next(p for p in client.get("/api/khata").json() if p["name"] == "Ramesh")
    rows = client.get(f"/api/entries?party_id={ramesh['id']}").json()
    assert {r["type"] for r in rows} == {"udhaar", "payment"}
    assert all(r["party_name"] == "Ramesh" for r in rows)


def test_khata_balances_and_overdue(client):
    by_name = {p["name"]: p for p in client.get("/api/khata").json()}
    # Ramesh: 350 udhaar (due 2 days ago) - 200 paid = 150, overdue.
    assert by_name["Ramesh"]["balance"] == 150
    assert by_name["Ramesh"]["overdue_since"] is not None
    # Sharma ji: 820 udhaar, due in future.
    assert by_name["Sharma ji"]["balance"] == 820
    assert by_name["Sharma ji"]["overdue_since"] is None
    # Mehta ji paid 500 with no udhaar on record: shop owes nothing, balance is negative (advance).
    assert by_name["Mehta ji"]["balance"] == -500
    # Supplier: 3200 purchase, 1000 paid -> we owe 2200.
    assert by_name["Gupta Distributors"]["balance"] == 2200
    # Overdue parties are listed first.
    first = client.get("/api/khata").json()[0]
    assert first["overdue_since"] is not None


def test_summary_covers_seed_history(client):
    s = client.get("/api/summary?days=7").json()
    assert len(s["days"]) == 7
    assert sum(d["sales"] for d in s["days"]) == 640 + 1200 + 930 + 1100 + 760
    assert s["udhaar_outstanding"] == 150 + 820 + 240
    assert s["overdue_count"] == 1
    assert s["opening_cash"] == 2000
    # Seed has nothing for today, so expected cash is just the opening cash.
    assert s["today"]["entries"] == 0
    assert s["expected_cash_today"] == 2000


def test_summary_rejects_bad_window(client):
    assert client.get("/api/summary?days=0").status_code == 422
