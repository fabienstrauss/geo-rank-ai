# GeoRank AI

GeoRank AI is a self-hosted GEO tracker for monitoring brand visibility across LLMs.

## Run Locally For Development

```bash
docker compose -f docker-compose.dev.yml up --build
```

Frontend:
- `http://localhost:3000`

Backend:
- `http://localhost:8000`

## Run As A Self-Hosted MVP

1. Copy the environment template:

```bash
cp .env.example .env
```

2. Generate a Fernet key for `APP_ENCRYPTION_KEY`:

```bash
python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

3. Start the stack:

```bash
docker compose up -d --build
```

This starts:
- `frontend` on port `3000`
- `backend` on port `8000`
- `postgres` with a persistent Docker volume named `postgres_data`

## Persistence

Postgres data is stored in the Docker named volume `postgres_data`, mounted at `/var/lib/postgresql/data`.

That means:
- restarting containers keeps data
- recreating containers keeps data
- host reboots keep data
- `docker compose down` keeps data
- `docker compose down -v` removes the database volume and deletes the data

For a simple self-hosted MVP, this is the right default because users can clone the repo and run one command without bringing their own database.

## Secrets

Provider API keys are encrypted before they are stored in Postgres.

The encryption key is supplied through `APP_ENCRYPTION_KEY`.

For production:
- use a strong unique Fernet key
- do not commit `.env`
- ideally inject `APP_ENCRYPTION_KEY` through your hosting platform or secret manager

## Migrations

The backend runs:

```bash
alembic upgrade head
```

automatically before starting the API container.

## First-Time Data

The app currently uses dev seed data to populate the UI when the workspace is empty. That is useful for local evaluation, but real scraper ingestion should replace it for production use.
