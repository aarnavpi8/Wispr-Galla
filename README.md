# Galla: a voice khata for Indian shopkeepers

Shopkeepers speak the way they already do at the counter ("Sharma ji ne 500 UPI se diye",
"Ramesh ko 2 kilo cheeni udhaar, 15 tareekh tak") and Galla turns it into khata entries,
the day's cash and UPI totals, and polite WhatsApp reminders. Hindi, Hinglish, English and Marathi entries; the app itself speaks 12 Indian languages.

Built for India Runs on Voice (Scaler x Wispr Flow), Round 2.

## Run it (one command)

Needs Docker. No keys and no `.env` file required.

```bash
docker compose up --build
```

Open http://localhost:3000. A demo shop with items, customers and 3 days of history loads
automatically.

Optional extras go in a `.env` file (copy `.env.example`). Without them the app still runs:

- **LLM key**: upgrades how entries are understood. Without it, the built-in rules are used.
- **Firebase keys**: turn on Google login. Without them, there is no login screen and the app
  opens straight to the demo shop.

## What's in it

- Speak or type an entry (Wispr Flow, or the in-app mic). The entry card itself is flow 1, in progress.
- Money card, 7-day sales, accounts in plain words (to collect / to pay / net), close the day.
- Customer khata with overdue flags and a WhatsApp reminder you send yourself.
- Stock with low-stock alerts and history. **Scan a supplier's bill** to add stock: the photo
  is read on the phone (Tesseract.js, no key; it downloads a few MB the first time).
- 12 Indian languages, a guided tour, "?" help and read-aloud for first-time users.

## Turning on Google login (Firebase)

1. Go to https://console.firebase.google.com, **Add project** (Analytics not needed).
2. **Build -> Authentication -> Get started -> Sign-in method -> Google -> Enable**, pick a
   support email, Save.
3. **Authentication -> Settings -> Authorized domains**: `localhost` is there by default. Add the
   domain of any live link you deploy (D8).
4. **Project settings (gear) -> General -> Your apps -> Web (`</>`)**: register an app (no hosting).
   Copy `apiKey`, `authDomain`, `projectId`, `appId` from the config it shows.
5. Put them in `.env` at the repo root:
   ```
   FIREBASE_API_KEY=...
   FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
   FIREBASE_PROJECT_ID=your-project
   FIREBASE_APP_ID=1:...:web:...
   ```
   For local dev without Docker, put the same lines in `backend/.env` (the API serves them).
6. Restart (`docker compose up --build`). The first screen after the language picker is now
   "Google se login karein", with a "demo without login" option.

These four values are Firebase's public web config (they ship to every browser), but keep them
in `.env` anyway so each deployment can use its own project. Login currently identifies the
user in the app only; the API does not verify Firebase tokens yet.

## Run it without Docker (development)

Backend (Python 3.12+, SQLite by default):

```bash
cd backend
python -m venv .venv
.venv/Scripts/activate        # Windows; on macOS/Linux: source .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn app.main:app --reload --port 8000
```

Frontend (Node 20+), in a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:3000. The frontend forwards `/api/*` to the backend on port 8000.

## Project layout

```
backend/    FastAPI + SQLAlchemy. Data model, extraction contract, demo seed.
frontend/   Next.js (App Router) + Tailwind. Mobile-first PWA.
docker-compose.yml   db (Postgres) + api (FastAPI) + web (Next.js on port 3000)
CLAUDE.md   Product spec, decisions and working agreements.
```

## Tests and CI

```bash
cd backend && pytest                       # API + ledger maths
cd frontend && npm run lint && npm run typecheck && npm test && npm run build
```

GitHub Actions (`.github/workflows/ci.yml`) runs all of the above on every push and pull request,
then does what the judges do: `docker compose up --build` with no `.env` and checks that port 3000
serves the app and the API answers through it.
