#!/bin/sh
set -eu

attempt=1
max_attempts=30

until alembic upgrade head; do
  if [ "$attempt" -ge "$max_attempts" ]; then
    echo "Database migrations failed after ${max_attempts} attempts."
    exit 1
  fi

  echo "Waiting for database to become ready (${attempt}/${max_attempts})..."
  attempt=$((attempt + 1))
  sleep 2
done

exec uvicorn main:app --host 0.0.0.0 --port 8000
