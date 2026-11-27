# Galla: a voice khata for Indian shopkeepers

Hackathon build for India Runs on Voice (Scaler x Wispr Flow). Team of 3.
Round 2 runs 27–30 Nov 2026. **Hard deadline: 30 Nov, 11:59 pm. We can submit only once.**
Internal target: feature-complete by 29 Nov so 30 Nov is for the video, deck and a clean-clone test.
We build hands-free: prompts are dictated with Wispr Flow.

## How to read this file

- The **original spec** (our first CLAUDE.md, written before Round 2 rules were out) is kept
  as the baseline: flows, engine, contract, robustness rules, stack, data model, demo.
- Where we changed something or thought of an alternative, it is written as **options** in
  the "Decisions" section, so anyone who clones the repo can see every path we considered.
- Each decision has a status:
  - `OPEN`: not decided. Ask before building anything that depends on it.
  - `RECOMMENDED`: follow this unless the team says otherwise.
  - `BUILT`: already in the code. Changing it means changing code, so ask first.
- "Change log" at the bottom lists what changed from the original spec and why.

## Status (keep this current)

- Done: repo scaffold. FastAPI backend with the data model, extraction contract and demo seed;
  Next.js frontend with a placeholder home screen; Docker Compose; `.env.example`.
- Next: flow 1 (one-line entries), starting with the rule-based extractor (D2).
- Not yet verified: `docker compose up` on a machine with Docker (D13).

## Round 2 brief (official)

> Build a working voice-first prototype for India. One core flow that works end to end.
> Not a full product.
>
> The main task in your product is done by speaking. Think of something people in India do
> today by typing, tapping or filling forms, and make it work by voice. Choose one theme, then
> a real problem within it. Extend your Round 1 idea or start a new one.

Themes: public infrastructure and civic services, healthcare access, inclusive education,
**livelihoods and small business** (ours), everyday access for all.

We are extending our Round 1 idea (Galla). The brief wins over anything below: if they
conflict, keep the engine and change the extraction schema and output cards.

## Round 2 submission rules (official, must all pass)

You will build the full version at the finale. Send three things; a live link is optional.

1. **Code on GitHub**. Judges start the app from this code. If it doesn't start, we're out.
   - The repo is public.
   - A `docker-compose.yml` starts the whole app with one command.
   - The app is exposed on a port in `docker-compose.yml` (e.g. `ports: - 3000:3000`). Opening
     that port must show our app, not a default server page.
   - The app starts and shows its main screen **without any secret keys**. Judges add no keys.
     A feature that needs a key may show a "key not set" message.
   - Any environment variables are listed in `.env.example` with placeholder values. The app
     must start **without a `.env` file**.
   - We write our own code during the hackathon, about 300 lines or more. A starter template
     with small changes doesn't pass.
2. **Demo video on YouTube**: public or unlisted, 3 minutes or less, showing the product working.
3. **Pitch deck (PDF)**: judges read the words, not the pictures, so key points must be text.
   Cover: (1) problem and solution, (2) who it's for and how many, (3) what it depends on
   (voice tools, AI models, services) and what happens if they get costly or stop working,
   (4) launch plan for the first users and growth.
4. **Live link (optional)**: a small bonus if it works; never counts against us. Self-hosted.

Tip from the organisers: before submitting, have a friend clone the repo and start it.

## Round 1 context (what we already promised)

Our Round 1 submissions (Idea, Prompt, Impact) describe the full product: 6 shop-type
templates, 10 languages, 8 entry types, double-entry accounting, stock, GST, "Galla se
poocho" Q&A, "Samjhao" explainer cards and lessons, on-phone data. Round 2 builds a slice of
it. Promises from Round 1 that the build should still visibly keep:

- Nothing saves without a tap; reminders are never sent automatically.
- Totals and duplicate checks, undo, learning from corrections.
- "Zero edits": the share of entries saved without any correction (our pilot metric).
- Never delete entries; correct with reversals and keep a visible history (see D9).

