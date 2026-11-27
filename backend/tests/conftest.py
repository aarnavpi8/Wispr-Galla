import os
import tempfile

# A fresh database file and no keys, like a judge's fresh clone.
# Set before any test module imports the app (the engine is built at import time).
os.environ["DATABASE_URL"] = f"sqlite:///{tempfile.mkdtemp()}/test.db"
# The shared test DB starts with the demo shop; test_setup.py uses its own empty DB.
os.environ["SEED_ON_START"] = "true"
for key in ("LLM_PROVIDER", "LLM_API_KEY", "WISPR_API_KEY", "FIREBASE_API_KEY", "FIREBASE_AUTH_DOMAIN",
            "FIREBASE_PROJECT_ID", "FIREBASE_APP_ID"):
    os.environ[key] = ""
