# Books

Bank ledger for **CodeCrust** (HDFC ••1366) and **AITA Technologies** (IndusInd ••9477).

It reads your bank alert emails, adds every transaction to a ledger, and asks you (on Telegram or in the dashboard) what each one is and where its invoice is. It also reconciles against the monthly statements. It runs on your own computer; no Claude account is involved. OpenRouter is used only for the four jobs listed under "AI".

## What you need

- A computer that stays on during the day (Mac, Windows or Linux) with **Node.js 22.13 or newer** (https://nodejs.org).
- Your Gmail account with **2-Step Verification** on, so you can create an **app password**.
- **Telegram** on your iPhone.
- Optional: an **OpenRouter** API key (https://openrouter.ai/keys), with a credit limit set on the key.

## Set up (once)

```
cd finance
npm install
npm run setup            # asks for Gmail, Telegram, OpenRouter; tests each one
npm start                # runs Books; open http://localhost:8787
npm run install-service  # optional: start Books automatically when you log in
```

During `npm run setup` you will:
1. **Gmail:** paste an app password from https://myaccount.google.com/apppasswords. Books opens your mailbox read-only over IMAP and only searches for HDFC and IndusInd alert emails (plus invoice searches you ask for).
2. **Telegram:** create a bot with @BotFather (`/newbot`), paste its token, then send `/start` to your new bot from your iPhone. Books then only listens to that one chat.
3. **OpenRouter:** paste a key and choose a model that supports structured outputs. Leave it empty to run without AI.
4. **Dashboard access:** choose whether your iPhone on the same Wi-Fi may open the dashboard. If yes, you get a private link with a token. Open it in Safari, then Share → Add to Home Screen.

## Daily use

- **Telegram** gets a message for every new CodeCrust or AITA transaction:
  - Tap **Business expense / Inter-company / Own transfer / Personal**, then the category.
  - If there's an AI suggestion, tap **✓** to accept it.
  - Reply to the message with a **photo or PDF** to attach the bill, or tap **Find in email** to search your inbox for it.
  - Reply with **text** to add a note.
- Commands: `/todo` shows what's waiting, `/summary` shows this month per company, `/sync` checks Gmail now.
- Every morning (09:00 by default) you get yesterday's summary. On the 2nd–7th of each month it also reminds you to import last month's statements.
- The **dashboard** (http://localhost:8787) shows totals, bank balances, cash flow, spending by category, the ledger, statement import, and CSV export for your CA.

Books checks Gmail every 15 minutes while the computer is awake. Alerts that arrive while it's off are picked up at the next check.

## Statements

Download the monthly statement from net banking and import it under **Statements**:
- **Excel (.xls/.xlsx) or CSV** is read mechanically; you can adjust the columns.
- **PDF** (password-protected is fine) is read by the AI. Every row is then checked mechanically: each balance must equal the previous balance plus or minus that row. Rows that don't add up are flagged before you reconcile.

Reconciling matches each statement row to an alert, adds rows that had no alert (bank charges, cheques, some NEFTs), and flags alerts that never appear on the statement.

## AI (OpenRouter) — what it does and what it sees

| Job | Sent to the model | Checked by |
|---|---|---|
| Suggest a category for a new payee | Payee name, in/out, amount, your category list | You accept or change it |
| Read an alert email the fixed parser doesn't recognise | The email text, with links, long account numbers and email addresses removed | Amount and account digits must appear in the email; marked "Read by AI" for review |
| Read a PDF statement | The statement text | Balance chain check on every row |
| Rank invoice emails for a payment | Payee, amount, date; candidate subjects, senders, short snippets | You pick which one to attach |

`LLM_DAILY_LIMIT` caps calls per day (default 200). `LLM_PDF=0` stops statement text from being sent.

## Where your data is

- `finance/data/books.sqlite`: the ledger. Back this file up.
- `finance/data/files/`: invoice files.
- `finance/.env`: passwords and keys (readable only by your user). Never commit it; it is in `.gitignore`.

Telegram receives the messages it shows you (amounts, payee names). OpenRouter receives only what the table above lists.

## Code

| Path | What |
|---|---|
| `src/parser.js` | Alert and statement parsing (pure functions, tested) |
| `src/page.html` | The dashboard UI |
| `src/local-runtime.js` | Connects the dashboard to the local server |
| `local/server.js` | Web server, schedule, Telegram polling |
| `local/store.js` | Document store on SQLite (Node's built-in `node:sqlite`) |
| `local/ledger.js` | Ledger rules: dedupe, payee rules, inter-company pairing |
| `local/gmail.js` | Gmail over IMAP (read-only) |
| `local/telegram.js`, `local/bot.js` | Telegram client and bot behaviour |
| `local/llm.js`, `local/pdf.js` | OpenRouter jobs and PDF statements |
| `local/setup.js`, `local/service.js` | Setup wizard and start-at-login installer |

```
npm test        # parser, store, ledger, AI checks, PDF checks, Telegram flow (all faked, made-up data)
npm run build   # writes dist/books.html (the claude.ai version of the page)
```
