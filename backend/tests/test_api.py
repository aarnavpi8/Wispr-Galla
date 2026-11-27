import os
import tempfile

# A fresh database file and no keys, like a judge's fresh clone. Set before importing the app.
os.environ["DATABASE_URL"] = f"sqlite:///{tempfile.mkdtemp()}/test.db"
os.environ["LLM_API_KEY"] = ""

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


def test_starts_without_keys_and_seeds_demo_shop():
    with TestClient(app) as client:
        assert client.get("/api/health").json() == {"ok": True, "llm_configured": False}

        shop = client.get("/api/shop").json()
        assert shop["name"] == "Shree Ganesh Kirana"
        assert shop["items"] == 25
        assert shop["customers"] == 8
        assert shop["suppliers"] == 2
        assert shop["entries"] > 0
