# AGENTS.md — handoff notes for AI coding agents

Read this file first. It describes what Books is, how it is built, the rules the code relies on, and what is still open. For setup steps written for people, see `README.md`.

Last updated: 28 Oct 2026. Branch `claude/books-ledger` of `CodeCrustOrg/test`. Everything lives in `finance/`; the rest of the repo is an unrelated product-comparison site.

---

## 1. What this is

**Books** is a bookkeeping system for one owner with two Indian private companies:

| Entity key | Company | Bank account | Account id in data | Alert sender |
|---|---|---|---|---|
| `codecrust` | CodeCrust | HDFC, ending 1366 | `hdfc-1366` | `alerts@hdfcbank.bank.in` |
| `aita` | AITA Technologies Private Limited | IndusInd, ending 9477 | `indusind-9477` | `indusind_bank@indusind.com` |

**How these mappings were established:**
- HDFC 1366 is CodeCrust because HDFC's inward-remittance advice "for CODECRUST" names account `…62411366`.
- IndusInd 9477 is AITA because, on 15 Oct 2026, the same UPI reference appears as a debit on 9477 and as a credit on 1366 from "AITA TECHNOLOGIES PRIVATE LIMITED".

**Not tracked:**
- The owner's sister's IndusInd account ("Palak Garg"; statements arrive in the same mailbox).
- The owner's personal account ending 5282, on a different email.
- The credit cards: HDFC ••7049 and IndusInd ••5208.
- Federal Bank ••2790.

Any new account seen in alerts is created with `entity: null` and the owner is asked to assign it.

**What it does:**
1. Reads bank alert emails from Gmail.
2. Parses them mechanically into transactions.
3. Asks the owner, through Telegram and a local web dashboard, to label each transaction and attach its invoice.
4. Reconciles against monthly bank statements.
5. Exports an Excel/CSV/invoices ZIP for the chartered accountant (CA), with a GST purchase register.

**Owner's requirements, all of which shaped the design:**
- It must run **independently of Claude**: on the owner's own computer, with mechanical code first.
- **OpenRouter** is used only where an LLM is needed.
- Notifications go to the owner's **iPhone via Telegram**.
- Exports must be proper, for the CA, including GST invoice details.
- The owner asked to be told when something is unverified rather than have it guessed. Keep that standard: say what you tested and what you didn't.

---

## 2. Two editions (same UI)

| | Local app (the one in use) | claude.ai artifact (retired) |
|---|---|---|
| Entry | `local/server.js` (`npm start`) | `dist/books.html` from `npm run build`, published at https://claude.ai/artifact/HdTmATeNhyzctFPEG2Amgd |
| Storage | SQLite file `data/books.sqlite` | artifact `db` capability |
| Gmail | IMAP + Google app password (`local/gmail.js`) | claude.ai Gmail connector via `mcp` capability |
| Notifications | Telegram bot (long polling) | the claude.ai scheduled task "Books daily bank check" (`trig_017F9H7js4JoLvz96LxZuRVk`), now **disabled** at the owner's request |
| AI | OpenRouter (`local/llm.js`) | none |

The same `src/page.html` drives both.
- The page only ever talks to `window.claude.use('db' | 'mcp' | 'assets' | 'downloads')`.
- In the local app, `src/local-runtime.js` implements those interfaces against the local server's REST API and sets `window.BOOKS_LOCAL = true`.
- Local-only features (sync button calling `/api/sync`, PDF statements, the CA pack, reading invoices, AI suggestions) are gated on `window.BOOKS_LOCAL`.
- **Keep the page working in both modes** unless the owner says the artifact can go. It holds no data, so deleting it is safe if they ask.

---

## 3. Layout

