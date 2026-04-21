# Stage 1: Build frontend
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install
COPY frontend/ ./
RUN chmod -R +x node_modules/.bin && npm run build

# Stage 2: Python runtime
FROM python:3.12-slim
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends gosu ca-certificates ffmpeg && rm -rf /var/lib/apt/lists/*
RUN groupadd -g 1000 appuser && useradd -u 1000 -g appuser -m appuser

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./backend/

# Fix permissions (Windows→Linux scp creates drwx------ dirs that appuser can't read)
RUN chmod -R a+rX /app/backend/

# Verify critical backend files exist (fail build early if missing)
RUN ls /app/backend/services/__init__.py && \
    ls /app/backend/services/assignment_generator.py && \
    echo "OK: backend/services/ verified"

ENV PYTHONPATH=/app
COPY --from=frontend-build /app/frontend/dist ./static/

# Copy entrypoint script
COPY entrypoint.sh .
RUN chmod +x entrypoint.sh

RUN mkdir -p /app/data && chown -R 1000:1000 /app/data

EXPOSE 8122

ENTRYPOINT ["./entrypoint.sh"]
