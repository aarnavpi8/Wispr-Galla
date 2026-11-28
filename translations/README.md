# BolKhata translations

Two spreadsheets (CSV, UTF-8; open in Excel or Google Sheets):

| File | What it is | Rows |
|---|---|---|
| `ui-words.csv` | Every word and sentence the app shows | 340 |
| `voice-words.csv` | What shopkeepers **say**: commands ("close the day") and entry words ("credit", "paid") | 17 |

Hindi, Hinglish and Marathi have been checked. **Gujarati, Punjabi, Bengali, Odia, Tamil, Telugu,
Kannada and Malayalam are drafts** and need a native speaker.

## For translators

**ui-words.csv:** fix the text in your language's column. The `english` column is the source,
`section` says which screen, `notes` explains anything tricky.

- Keep everything in `{curly braces}` exactly as it is: `{x}`, `{name}`, `{n}`, `{i}`, `{d}`, `{item}`,
  `{upi}`, `{shop}`. Move them to wherever they belong in your sentence.
- Keep **BolKhata** (the app name) in Latin letters.
- Write how a shopkeeper talks, not formal or textbook language. Short is better: buttons are small.
- `ex1`–`ex4` are example sentences a shopkeeper would say; use local names.

**voice-words.csv:** in your language's column, list the ways people would **say** each thing,
separated by ` | `. The more natural variants, the better the app understands. Example (Hindi, close
the day): `दिन बंद | दुकान बंद | गल्ला गिनो | हिसाब मिलाओ`.
Short stems work best ("स्टॉक दिखा" also matches "स्टॉक दिखाओ"). Rows starting `entry:` are words that
tell what kind of money entry it is (credit, paid, bought, expense...).

## For developers

```powershell
python scripts/translations.py export   # refresh the CSVs from the code
python scripts/translations.py import   # put translated CSVs back into the app
```

Import writes `frontend/src/lib/locales/<lang>.ts` and `backend/app/voice_words.json`, and refuses
any row that loses a `{placeholder}` (the old text stays). Then run the frontend and backend tests.
