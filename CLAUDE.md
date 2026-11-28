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

- Done: repo scaffold (FastAPI, Next.js, Docker Compose, `.env.example`).
- Done: home dashboard in the green + warm white theme (D17): expected-cash hero card, capture
  box with browser mic (D6 A), 7-day sales chart, recent entries, khata with balances and
  overdue flags, customer sheet with a WhatsApp reminder draft. Read-only API for it:
  `/api/config`, `/api/entries`, `/api/khata`, `/api/summary` (money maths in `backend/app/ledger.py`).
- Done: opening greeting animation, first-run language ring picker, 12 UI languages (D15).
  Every visible word comes from `frontend/src/lib/locales/<lang>.ts`; a test fails if any
  language misses a word or a `{placeholder}`.
- Done: novice guidance (D20): first-visit guided tour, "?" help on every money word with a
  plain example, read-aloud (🔊) everywhere, colour key (green in / red out / amber pending).
- Done: accounts card (lena / dena / net estimate / cash vs UPI book), close the day with the
  gap and the cash entries to check (flow 3, `/api/accounts`, `/api/day-close`).
- Done: inventory (D18): stock per item, low-stock alerts, +/- steppers, stock in / sold /
  wasted / recount with history, add item. Bill scan by photo (D19).
- Done: dashboard motion: circular reveal from "Get started", scroll reveals, bottom nav with
  a raised mic button. (The compact summary bar was removed: with swipe pages the header stays on
  top, and the bar covered it.)
  Scroll motion: tiles, rows, chips and chart bars inside `.reveal-stagger` containers rise in
  one after another as they enter the screen and replay when they come back from below
  (`ScrollMotion` in `components/Reveal.tsx`, one IntersectionObserver for the whole app, web
  and Android WebView alike; off for reduced motion).
- Done: phones swipe left/right between four pages, the same as the bottom bar (Today, Accounts,
  Stock, Khata); each page scrolls by itself and the header stays on top. Desktop keeps two columns.
  The big mic opens a speaking bubble (`VoiceBubble.tsx`) that starts listening at once; pressing
  the mic again stops it and the entry card opens.
- Done: hands-free mode (header toggle): the mic listens for "BolKhata"; what follows goes to the
  entry card / a command / a question, "BolKhata" alone opens the speaking bubble. Browser or phone
  speech (not Wispr), pauses while a card or sheet is open, keeps the screen awake, off after 10
  idle minutes (`hooks/useHandsFree.ts`). Saving still needs a tap.
- Done: optional Google login via Firebase (D14). Off without keys.
- Done: tests (pytest 238, Vitest 122) and GitHub Actions CI incl. a Docker Compose smoke test (D16).
- Next: flow 1 (one-line entries), starting with the rule-based extractor (D2). "Aage" on the
  capture box currently shows "not saved yet".
- Done: in-app mic via Wispr Flow API when `WISPR_API_KEY` is set (D23); browser speech
  otherwise; native Android speech inside the app.
- Done: GCP deploy (Terraform, Secret Manager keys) with nginx rate limits + certbot HTTPS (D21).
  Written and validated, not applied yet.
- Done: Android app shell with Capacitor around the same frontend (D22). Generated project in
  `frontend/android/`; not built here (no Android SDK on this machine).
- Done: a sale must name what was sold: at least one stock item with a quantity (card asks
  "What was sold?", API returns 422 otherwise), so stock and demand numbers stay true.
- Done: item words in five languages (`backend/app/itemwords.py`): English, Hinglish, Hindi, Marathi,
  Gujarati (script + Roman) for ~40 everyday items, so "khand"/"साखर"/"ખાંડ" find the sugar item.
  A word that fits several items ("dal", "dudh") makes the card ask "Which one?" with up to 3 chips;
  the word heard is saved as the picked item's alias, so it isn't asked again. The tokenizer now
  reads all Indian scripts (it used to split Gujarati words). Gujarati added to the mic language switch.
- Done: the mic keeps listening through pauses until stop is tapped (Android and browser restart
  after a silence and keep the words; 5-minute safety cap; Wispr recording cap 60 s -> 5 min).
  Stop always ends listening at once (Android never answers stop() between two stretches of
  speech, which once left the mic stuck on "Stop"; `lib/native.test.ts` guards it).
