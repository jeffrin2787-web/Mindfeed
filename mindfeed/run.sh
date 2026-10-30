#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env from .env.example. Review SECRET_KEY and DATABASE_URL before deployment."
fi
python -m uvicorn backend.app:app --host 0.0.0.0 --port 8000 --reload
