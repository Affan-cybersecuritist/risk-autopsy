# Risk Autopsy - single-container deploy: builds the React frontend, then
# serves it FROM the FastAPI backend (backend/main.py's static-file mount),
# so one container is the whole app - no separate frontend host, no CORS
# to configure in production. Works on any Docker-capable free host
# (Render, Railway, Fly.io) without platform-specific config.

FROM node:20-slim AS frontend-build
WORKDIR /app/webapp
COPY webapp/package.json webapp/package-lock.json ./
RUN npm install
COPY webapp/ ./
RUN npm run build

FROM python:3.12-slim
WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./backend/
COPY src/ ./src/
COPY data/ ./data/
COPY docs/ ./docs/
COPY --from=frontend-build /app/webapp/dist ./webapp/dist

ENV PORT=8000
EXPOSE 8000
CMD ["sh", "-c", "uvicorn backend.main:app --host 0.0.0.0 --port ${PORT}"]