```
finance/
  AGENTS.md            this file
  README.md            human setup/usage guide
  .env.example         every setting (real values go in .env, gitignored)
  package.json         Node >= 22.13, CommonJS; deps: imapflow 2.3.0, pdfjs-dist 4.10.38 (exact pins)
  build.js             inlines src/parser.js + src/gst.js into page.html -> dist/books.html (artifact edition)
  src/
    parser.js          UMD. Alert parsing, statement parsing/matching, dates, money, invoice search queries
    gst.js             UMD. GSTIN check digit, state codes, invoice checks (tax maths, CGST/SGST vs IGST, payment match)
    page.html          the whole dashboard UI (vanilla JS, no framework). Placeholder /*@@PARSER@@*/ gets parser+gst
    local-runtime.js   browser shim: window.claude.use(...) over the local REST API + SSE
  local/
    server.js          http server (REST + SSE + static page), schedules (sync, daily digest), Telegram poll loop
    config.js          loads .env via process.loadEnvFile
    store.js           document store on node:sqlite (paths "collection/id", deep-merge update, change events)
    ledger.js          ledger rules: ingest/dedupe, payee rules, inter-company pairing, label(), counts, totals
    sync.js            one Gmail sync: fetch -> parse (AI fallback) -> ingest -> AI category suggestions
    gmail.js           IMAP (read-only lock on All Mail); X-GM-RAW search; part download; attachments by Gmail id
    telegram.js        Bot API client (getUpdates long polling, send/edit, answerCallbackQuery, getFile, sendDocument)
    bot.js             bot behaviour: messages, inline keyboards, replies (files = invoices, text = notes), /commands, digest
    llm.js             OpenRouter client + 5 jobs, each with strict JSON schema; daily call cap; redaction
    pdf.js             pdf.js text extraction (password ok), AI rows, mechanical balance-chain check
    invoices.js        read invoice details (AI) + checks; fetch email attachments for linked invoices
    export.js          CA pack: per-company workbook + CSV + renamed invoice files, zipped; FY period presets
    xlsx.js            dependency-free ZIP and XLSX writers (inline strings, ₹ and date formats, frozen header, autofilter)
    files.js           invoice file storage in data/files/<32-hex id>.<ext>; metadata in store files/<id>
    setup.js           interactive wizard (tests Gmail, captures Telegram chat id, tests OpenRouter), writes .env (0600)
    service.js         start-at-login installer: macOS LaunchAgent / Windows schtasks / Linux systemd user unit
  test/
    parser.test.js     11 tests: alert formats, ids, balance gaps, dates, statement detect/parse/match, invoice queries
    local.test.js      13 tests: store, ledger, AI validation, redaction, PDF chain, Telegram flow, GST, periods,
                       invoice reading from a real generated PDF, CA pack contents, /export
```

Not in git: `.env` (secrets), `data/` (ledger + invoice files), `node_modules/`, `dist/`.

---

## 4. Data model (document store)

The paths are the same in SQLite (local) and in the artifact database. Money is always an **integer number of paise** (`paise`), except inside `gst`, which uses rupees as on the invoice. Dates are `YYYY-MM-DD` in India time.

| Path | Body |
|---|---|
| `accounts/{bank}-{last4}` | `{id, bank: 'hdfc'|'indusind'|'other', last4, entity: 'codecrust'|'aita'|'ignore'|null, firstSeen}` |
| `txns/{id}` | One bank transaction; fields below |
| `rules/{payeeKey}` | `{id, key, label, dir, kind, cat, created}`. Created by "Same for future"; auto-labels later txns from that payee. |
| `statements/{acct}_{from}_{to}` | `{acct, from, to, rows, matched, added, missing, opening, closing, balanced, inPaise, outPaise, file, importedAt}` (paise) |
| `files/{id}` | `{id, name, type, size, created}` (local only) |
| `meta/settings` | `{since, catsOut[], catsIn[], companies: {codecrust: {legalName, gstin}, aita: {...}}, ackGaps[]}` |
| `meta/sync` | `{lastRun, lastMailMs, lastFound, lastNew, aiRead, unreadable, suggested}` |
| `meta/seen` | `{ids[]}`: Gmail message ids already read, last 4000 |
| `meta/digest`, `meta/telegram` | last digest day; Telegram `getUpdates` offset |
| `tg/{message_id}` | Telegram message context: `{txn}`, `{acct}` (assign-account prompt), `{export: {preset}}`, plus `cands[]` for invoice candidates |
| `llm/{YYYY-MM-DD}` | `{calls}`: daily OpenRouter counter |

**`txns/{id}` fields:**