- Done: phone performance and fit. No live background blur or blurred glows on touch screens
  (janky frames while scrolling went 27% -> 1.2% on a Galaxy A55); a long example chip that pushed
  the page 18 px off-screen now wraps, and `overflow-x: clip` stops any future sideways overflow.
- Done: every transaction carries the prices the books need (server enforces, card guides):
  new item = selling + cost price (+ shelf life, guessed if skipped); buying = cost per unit
  (prefilled from the item or the spoken total ÷ qty) and a selling price if the item has none;
  selling = a price; stock-in / bill scan = a cost. First-time prices are saved on the item, so
  the next entry is one tap. Refusals use code `missing_prices` naming the items. The card shows
  stock per line, refuses selling more than the shelf has (see "Numbers must add up"),
  offers close stock items for unknown names, and "Items add up to ₹X. Use that?" on mismatches.
  "Cheeni kitni bachi hai?" (5 languages) answers with the stock (`item_stock` command).
- Done: spoilage (`backend/app/spoilage.py`), the stock version of depreciation. COGS stays at
  weighted-average cost; each item has a shelf life (days / months / long / none, guessed from the
  name) giving a monthly loss rate (20% / 5% / 1% / 0%). The stock account shows expected spoilage
  (estimate, not booked) and lists items older than they stay good, so the shopkeeper checks and
  records real wastage (booked at cost).
- Done: per-user data (D14 B). Each Google account and each browser sees only its own shop.
- Done: first-run shop setup (D24). New installs start empty and ask: shop name, what you sell
  (kirana / sabzi / medical / other), UPI and cash (optional); starter items at ₹0 with a price
  edit in the item sheet. "Try a demo shop" loads the sample data in one tap.
- Docker path: verified on Ansh's machine (D13); CI checks it on every push.
- Done: buying from a supplier on credit. "Gupta se maal aaya, udhaar pe", "kuch nahi diya" and
  "500 diye, baaki baad mein" become purchases owed to the supplier; the API turns an udhaar saved
  against a supplier into a credit purchase and rejects paid-now above the bill. Unknown items on a
  card get "Not in stock · Add it"; from a purchase the new item takes its stock from that entry.
- Done: numbers must add up (team request: "don't let them enter a value that doesn't add up").
  The server refuses, and the card disables Save with one plain sentence per problem:
  amount ≠ items' total (`amount_mismatch`, ±₹1; buying allows rounding of a cost worked out
  from the bill), selling more than the shelf has (`short_stock`, now a 422 with no "save anyway":
  lower the qty or record the stock in first), a payment above what the person owes, or any
  payment from someone who owes nothing (`overpay` with `owed`), paid-now above the bill
  (`paid_too_much`). Buying: the one line without a cost takes it from the spoken bill
  ("40 packet doodh 1120" = ₹28), not the item's older cost.
- Done: books fixed (`ledger.py`, `accounts.py`, `stockplan.cost_flows`). UPI spending was dropped
  (expenses, supplier payments, withdrawals by UPI were in no total; the UPI book's "out" was a
  fixed 0): now `upi_out`, and Expenses/Withdrawals include UPI. "Net" was sales − stock bought −
  expenses (a restock looked like a loss); now Profit = sales + goods given on credit (`credit_sales`)
  − cost of goods sold − wastage − expenses, the same COGS as the stock account. Stock on shelves is
  valued at cost. Opening stock is the stock account's opening balance, not a "recount". The demo
  history names its items (`seed.HISTORY_ITEMS`, same amounts; openings chosen so shelves end at
  the same counts), so demo profit uses real costs (7 days: ₹875, margin 28.6%).
- Done: summary numbers are buttons. Accounts: To collect → khata customers, To pay → khata
  suppliers, Profit → stock account, Stock → stock list. Money card: Sales/Collected → entries,
  Credit given → customers, Cash out → close the day. Sticky bar and desktop sidebar "To collect"
  too. Khata lists the overdue and biggest balances first. A person's sheet has a settle-up box
  (received / paid, cash or UPI, capped at what is owed).
- Fixed: the stock list didn't refresh after a purchase or new item saved from the speak box (it
  kept its own copy; now it follows the dashboard's refresh key). The tour card could sit above
  the screen with its Skip button while the overlay blocked the page; it now stays on screen.

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

### D12. Demo shop data — superseded by D24 (sample data now loads on request)
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

