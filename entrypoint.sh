#!/bin/bash
set -e

DATA_DIR="/app/data"
mkdir -p "$DATA_DIR/uploads"
chown -R 1000:1000 "$DATA_DIR" 2>/dev/null || true

echo "Starting DinoQuest as appuser (UID 1000) on port 8122 with ${WORKERS:-2} workers..."
cd /app
exec gosu appuser uvicorn backend.main:app --host 0.0.0.0 --port 8122 --workers ${WORKERS:-2} --proxy-headers --forwarded-allow-ips="*"