| Group | Fields |
|---|---|
| Identity and amount | `id, acct, bank, last4, dir: 'in'|'out', paise, date, ts` |
| Bank details | `mode: 'UPI'|'NEFT'|'RTGS'|'IMPS'|null, ref, party, vpa, narr` |
| Balance | `balPaise` (from IndusInd alerts), `stmtBal`, `stmtNarr` |
| Parsing and source | `parser` (which parser read it, or `'llm'`, or `'statement'`), `review` (set when the AI parsed it), `mails[] {id, url, subject}`, `src {alert, stmt}` |
| Labelling | `kind: 'business'|'intercompany'|'transfer'|'personal'|null`, `cat`, `note`, `status: 'todo'|'done'`, `auto` (set by a rule), `suggest {kind, cat, why}` (AI), `pairId` |
| Invoice | `inv {state: 'missing'|'attached'|'not_needed', items[]}`. An item is `{type: 'gmail', id, url, subject, from, date, fetched?}` or `{type: 'file', id, name, fromEmail?}`. |
| GST | `gst {vendor, gstin, invNo, invDate, taxable, cgst, sgst, igst, total, currency, file, source: 'ai'|'manual', flags[], at}` |
| Reconciliation | `recon: null|'matched'|'stmt_only'|'missing_in_stmt'` |
| Timestamps | `created, updated` |

**Transaction id** (`P.txnId`): `{bank}-{last4}-{dir}-{paise}-{ref}`, or `…-{date}-{hash(narration)}` when there is no reference. This is what dedupes:
- IndusInd's two alert formats for one credit
- an alert and the matching statement row

**Do not change the id scheme** without a migration.

**Payee key** (`P.partyKey`): `vpa:<vpa without leading *>` when the VPA has at least 3 characters before the `@`, otherwise `name:<normalised party>`.

---

## 5. Rules the code relies on (invariants)

1. **No figure in the books comes from an LLM unchecked.** Every AI output is either a suggestion the owner confirms, or is validated mechanically:
   - **Alert read by AI:** the amount and the last 4 digits must literally appear in the email. The transaction is tagged `review`.
   - **PDF statement rows:** each row's balance must equal the previous balance plus or minus the amount (`pdf.chainBreaks`). Breaks are shown before reconciling.
   - **Invoice details:** GSTIN check digit; the GSTIN must appear in the PDF text; taxable value + GST = total (±₹1); CGST equals SGST; IGST vs CGST/SGST by comparing the vendor's and the company's state codes; invoice total vs amount paid (±₹1). Failures go to `gst.flags`, or are computed by `G.checkInvoice`, and appear on the export's "To check" sheet.
   - **Category suggestions:** must be one of the configured categories (strict JSON schema enum), and are only ever *suggested*.
2. **Privacy limits on what goes to OpenRouter.**
   - Category suggestion: payee name, direction, amount and the category list only. A test asserts that no account numbers or references are sent.
   - Other jobs: text passes through `redact()`, which removes URLs, 14+ digit account and card numbers (masked to the last 4), and personal email addresses. 12-digit UPI references are kept on purpose.
   - `LLM_PDF=0` disables sending statement text.
   - `LLM_DAILY_LIMIT` caps calls per day.
3. **Gmail is read-only.** The mailbox is opened with a read-only lock; nothing is flagged, moved or sent.
4. **Telegram only obeys `TELEGRAM_CHAT_ID`.** Updates from any other chat are ignored (tested).
5. **Own transfers never count as income or expense.** Inter-company transfers count per company but are excluded when both companies are shown together. Same reference, opposite direction, different tracked accounts → paired: `intercompany` across the two companies, `transfer` within one.
6. **Statements are the source of truth**, because alerts miss charges, cheques and some NEFTs. Reconciling marks rows `matched`, creates `stmt_only` txns, and flags alerts not on the statement as `missing_in_stmt`. Matching: same direction and amount; a reference match wins, otherwise the nearest date within 3 days; each txn is used once.
7. **IndusInd balance gaps:** consecutive alert balances must chain (`P.balanceGaps`). A gap means a transaction had no alert.
8. **Dependency policy:**
   - Pin exact versions released at least 2 weeks earlier.
   - Run `npm audit` and avoid new dependencies when Node built-ins suffice. The XLSX/ZIP writer, the SQLite store and the HTTP server are all built-in or hand-written for this reason.
   - `mailparser` was removed because it pulled in a vulnerable `nodemailer`; `gmail.js` decodes MIME parts with imapflow instead.
   - The browser loads SheetJS `xlsx@0.18.5` from cdnjs, on demand, only to read statement spreadsheets.
9. **Money:**
   - Store paise as integers. Parse money only with `P.toPaise` (it handles commas, ₹, Rs, INR).
   - Format with `P.fmtINR` (Indian grouping).
   - Financial year is April–March (`fyOf`, `export.period`).

---

## 6. Main flows

