# One image serving the API and the built frontend from a single origin.
#
# Two stages so node is not in the runtime image: the build needs it, the
# server does not.

FROM node:22-slim AS web
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
# Baked in at build time, because Vite inlines it into the bundle - there is no
# reading this from the environment at runtime.
ARG VITE_GOOGLE_CLIENT_ID=""
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID
RUN npm run build

FROM python:3.12-slim
WORKDIR /app

COPY backend/pyproject.toml ./backend/
RUN pip install --no-cache-dir uv && \
    uv pip install --system --no-cache -r backend/pyproject.toml && \
    uv pip install --system --no-cache "psycopg[binary]"

COPY backend/ ./backend/
COPY --from=web /app/frontend/dist ./frontend/dist

WORKDIR /app/backend
ENV PYTHONUNBUFFERED=1
# Render and most hosts hand the port in as $PORT rather than letting the app
# choose one.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