Round 1 ideas not in this build are listed under "Parked ideas" so they aren't lost.

## What we're building

Shopkeepers talk the way they already do at the counter. The app turns that speech into bills,
khata (ledger) entries and a daily cash summary. Typing is optional, never required.

Users: owners and staff of kiranas, vegetable stalls, medical stores and small shops. Cheap
Android phones, patchy 4G, loud shops, hands busy with a queue. Many can't type comfortably
in English or their own script.

Languages: Hindi, Hinglish (Roman script), English, plus Marathi. People switch language
mid-sentence. Numbers come in any form: "dhai sau", "two fifty", "saade teen hazaar".

## Build order (original spec; D1 decides how much of it we build)

One flow perfect before the next one starts.

1. **One-line entries (MVP, the core flow)**: text or speech -> entry card -> one tap saves ->
   khata and today's totals update. Entry types: sale, udhaar, payment, purchase, expense
   (+ owner withdrawal, see D9).
   Examples: "Sharma ji ne 500 UPI se diye", "Ramesh ko 2 kilo cheeni udhaar, 15 tareekh tak",
   "Gupta distributor ka maal aaya 3,200 ka, 1,000 cash diye, baaki agle hafte", "Bijli bill 850 bhara".
2. **Live bill**: "Bill shuru" opens a bill; each spoken item is matched to the price list and
   added with qty, price and line total; the running total updates; "Total" closes it and asks
   "Cash, UPI ya udhaar?". UPI shows the shop's saved QR.
3. **Close the day**: "Din band karo" shows sales, cash in, UPI in, udhaar given and collected,
   expenses, and expected cash in the galla. Asks "Galla mein kitna hai?" and shows the gap
   next to the cash entries that could explain it.
4. **Khata and reminders**: "Sharma ji ka hisaab" opens a customer's balance and entries.
   Overdue dues list. "Reminder bhejo" drafts a polite WhatsApp message with amount, due date
   and UPI link; the shopkeeper taps Send.
5. **Price list setup by voice** ("Parle-G chhota 10, bada 25, Amul doodh aadha litre 28").
   For the demo, seed data covers this; build the voice version only if time allows.
6. **Money explainer cards** (loan interest, UPI settlement, GST limit) using the shop's own
   numbers. Facts only, no advice. Cut this first if time is short.

## Decisions

### D1. How much to build — `RECOMMENDED: A`
The Round 2 brief asks for "one core flow that works end to end, not a full product".
- **Option A (recommended): core flow + two extras.** Flow 1 polished end to end first. Then
  flow 3 (close the day) and flow 4 (khata + reminder), which reuse the same entries. Flows 2,
  5 and 6 are cut and named as "finale" work in the deck.
- **Option B: original build order.** 1 -> 2 -> 3 -> 4, then 5 and 6 if time allows. More
  impressive if it all works; much riskier in 3 days (the live bill is the most work).
- **Option C: core flow only.** Flow 1 and nothing else, maximally polished.

### D2. Understanding text without keys — `RECOMMENDED: A`
Judges run with no keys, and extraction is the core flow. The original spec had LLM only.
- **Option A (recommended): rule-based extractor + optional LLM.** A deterministic parser
  (number/unit/date normalisation, keyword-based type detection, fuzzy party/item matching
  against shop data) always works. If an LLM key is in `.env`, `extract()` uses the LLM and
  falls back to rules on error. Same contract either way. Also answers the deck's "what if it
  gets costly or stops working". The home screen already shows "AI key not set: using the
  built-in rules" when no key is present.
- **Option B: LLM only (original spec).** Simpler, better on messy sentences, but with no key
  the core flow shows "key not set" and judges never see it work.
- **Option C: canned demo mode.** LLM when a key exists; without one, only the scripted demo
  sentences work (cached responses). Cheapest, but fragile if judges type their own sentence.