**Sync** (`local/sync.js`, every `SYNC_MINUTES`, default 15, plus `/api/sync` and Telegram `/sync`):
1. `since` is `meta/settings.since` (default `2026-04-01`) on a first or full run, otherwise the last mail date minus 3 days.
2. `gmail.fetchAlerts` runs an X-GM-RAW `from:(alerts@hdfcbank.bank.in OR alerts@hdfcbank.net OR indusind_bank@indusind.com) after:YYYY/MM/DD` and skips ids in `meta/seen`.
3. `P.parseAlert`. If that fails and the email looks like a transaction, `llm.parseAlert`.
4. `ledger.ingest`: creates accounts, applies payee rules, merges duplicates, then `pairInterCompany`.
5. `llm.suggestCategory` for new `todo` txns.
6. `bot.notifySync`: one Telegram message per new txn (at most 15, about 1.1 s apart), plus "whose account?" prompts.

**Telegram** (`local/bot.js`):
- **Message:** amount, company, payee, account, date, reference, AI suggestion.
- **Buttons:** `s` accept suggestion; `k|<kind>` choose type; `c|<idx>` choose category; `b` back; `f` find invoice in email (Gmail search, then AI ranking); `a|<i>` attach candidate (saves its PDF/image too, then auto-reads GST); `x` none of these; `n` invoice not needed; `e|<entity>` assign account; `p|<preset>`, `q|<entity>` export.
- **Replies:** a photo or document → invoice file (then auto-read GST); text → note.
- **Commands:** `/todo`, `/summary`, `/sync`, `/export`, `/help`.
- **Daily digest** at `DIGEST_TIME` (India time): yesterday's activity plus the waiting counts. On the 2nd–7th it adds a reminder to import last month's statements.

**Dashboard tabs** (`src/page.html`):
- Dashboard: KPIs, balances, cash-flow chart, categories, balance trend, per-company split, top payees and payers, statement coverage grid, latest transactions.
- To do: label queue, missing invoices, not on statement, balance gaps.
- Ledger: filter, edit, CSV export.
- Statements: XLS/XLSX/CSV import with column mapping; PDF in the local app.
- Export: the CA pack.
- Setup: companies and GSTINs, accounts, start date, payee rules, categories.

**CA pack** (`local/export.js`, `GET /api/export?entity=all|codecrust|aita&preset=last-month|last-quarter|this-quarter|this-fy|last-fy` or `&from=&to=`; add `&send=telegram` to send it to Telegram). The ZIP holds `README.txt` and, per company, `<Company> books <from> to <to>.xlsx`, `Bank book … .csv` (UTF-8 BOM) and `Invoices/<date>_<vendor>_<amount>.<ext>`. The workbook's sheets are Summary, Bank book, Expenses (purchase register with GST), Income, Inter-company & personal, and To check.

**REST API** (`local/server.js`):

| Endpoint | Purpose |
|---|---|
| `GET /` | the dashboard page |
| `GET /api/events` | SSE `{path, collection}` change events |
| `GET /api/db/list?collection&orderBy&dir&limit&where` | list documents |
| `GET/PUT/PATCH/DELETE /api/db/doc?path` | read/write one document |
| `POST /api/sync[?full=1]` | run a sync now |
| `POST /api/gmail/search {query, pageSize, txnId?}` | invoice search, shaped like the Gmail connector's `search_threads` |
| `POST /api/files` | upload a file (raw body, `X-Filename`) |
| `GET /_blob/{id}` | download a stored file |
| `POST /api/statement/pdf` | read a PDF statement (raw body, `X-Password`) |
| `POST /api/invoice/read {txnId}` | AI-read invoice details |
| `POST /api/invoice/fetch {txnId, id}` | save a linked email's attachments |
| `GET /api/export` | the CA pack |

**Access:**
- The server binds to `127.0.0.1` unless `LAN_ACCESS=1`.
- Non-localhost requests need `?token=ACCESS_TOKEN` once, which sets an HttpOnly cookie; the comparison is constant-time.
- It is plain HTTP on the LAN, so it is meant for home Wi-Fi.

---

## 7. Alert formats handled