### D14. Google login and per-user data — `BUILT: B`
- **Option A (first version): optional Firebase Auth, client-side only.** Every user shared the
  one shop.
- **Option B (built): each Google account and each browser gets its own shop.** `shops.owner` is
  `google:<uid>` or `device:<random id>`. The browser sends the Firebase ID token
  (`Authorization: Bearer`) and a random device id kept in localStorage (`X-Galla-Device`,
  `frontend/src/lib/identity.ts`). The API checks the token with Firebase's `accounts:lookup`
  (the project's web API key; no new dependency; cached 5 min) in `backend/app/identity.py`;
  a bad token is 401, never a fallback to guest. `current_shop` and setup/demo look up the
  caller's shop only. No keys: guests are still isolated per device (judges' path unchanged:
  "demo shop" loads a private copy). Requests with no identity (curl, tests) see the old shared
  shop (`owner` NULL). Not done: moving a guest shop into a Google account on first sign-in.
- **Option C: no login** (original spec). Simplest for the judges' path.

### D15. UI languages — `BUILT`
- First open shows a language ring (turntable seen from front-top; scroll wheel, swipe, drag,
  arrow keys or tap). Saved in `localStorage` (`galla.lang`); header button "अ/A" reopens it.
- 12 languages, one file each in `frontend/src/lib/locales/` (English `en.ts` defines the keys;
  the `Locale` type and `src/lib/i18n.test.ts` make a missing word or placeholder fail CI).
  Gujarati, Punjabi, Bengali, Odia, Tamil, Telugu, Kannada, Malayalam were written by the team:
  **get a native-speaker check before the video.**
- Covers every word the app shows: headings, buttons, entry kinds, weekdays, "2 days ago",
  help, tour, login, errors, and the WhatsApp reminder text. Data (shop/item/customer names)
  stays as entered. Speech recognition and read-aloud use the chosen language.
- Opening animation cycles "नमस्ते / Namaste / नमस्कार / Hello / …" with ₹1,25,000 shown in
  each script's digits, then a time-of-day greeting in the chosen language. Tap to skip.

### D16. Tests and CI — `BUILT`
- Backend: pytest (`backend/tests/`): API on a fresh SQLite DB with no keys, ledger maths.
- Frontend: Vitest + Testing Library (`*.test.ts(x)` next to the code), jsdom acts as a touch
  phone with reduced motion so animations resolve instantly.
- `.github/workflows/ci.yml`: backend tests; frontend lint, typecheck, tests, build; then
  `docker compose up --build` with no `.env` and curl checks on port 3000.

### D17. Visual design — `BUILT`
- **Back to the original green (28 Nov, team request).** Same token names, green values:
  forest green actions (`brand-*`), leaf/mint tints (`iris-*`), lime accent (`gold-*`), green-black
  text (`ink-*`), money in = green `#15803d`, out = red `#b91c1c`. The blue version below is kept for reference.
- (Previous) Light theme everywhere. Warm white paper (`#faf6ee`), soft slate text (`ink-*`), sky-blue
  actions (`brand-*`: buttons, selected chips, the mic), light blue tints (`iris-*`) and a
  marigold accent (`gold-*`). Big cards (money card, splash, day close, desktop panel, sticky
  bar) are light blue-to-cream gradients with dark text. Why blue: it reads as trust and money
  to Indian shopkeepers (bank passbooks, SBI, Paytm, GPay), stays calm on cheap screens, and is
  told apart from the red "money out" by colour-blind users. Green was dropped (team found it
  hard on the eyes), then dark indigo (too dark). Money colours: in = blue, out = brick red,
  pending = amber; gold is for highlights only, never money values. Tokens in `globals.css`.
- Cursor effects only on devices with a fine pointer, off for touch and reduced motion
  (`components/interactive.tsx`): card spotlight + rim, hero card 3D tilt, magnetic buttons, a
  faint page glow. Tried and removed: ripple rings and a ring follower behind the cursor.

### D18. Inventory — `BUILT`
Was a parked idea; the team asked for it. `items.stock` + `items.low_stock_at`, and a
`stock_moves` table (delta, reason, stock_after) so every count can be explained; moves are
never deleted. Reasons: opening, purchase, sale, wastage, count (recount sets the number).
`app/migrate.py` adds the new columns to older databases on start (add-only, never drop), and
`seed_stock_if_missing` gives an existing demo shop its opening stock.
Not yet: sales entries don't reduce stock automatically (needs flow 1's item matching).