### D3. LLM provider (optional upgrade for D2) — `OPEN`
No recommendation; it depends on whose key the team has.
- **Option A: Anthropic (Claude).**
- **Option B: OpenAI.**
- **Option C: Google Gemini.**
Requirement: structured JSON output matching the contract. Config is already wired:
`LLM_PROVIDER` and `LLM_API_KEY` in `.env` (see `backend/app/config.py`). Ask before adding a
paid API.

### D4. Database — `BUILT: A`
Judges start via Docker Compose. The original spec said Postgres only.
- **Option A (built): Postgres in Compose, SQLite for local dev.** Compose runs a `postgres`
  service and sets `DATABASE_URL`; without it the backend uses `sqlite:///./galla.db`.
  Tables use JSON columns (not ARRAY/JSONB) so both databases work.
- **Option B: SQLite everywhere.** One less container. Fine for a demo; the deck says Postgres
  in production.
- **Option C: Postgres everywhere (original spec).** Needs Docker Desktop or Postgres locally.

### D5. Docker layout — `BUILT: A`
- **Option A (built): separate services.** `db` (Postgres), `api` (FastAPI, internal 8000),
  `web` (Next.js standalone build, port 3000 exposed). The browser only talks to port 3000.
- **Option B: single container.** Next.js static export served by FastAPI on port 3000.
  Simplest to host for a live link, but loses Next.js server features.
Either way: seed data loads on first start, and `docker compose up` with no `.env` works.

### D6. In-app mic (fallback to Wispr Flow) — `RECOMMENDED: A`
Wispr Flow is the primary input and needs no code: it types into the text box.
- **Option A (recommended): browser speech recognition** (Web Speech API, `hi-IN` / `en-IN` /
  `mr-IN`). No key. Works in Chrome on Android; needs network; hide the mic when unsupported.
- **Option B: Indian-language STT API (original spec)** (e.g. Sarvam, Bhashini) behind
  `transcribe()`. Records 16 kHz mono WAV. Shows "key not set" without a key.
- **Option C: both.** API when a key is set, browser otherwise.

### D7. Read-aloud — `RECOMMENDED: A`
- **Option A (recommended): browser speech synthesis** (`speechSynthesis`, Hindi voice). No key.
- **Option B: TTS API** behind `speak()`, "key not set" without a key.

### D8. Live link — `OPEN`
Decide on 29 Nov once the core flow is solid.
- **Option A: deploy** to a free host (e.g. Render, Railway, Fly). Needs the keyless path
  (D2 A) to be useful to visitors.
- **Option B: skip.** No penalty.

### D9. Round 1 ideas to keep — `RECOMMENDED` (data model `BUILT`)
- **Reversals instead of deletes (recommended; `reverses_id` column built).** Undo and edits
  create a reversal entry linked to the original; the khata shows the history. The original
  spec used an `undone_at` timestamp instead; switch back only if reversals prove too slow to build.
- **"Zero edits" flag (recommended; `edited` column built).** Show the share on the
  close-the-day screen.
- **Owner withdrawal as a 6th entry type (optional; in the contract and seed data).** Shows
  drawings aren't expenses. Drop from the UI if short on time.
- **"Galla se poocho" Q&A (cut unless D1 work is done early).**

### D10. Python version — `BUILT`
Samarth's machine has Python 3.15 (default) and 3.14.
- **Built:** Docker image uses `python:3.12-slim`. Local dev uses a 3.14 venv
  (`py -3.14 -m venv .venv`); all dependencies installed and tests pass on it.
- **Alternative:** install Python 3.12 locally to match Docker exactly.
- **Avoid:** 3.15 for now; some libraries may not have wheels for it yet.

### D11. Frontend -> backend calls — `BUILT: A`
- **Option A (built): catch-all route handler** `frontend/src/app/api/[...path]/route.ts`
  forwards `/api/*` to `API_URL`, read at request time (Docker: `http://api:8000`; local
  default `http://localhost:8000`). One image works in any environment.
