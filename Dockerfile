# Single-container build: the Vite frontend is built in stage 1, then
# copied into the FastAPI backend's "static" folder, which main.py
# serves automatically. One image, one process, one port - the whole
# app runs as a single Render/Railway/Fly web service, no separate
# frontend service or nginx needed.

# --- Stage 1: build the frontend ---------------------------------------
FROM node:20-slim AS frontend-build
WORKDIR /frontend

COPY package.json package-lock.json* ./
RUN npm install

COPY index.html vite.config.ts tsconfig.json ./
COPY src ./src
RUN npm run build

# --- Stage 2: backend + built frontend ----------------------------------
FROM python:3.12-slim

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ .
COPY --from=frontend-build /frontend/dist ./static

EXPOSE 8000

# Platforms like Render inject $PORT - fall back to 8000 for local `docker run`.
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
