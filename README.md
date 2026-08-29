<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/d0f13539-4683-4b18-bfd0-cb8c0aaac408

## Run Locally

**Prerequisites:** Node.js and Python 3.10+

The backend is a Python/FastAPI service in [`backend/`](backend/README.md).
It connects to Google Sheets itself using a service account — nobody
needs to sign in with a Google account to use the app.

1. Set up a Google service account and share your spreadsheet with it —
   see [`backend/README.md`](backend/README.md) for the one-time steps.
2. Start the backend:
   ```bash
   cd backend
   python3 -m venv .venv && source .venv/bin/activate
   pip install -r requirements.txt
   cp .env.example .env   # set GOOGLE_SERVICE_ACCOUNT_FILE etc.
   uvicorn main:app --reload --port 8000
   ```
3. In a separate terminal, start the frontend:
   ```bash
   npm install
   npm run dev
   ```
4. Open the printed Vite URL (usually `http://localhost:5173`). API calls
   are proxied to the backend automatically — see `vite.config.ts`.

See [`backend/README.md`](backend/README.md) for backend configuration,
production deployment, and security notes.