- **Option B: `rewrites()` in `next.config.ts`.** Less code, but the destination is fixed at
  build time in standalone output, so the Docker build needs `API_URL` as a build arg.
- **Option C: browser calls FastAPI directly** with CORS. Needs port 8000 exposed too.

### D12. Demo shop data — `RECOMMENDED: A`
Seeded in `backend/app/seed.py`: "Shree Ganesh Kirana", 25 items with Hindi/Marathi/misspelt
aliases, 8 customers, 2 suppliers, 14 history entries over the last 3 days (one overdue udhaar
for the reminder demo, one owner withdrawal).
- **Option A (recommended): keep placeholder details** (made-up UPI ID and phone numbers
  `98765000xx`). Safe to show publicly.
- **Option B: real shop details** for the video (a real shopkeeper's name, UPI ID). Only with
  their consent; never commit real phone numbers.

### D13. Testing the Docker path — `OPEN`
Docker isn't installed on Samarth's machine, so `docker compose up` hasn't been run yet.
- **Option A: install Docker Desktop** on Samarth's machine.
- **Option B: a teammate runs it** on their machine (doubles as the "friend clones it" check).
Must happen before 30 Nov either way.

## The engine (every feature goes through it)

1. Capture: a large text box that Wispr Flow types into, plus a hold-to-talk mic button (D6).
2. Understand: turn text into the JSON contract below and list missing fields (D2).
3. Produce: a large entry card in the shopkeeper's language.
4. Confirm: Save / Edit / Cancel. A speaker button reads the card aloud (D7).
5. Store and follow up: write to the database, update totals, schedule reminders.

Keep each external service behind one small function so it can be swapped, and give each a
keyless fallback or a clear "key not set" result:
- `transcribe(audio) -> {text, lang, confidence}`
- `extract(text, shop_context) -> Entry` (shop_context = price list, party names, aliases, today's date)
- `speak(text, lang) -> audio`

## Extraction contract (Pydantic on the backend, TypeScript on the frontend)

Built: `backend/app/schemas.py` (`ExtractedEntry`) and `frontend/src/lib/types.ts`.
Keep the two in sync.

```json
{
  "type": "sale | udhaar | payment | purchase | expense | owner_withdrawal | bill_item | command",
  "party": {"name": "Sharma ji", "kind": "customer | supplier", "match_id": null},
  "items": [{"name": "Parle-G chhota", "item_id": null, "qty": 2, "unit": "pc", "price": 10}],
  "amount": 500,
  "paid_now": null,
  "mode": "cash | upi | udhaar | null",
  "due_date": "2026-12-15",
  "command": "bill_start | bill_total | day_close | show_khata | send_reminder | null",
  "confidence": {"party": 0.92, "amount": 0.97, "items": 0.81, "due_date": 0.7},
  "missing": ["due_date"],
  "raw_text": "...",
  "source": "rules | llm"
}
```

Amounts are integers in rupees. Dates are ISO strings resolved against today ("parson",
"agle Monday", "15 tareekh"), in the `Asia/Kolkata` timezone. Added to the original contract:
`owner_withdrawal` (D9) and `source` (which extractor produced the entry, D2). Party and item
confidence should come from our own fuzzy matching, not from an LLM's self-reported score.

## Robustness rules (non-negotiable)

- Nothing saves without a tap. Never auto-send any message.
- Any field with confidence below 0.8 is highlighted yellow with up to 3 tap-to-pick alternatives.
- A missing required field triggers one short question, on screen and spoken.
- Match items and parties by sound and spelling, not exact text ("Parlay" = Parle-G,
  "Sarma" = Sharma). Below 0.8 similarity, show the top 3 as chips.
- Normalise spoken numbers, units (pav, aadha, dhai kilo, darjan) and dates before extraction.
- Sanity checks: item total vs spoken amount mismatch -> ask which is right; same entry within
  2 minutes -> ask "Dobara?"; two parties with the same name -> ask which one.
- Every correction is saved as an alias on the item or party.
- 10-second undo after every save.
- Empty or very short audio -> "Phir se boliye" plus an example sentence.
- Offline: queue the text locally, mark it "baad mein", process when back online.

## Stack

- Frontend: Next.js 16 (App Router, Cache Components) PWA, Tailwind 4. Touch targets at least
  56 px. Noto Sans and Noto Sans Devanagari. Mobile-first; test at 360 px width. Indian number
  format (₹1,25,000). Colours: green = money in, red = money out, amber = pending (defined in
  `frontend/src/app/globals.css`).
- Backend: FastAPI, SQLAlchemy 2, Pydantic 2, pydantic-settings. Database per D4.
- Run: `docker compose up --build` (D5).
- Speech-to-text: Wispr Flow needs no code. In-app mic per D6.
- LLM: optional, per D2/D3. Structured JSON output matching the contract, with the shop's
  price list, party names and aliases in the prompt.
- WhatsApp: open `https://wa.me/<number>?text=<urlencoded message>` so the shopkeeper taps Send.
- UPI link: `upi://pay?pa=<vpa>&pn=<shop name>&am=<amount>&cu=INR`.

## Data model (built in `backend/app/models.py`)

- shops (id, name, vpa, language, opening_cash)
- items (id, shop_id, name, variant, unit, price, aliases json)
- parties (id, shop_id, name, kind, phone, aliases json)
- entries (id, shop_id, type, party_id, items json, amount, paid_now, mode, due_date,
  raw_text, confidence json, source, edited, reverses_id, created_at)
- day_close (id, shop_id, date, opening, expected, counted, difference)

`reverses_id` points at the entry a reversal cancels (D9); entries are never deleted.
`source` is `rules`, `llm` or `seed`.

## Demo

- Seed one shop: 25 items with aliases, 8 customers, 2 suppliers, 3 days of history (D12).
  Loads automatically on first start.
- The demo must never show an empty screen.
- Video is 3 minutes max (original spec: 90 seconds; keep it tight either way).
  Script for D1 A: one-line udhaar entry in Hinglish -> a low-confidence field fixed by
  tapping a chip -> close the day with a galla gap -> WhatsApp reminder with UPI link -> one
  entry in Marathi. For D1 B, add the original spec's live bill with an unknown item.
- Record with real background noise. Include one real shopkeeper clip and a 15-second clip of
  us building by voice with Wispr Flow.

## Pitch deck checklist (PDF, text-first)

- Problem and solution; who it's for and how many (~13 million kiranas; 1% = 1.3 lakh shops).
- What it depends on: Wispr Flow, browser speech, optional LLM/STT/TTS APIs, and the fallback
  for each (rule-based extractor, browser speech, typing) if they get costly or stop working.
- Launch plan: 4-week pilot with 20–30 shops near campus, metrics from the Round 1 Impact
  submission (entries per day, zero-edit share, udhaar recovered, galla gap, week-4 retention).

## Submission checklist (before 30 Nov, 11:59 pm)

- [ ] Repo is public.
- [ ] Fresh clone + `docker compose up --build` with no `.env` shows the main screen on port 3000 (D13).
- [ ] Core flow works with no keys (D2).
- [ ] `.env.example` lists every variable with placeholder values.
- [ ] A teammate on another machine has cloned and started it.
- [ ] YouTube video (≤ 3 min) uploaded, public or unlisted.
- [ ] Deck PDF covers the four points as text.
- [ ] Live link works (if D8 A).

## Parked ideas (from Round 1; not in this build)

Kept here so they aren't lost; mention as finale work in the deck.
- 6 shop-type templates (kirana, sabziwala, medical, rehri/street food, hardware/kapda,
  service shops) with voice onboarding.
- 10 languages (+ Gujarati, Tamil, Telugu, Bengali, Kannada, Punjabi).
- Entry types: return, wastage.
- Double-entry accounting, cash book vs UPI book, receivables/payables aging, credit limits.
- Stock (opening + purchases − sales − wastage), low-stock and expiry alerts.
- GST (output, input, net payable, threshold progress), P&L, balance sheet, depreciation, loans.
- "Galla se poocho" voice Q&A; "Samjhao" picture cards; "Khud padhna seekho" lessons.
- Data on the phone first with encrypted backup.

## Change log (original spec -> current)

| Area | Original spec | Now | Why |
|---|---|---|---|
| Deadline | 29 Nov | 30 Nov, 11:59 pm hard; 29 Nov internal | Round 2 rules |
| Problem statement | Placeholder | Official brief and rules pasted above | Round 2 released |
| Scope | Build order 1–6 | D1 options; recommend 1 + 3 + 4 | "One core flow, not a full product" |
| Extraction | LLM only | D2 options; recommend rules + optional LLM | Must work without keys |
| Database | Postgres | D4: Postgres in Docker, SQLite locally | No Docker/Postgres locally; zero-setup dev |
| Running | Not specified | Docker Compose, port 3000 (D5) | Round 2 rules |
| Mic / read-aloud | STT and TTS APIs | D6/D7: browser speech first | No keys needed |
| Contract | 7 types | + `owner_withdrawal`, + `source` | D9, D2 |
| Data model | `undone_at`, jsonb, arrays | `reverses_id`, `edited`, `source`; JSON columns | D9 reversals, zero-edit metric, SQLite support |
| Video | 90 seconds | ≤ 3 minutes allowed | Round 2 rules |
| Added | — | Deck and submission checklists, parked ideas, D10–D13 | Round 2 rules, scaffolding |

## Working agreements

- Keep main runnable. Small commits with clear messages.
- Secrets go in `.env`, never in git. Commit `.env.example` only.
- Ask before adding a paid API or a new major dependency.
- Prefer finishing a flow end to end over starting a new one.
- Every feature must work, or fail with a clear message, without keys.
- When you change a decision or add an option, update this file (Decisions, Status, Change log).

## Commands

Run from the repo root unless noted. Paths use Windows venv layout (`.venv/Scripts/`);
on macOS/Linux use `.venv/bin/`.

- Whole app (judges' path): `docker compose up --build` -> http://localhost:3000
- Backend setup (once): `cd backend && py -3.14 -m venv .venv && .venv/Scripts/python -m pip install -r requirements-dev.txt`
- Backend server: `cd backend && .venv/Scripts/python -m uvicorn app.main:app --reload --port 8000`
- Frontend setup (once): `cd frontend && npm install`
- Frontend dev server: `cd frontend && npm run dev` (proxies `/api/*` to `API_URL`, default http://localhost:8000)
- Reset the demo shop: `cd backend && .venv/Scripts/python -m app.seed --reset`
- Backend tests: `cd backend && .venv/Scripts/python -m pytest`
- Frontend checks: `cd frontend && npm run lint && npm run build`

## Repo layout

- `backend/app/`: `main.py` (routes: `/api/health`, `/api/shop`), `models.py` (tables),
  `schemas.py` (extraction contract), `seed.py` (demo shop), `config.py` (settings, all with
  defaults so no `.env` is needed), `db.py`.
- `backend/tests/`: starts the app on an empty database with no keys and checks the seed.
- `frontend/src/app/`: `page.tsx` (home, placeholder for flow 1), `layout.tsx` (fonts),
  `api/[...path]/route.ts` (proxy to backend, D11). `frontend/src/lib/types.ts` mirrors
  `backend/app/schemas.py`.
- Next.js here is v16 with Cache Components; read `frontend/AGENTS.md` and the docs in
  `frontend/node_modules/next/dist/docs/` before writing frontend code.
