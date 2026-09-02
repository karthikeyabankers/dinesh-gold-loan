# Dinesh Gold Loan — FastAPI backend

Python/FastAPI replacement for the old Express `server.ts`. Same API
surface, same headers, so the React frontend in `../src` needs no changes.

Google Sheets access is handled **entirely server-side** by a service
account — nobody signs in with a Google account to use the app. Set that
up first (below), then everything else runs the same as before.

## 1. Create a Google service account (one-time setup)

1. Go to the [Google Cloud Console](https://console.cloud.google.com/) →
   create or pick a project.
2. Enable the **Google Sheets API** for that project (APIs & Services →
   Library → search "Google Sheets API" → Enable).
3. Go to **IAM & Admin → Service Accounts → Create Service Account**.
   Any name works, e.g. `dinesh-gold-loan-backend`. No special roles are
   needed at the project level.
4. Open the new service account → **Keys → Add Key → Create new key →
   JSON**. This downloads a `.json` file — treat it like a password,
   never commit it to git.
5. Open the target Google Sheet in your browser, click **Share**, and
   share it (Editor access) with the service account's email address —
   it looks like `dinesh-gold-loan-backend@your-project.iam.gserviceaccount.com`
   (also visible inside the downloaded JSON file as `client_email`).

## 2. Backend setup

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
```

Place the downloaded JSON key somewhere safe (e.g. `backend/service-account.json`,
which is already covered by `.gitignore`) and point `.env` at it:

```
GOOGLE_SERVICE_ACCOUNT_FILE=service-account.json
```

(Or, on platforms where you can only set environment variables, put the
whole JSON file's contents into `GOOGLE_SERVICE_ACCOUNT_JSON` instead and
leave `GOOGLE_SERVICE_ACCOUNT_FILE` blank.)

## Run (development)

```bash
uvicorn main:app --reload --port 8000
```

In another terminal, run the frontend as usual from the project root:

```bash
npm install
npm run dev
```

Vite's dev server proxies `/api/*` requests to `http://localhost:8000`
(see `vite.config.ts`), so the app behaves exactly like before.

## Run (production)

```bash
npm run build              # builds the static frontend into dist/
uvicorn main:app --host 0.0.0.0 --port 8000   # or gunicorn -k uvicorn.workers.UvicornWorker
```

Serve `dist/` with any static file host or reverse proxy (nginx, Caddy,
etc.) in front of the FastAPI service, forwarding `/api/*` to it.

## Configuration

All settings are environment variables — see `.env.example`. Notable ones:

- `SPREADSHEET_ID` — the Google Sheet used as the datastore
- `GOOGLE_SERVICE_ACCOUNT_FILE` / `GOOGLE_SERVICE_ACCOUNT_JSON` — service
  account credentials for server-side Sheets access (see step 1 above)
- `GEMINI_API_KEY` — optional, only used for the live regional gold rate lookup
- `ALLOWED_ORIGINS` — comma-separated list of origins allowed to call the API (CORS)
- `SEED_DEFAULT_USERS` — leave `false` unless you want the API to auto-create
  a first admin account (random password, printed once to the server log)
  when the `Users` sheet is empty

## Security notes

- Passwords in the `Users` sheet may be plaintext (legacy) or bcrypt
  hashes — both are accepted. To migrate a user, replace their password
  cell with the output of `security.hash_password("their password")`.
- Every value written back to the spreadsheet is sanitized against
  formula/CSV injection (a name like `=HYPERLINK(...)` is neutralized).
- Login attempts are rate-limited and temporarily locked out per
  username+IP after repeated failures (`LOGIN_MAX_ATTEMPTS` / `LOGIN_LOCKOUT_SECONDS`).
- Sessions are in-memory (like the original). If you ever run more than
  one backend process/worker, move `security.py`'s session store to
  something shared (e.g. Redis) — sticky sessions won't work across
  multiple workers otherwise.
- The service account JSON key is a credential with Editor access to
  your spreadsheet — keep it out of git (already in `.gitignore`) and
  out of any client-side/frontend code.
- The frontend's old "Backup to Google Drive" button relied on each
  signed-in user's personal Google Drive access. Since there's no more
  per-user Google sign-in, that one feature no longer works — everything
  else (login, records, submissions, approvals, live rates, admin stats)
  is unaffected, since it all goes through this backend.

