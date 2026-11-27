# Galla: a voice khata for Indian shopkeepers

Shopkeepers speak the way they already do at the counter ("Sharma ji ne 500 UPI se diye",
"Ramesh ko 2 kilo cheeni udhaar, 15 tareekh tak") and Galla turns it into khata entries,
the day's cash and UPI totals, and polite WhatsApp reminders. Hindi, Hinglish, English and Marathi.

Built for India Runs on Voice (Scaler x Wispr Flow), Round 2.

## Run it (one command)

Needs Docker. No keys and no `.env` file required.

```bash
docker compose up --build
```

Open http://localhost:3000. A demo shop with items, customers and 3 days of history loads
automatically.

Optional: copy `.env.example` to `.env` and add an LLM key to upgrade how entries are understood.
Without a key, the built-in rule-based extractor is used.

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

## Tests

```bash
cd backend && pytest
cd frontend && npm run lint
```