Exact wording is in the test fixtures; values there are made up.
- **HDFC UPI debit:** "Rs.410.00 is debited from your account ending 1366 towards VPA …(Name) on 26-10-26. UPI transaction reference no.: …"
- **HDFC credit:** "Rs.5000.00 has been successfully credited to your HDFC Bank account ending in 1366. Transaction Details: a. Date: … b. Sender: NAME (VPA: …) c. UPI Reference No.: …"
- **HDFC older v1 debit/credit wordings:** "has been debited from account **1366 to VPA …", "is successfully credited to your account **1366 by VPA …".
- **IndusInd (current):** "Your IndusInd Bank Account No. 20XXXXXX9477 has been Debited|Credited for INR 5,000.00 towards UPI/<ref>/DR/<name4>/<bank>/<vpa> . The balance available in your Account is INR 59,560.88."
- **IndusInd (older):** "Your IndusInd Account XXXXXXXX9477 has been credited for INR … towards N/<UTR>/<IFSC>/<NAME>. Call …"
- **Generic fallback:** Rs/INR amount near "debited/credited" near an account number. Marked `parser: 'generic'`.

**Gmail quirks:**
- The text body of IndusInd emails can be empty; `FULL_CONTENT`/HTML holds the text, and the parser combines body, HTML-to-text and snippet.
- HDFC monthly "SmartStatement" emails contain only a link, no PDF.
- IndusInd e-statements are password-protected PDF attachments. The password is the first 4 letters of the name in capitals plus the date of birth or incorporation as DDMM, or the customer ID.
- HDFC foreign inward-remittance advices come from `Inward.Remittances@hdfcbank.bank.in`. For export income, `P.invoiceQuery` searches for them.

---

## 8. Commands and testing

```
cd finance && npm install
npm test               # 24 tests, all faked I/O, ~2 s
npm run build          # dist/books.html (artifact edition)
npm start              # local server, http://localhost:8787
npm run setup          # interactive; needs real credentials
```

**Tested in the development sandbox:**
- All unit tests.
- An end-to-end run of the real `createApp` server with fake Gmail and OpenRouter, driven in Chromium/Playwright: sync, AI suggestions, labelling, invoice search and attach, upload, GST field validation, PDF statement read and reconcile, export ZIP, phone width with no horizontal overflow.
- Real PDFs generated and parsed with pdf.js.
- The XLSX output opened in LibreOffice and checked visually.
- The GSTIN algorithm checked against four published sample GSTINs.

**NOT yet verified against real services** (the sandbox had no network access to them):
- IMAP login to Gmail with an app password; searching by `gmraw` and `emailId` on real Gmail.
- The real Telegram Bot API, including `sendDocument` multipart.
- Real OpenRouter calls: the model choice, strict `json_schema` support, and image input for invoice photos.
- Real HDFC or IndusInd PDF statements and real GST invoices.
- `service.js` on macOS or Windows.
- Microsoft Excel itself (only LibreOffice was used).

When the owner first runs it, expect fixes in exactly these areas.

---

## 9. Open items and likely next steps

- **First real run with the owner.** Watch `data/books.log` (when run as a service) or the console. Likely trouble spots: IMAP mailbox name or locale, OpenRouter model `response_format` support, Telegram rate limits on a large first backfill. About 200 or more transactions since April arrive as individual messages, capped at 15 per sync; the rest are reached with `/todo`.
- **Company GSTINs** are not set yet; the owner enters them under Setup → Companies.
- **Ask the CA** whether they want a Tally XML import format. It isn't built.
- **Personal account 5282** lives on a different Gmail. Supporting it means a second IMAP account in `config` and `gmail` (not built).
- **Statement passwords** are typed in each time, never stored.
- **Possible improvements:**
  - Batch first-sync notifications into a digest.
  - TDS fields on payments.
  - Sales invoices for domestic GST output.
  - A warning if the computer has been asleep for a long time.
- **Repository:** the code sits beside an unrelated site in `CodeCrustOrg/test`, and no pull request has been opened. The owner may want it moved to its own repository.

---

## 10. Conventions for changes

- Plain CommonJS on Node 22, no TypeScript, no build step for the server. The page is one HTML file with inline CSS/JS; keep it framework-free.
- `src/parser.js` and `src/gst.js` must stay **pure and UMD**, because they run in both the browser and Node. Add a test with the bank's exact wording (and made-up values) for any new alert format.
- Write to the store only through `store.set/update/delete`, or the runtime shim in the page; the SSE change events depend on it.
- Never commit `.env`, `data/`, real transactions, account numbers beyond last 4, or passwords. Test fixtures must use made-up values.
- Commit messages end with the repo's attribution trailer. Push to `claude/books-ledger`; don't commit to `main` without the owner asking.
- User-facing copy is plain and direct: name things by what the owner recognises ("invoice", "statement", "CA"), not internals.