### D19. Bill scan OCR — `BUILT: A`
- **Option A (built): Tesseract.js in the browser, English, LSTM-only int model.** No key, no
  server load. Loaded only when "Scan bill" is opened; the engine and model (a few MB) come
  from the jsDelivr CDN on first use, then the browser caches them. The photo is shrunk to
  1600 px and greyed first. Text goes to `POST /api/items/scan` (`app/billscan.py`: fuzzy
  item match on names/aliases, quantity from "2 dozen", "10 kg", "24 x 10", qty×rate=amount).
  The shopkeeper ticks lines, fixes amber ones via chips, then one tap calls
  `POST /api/items/stock-batch` (all or nothing). Needs internet on first use.
- **Option B: Tesseract on the server** (apt `tesseract-ocr` in the API image). Offline, but a
  much bigger image and slower builds.
- **Option C: LLM vision** (D3 provider). Best on messy/handwritten bills; needs a key.

### D20. Guidance for first-time users — `BUILT`
Users may never have used an app or kept accounts. Tour (`components/Tour.tsx`, 6 steps,
auto-starts once, "How to use" in the account menu reopens it), `HelpTip` "?" buttons with a
plain-language example per term, `ListenButton` read-aloud via browser speech (D7 A), colour
key under the money card, numbered steps in the bill scan, breathing ring on the mic button.

### D21. Edge proxy on the VM — `BUILT: B`
- **Option A: Caddy** (first version). Automatic HTTPS in 5 lines, but rate limiting needs a plugin.
- **Option B (built): nginx + certbot.** Per-IP `limit_req` zones (pages 20/s, API 10/s,
  `/api/transcribe` 12/min because Wispr is paid), connection cap, body/timeouts, security
  headers incl. Permissions-Policy for mic/camera, gzip, HTTP→HTTPS. certbot issues/renews; nginx
  starts on a self-signed stand-in and swaps by itself. Config: `deploy/gcp/nginx/`.
  Verified locally: redirects, headers, 429 after the burst, 413 on a 7 MB body.

### D22. Mobile app — `BUILT: A`
- **Option A (built): Capacitor shell loading the server URL** (`frontend/capacitor.config.ts`,
  `CAP_SERVER_URL` at sync time; `mobile/www/offline.html` when unreachable). Same frontend,
  live reload from a laptop on Wi-Fi, no second codebase. Native plugins: speech recognition and
  text-to-speech (WebView has no Web Speech API). Needs network (data is on the server anyway).
- **Option B: static export bundled in the APK.** Works offline for the UI, but needs
  `output: "export"`, the `/api` proxy route removed, an absolute API URL and CORS. Do this only
  with offline queueing (robustness rule "baad mein").
- **Option C: Trusted Web Activity / PWA install.** Lightest, but no native speech plugins.
- Google sign-in in the app: native account picker via `@capacitor-firebase/authentication`
  (`skipNativeAuth: true`): the phone returns a Google ID token, then the web Firebase SDK signs
  in with it (`lib/firebase.ts`), so the server sees the same account and shop as on the website.
  Needs `frontend/android/app/google-services.json` (git-ignored; download from Firebase) with the
  build machine's SHA-1 registered for `in.galla.app`. Verified on a Galaxy A55 (28 Nov).

### D23. In-app speech-to-text — `BUILT: A` (replaces D6 order)
- **Option A (built): Wispr Flow API** behind `transcribe()` (`backend/app/speech.py`,
  `POST /api/transcribe`). The browser records, converts to 16 kHz mono WAV itself
  (`frontend/src/lib/recorder.ts`), the key stays on the server. Shop item/party names go as
  `dictionary_context`. Without a key: browser speech (web) / native speech (app).
  Wispr API access needs approval (enterprise@wisprflow.ai); Indian-language support isn't
  documented, so confirm Hindi/Marathi with them.
- **Option B: Wispr client tokens** (`/generate_access_token` + browser calls `/client_api`):
  lower latency, but more moving parts. Switch if latency hurts the demo.

