#!/usr/bin/env bash
# Uso: deploy/deploy.sh usuario@host   (p. ej. ubuntu@api.studyinflow.app)
set -euo pipefail

HOST="${1:?Uso: $0 usuario@host}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

rsync -az --delete \
  --exclude '.git' --exclude '.env' --exclude '.env.*' --exclude 'node_modules' \
  --exclude 'storage' --exclude '.venv' --exclude '__pycache__' --exclude 'dist' \
  --exclude '*.db' --exclude '.claude' --exclude 'frontend' \
  "$ROOT/" "$HOST:/opt/studyai/"

ssh "$HOST" 'cd /opt/studyai && docker compose -f deploy/docker-compose.yml up -d --build'
