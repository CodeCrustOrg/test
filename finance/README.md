# Books

Bank ledger for CodeCrust (HDFC) and AITA Technologies (IndusInd), published as a private claude.ai artifact.

- `src/parser.js`: parses bank alert emails and statement exports (pure functions, shared by the page and the tests).
- `src/page.html`: the artifact page. It uses the claude.ai runtime for its database (`db`), Gmail (`mcp`), invoice uploads (`assets`) and CSV export (`downloads`).
- `build.js` inlines the parser into the page and writes `dist/books.html`, the file that gets published.

```
npm test        # parser tests (fixtures use the banks' wording with made-up values)
npm run build   # writes dist/books.html
```

## Data model (artifact database)

| Path | What |
|---|---|
| `accounts/{bank}-{last4}` | `entity`: `codecrust`, `aita`, `ignore`, or null (not yet assigned) |
| `txns/{id}` | One bank transaction. The id comes from the account, direction, amount and bank reference, so the same transaction from an alert and from a statement lands on one document. |
| `rules/{payeeKey}` | "Same for future" labels |
| `statements/{acct}_{from}_{to}` | Reconciliation results per imported statement |
| `meta/settings`, `meta/sync`, `meta/seen` | Start date and categories; last sync; Gmail message ids already read |

## Supported formats

- HDFC alerts: UPI debit, credit with sender details, and two older UPI wordings. The fallback parser still catches anything that says debited or credited along with an account number.
- IndusInd alerts: both the current and the older account alert wording, including the balance after each transaction (used for the gap check).
- Statements: Excel or CSV exports with a date column and a narration column, plus either separate withdrawal/deposit columns or one amount column with a Dr/Cr column. PDF statements aren't supported.
