import os
import tempfile

# A fresh database file and no keys, like a judge's fresh clone.
# Set before any test module imports the app (the engine is built at import time).
os.environ["DATABASE_URL"] = f"sqlite:///{tempfile.mkdtemp()}/test.db"
for key in ("LLM_PROVIDER", "LLM_API_KEY", "FIREBASE_API_KEY", "FIREBASE_AUTH_DOMAIN",
            "FIREBASE_PROJECT_ID", "FIREBASE_APP_ID"):
    os.environ[key] = ""