### D24. First run: real shop, not sample data — `BUILT`
`SEED_ON_START` now defaults to false. `GET /api/setup` says whether a shop exists; the app shows
`SetupScreen` (3 steps, in the chosen language, read-aloud) and `POST /api/setup` creates the shop
with optional starter items for its kind (`backend/app/setup.py`; price 0 and no stock alert, so
nothing is guessed). `POST /api/setup/demo` loads the D12 sample shop for judges ("never an
empty screen" is kept through that button). No location question: language comes from the
picker. Still one shop per server (multi-shop per Google account is D14 option B).

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
- Customer login (discussed 28 Nov, not built): a customer sees what they owe at each shop. Link a
  login to a khata through a private link/QR the shopkeeper sends (e.g. in the WhatsApp reminder),
  not by phone-number matching (SMS cost, unsaved/recycled numbers would show debts to strangers).
  "Nearby stores" would need a shop location; show balances only for linked shops. ~1–1.5 days.

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
| Login | None | D14: optional Google login (Firebase), off without keys | Team request; keyless path kept |
| UI language | Hindi/Hinglish/English/Marathi | D15: 12 UI languages, ring picker, greeting splash | Team request |
| Quality | Backend smoke test | D16: pytest + Vitest + CI with Docker smoke test | Catch breakage before submission |
| Scope | Flows 1, 3, 4 (D1 A) | + inventory and bill scan (D18, D19); flow 3 built | Team request |
| Users | Assumed app-literate | D20: tour, "?" help, read-aloud, colour key | Team request: first-time app users |
| Speech-to-text | Indian STT API (Sarvam/Bhashini) | D23: Wispr Flow API, browser/native fallback | Hackathon partner; team request |
| Hosting | Optional live link | D21/D22: GCP VM with nginx, Android app shell | Team request |
| Sanity checks | "Ask which is right" on mismatches | Refuse anything that doesn't add up (total, stock, overpay) | Team request: no logical fallacies |
| Colours | Green + warm white | Blue, then back to green (D17) | Team preferred the original green |
| Net | Sales − purchases − expenses | Profit = sales + credit sales − COGS − wastage − expenses; UPI spending counted | Restocking looked like a loss; UPI out was dropped |

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
- Frontend checks: `cd frontend && npm run lint && npm run typecheck && npm test && npm run build`
- Frontend tests in watch mode: `cd frontend && npm run test:watch`
- Android app: see `frontend/mobile/README.md` (`CAP_SERVER_URL=… npm run cap:sync`, then `npm run android:open`)
- Deploy to GCP: see `deploy/gcp/README.md` (`terraform apply -var project_id=…`)
- Show the first-run screens again: in the browser console, `localStorage.removeItem("galla.lang")`

## Repo layout

- `backend/app/`: `main.py` (routes: `/api/health`, `/api/config`, `/api/shop`, `/api/entries`,
  `/api/khata`, `/api/summary`), `ledger.py` (day totals, expected cash, balances), `models.py` (tables),
  `schemas.py` (extraction contract), `seed.py` (demo shop), `config.py` (settings, all with
  defaults so no `.env` is needed), `db.py`.
- `backend/tests/`: `conftest.py` (fresh DB, no keys), `test_api.py`, `test_ledger.py`.
- `frontend/src/components/`: `Dashboard.tsx` and its parts, `auth.tsx` (Firebase, D14),
  `language.tsx` + `LanguagePicker.tsx` + `Splash.tsx` (D15), `interactive.tsx` (cursor effects).
- `frontend/src/lib/`: `types.ts`, `format.ts` (₹, entry kinds, time ago, WhatsApp/UPI links),
  `i18n.ts` + `locales/*.ts` (UI words, D15), `ocr.ts` (bill scan, D19), `speak.ts` (read-aloud),
  `transition.ts` (circular reveal), `firebase.ts` (lazy-loaded), `api.ts`.
- `backend/app/`: also `inventory.py` (items, stock moves, scan, batch), `accounts.py`
  (accounts overview, day close), `billscan.py` (OCR text -> item lines), `migrate.py`, `deps.py`.
- `frontend/src/app/`: `page.tsx` (language picker -> login if configured -> dashboard), `layout.tsx` (fonts, providers),
  `api/[...path]/route.ts` (proxy to backend, D11). `frontend/src/lib/types.ts` mirrors
  `backend/app/schemas.py`.
- Next.js here is v16 with Cache Components; read `frontend/AGENTS.md` and the docs in
  `frontend/node_modules/next/dist/docs/` before writing frontend code.
