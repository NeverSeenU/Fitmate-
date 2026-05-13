# FitMate AI Deployment Checklist v0.1

## Scope

This checklist covers the current MVP stack:

- Expo React Native mobile app.
- FastAPI backend.
- PostgreSQL database.
- Redis for future rate limits/session state.
- Object storage for food photos.
- Xiaomi/Qwen AI provider credentials.
- App Store subscription validation credentials.
- Backend admin access.

## Environment Files

Use `.env.example` as the template. Real `.env` files must stay out of Git.

Minimum local backend variables:

```text
FITMATE_ENV=development
DATABASE_URL=postgresql+psycopg://fitmate:fitmate@localhost:5432/fitmate
REDIS_URL=redis://localhost:6379/0
OBJECT_STORAGE_BUCKET=fitmate-food-photos
XIAOMI_MODEL_NAME=mimo-v2-omni
XIAOMI_API_KEY=
XIAOMI_BASE_URL=https://api.xiaomimimo.com/v1
QWEN_MODEL_NAME=qwen3-vl-plus
DASHSCOPE_API_KEY=
DASHSCOPE_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
AUTH_SECRET_KEY=replace-with-local-secret
ADMIN_SECRET=replace-with-local-admin-secret
ACCESS_TOKEN_MINUTES=10080
```

Minimum mobile variables:

```text
EXPO_PUBLIC_API_BASE_URL=http://localhost:8000
EXPO_PUBLIC_APP_ENV=development
```

## Local Setup

1. Install Python 3.12+ and Node.js.
2. Install backend dependencies:

```powershell
python -m pip install -e ".\backend[dev]"
```

3. Start PostgreSQL and create the local database/user if missing:

```text
database: fitmate
user: fitmate
password: fitmate
host: localhost
port: 5432
```

4. Run migrations:

```powershell
cd backend
alembic upgrade head
```

5. Run backend tests:

```powershell
pytest
```

6. Start the backend API:

```powershell
cd backend
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

7. Install mobile dependencies and verify:

```powershell
npm install
npm run typecheck
npm test
```

8. Start Expo:

```powershell
npm run start
```

## Staging Setup

Staging should be internet reachable for real mobile testing.

Required services:

- PostgreSQL with automatic backups.
- Redis, even if initially low traffic.
- S3-compatible object storage bucket for food photos.
- HTTPS reverse proxy or managed load balancer.
- Backend process manager or container runtime.

Staging backend startup:

```powershell
cd backend
alembic upgrade head
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Staging mobile config:

```text
EXPO_PUBLIC_API_BASE_URL=https://staging-api.example.com
EXPO_PUBLIC_APP_ENV=staging
```

Staging smoke checks:

- `GET /healthz`
- `GET /v1/healthz`
- Register/login flow.
- Create chat thread.
- Upload food photo with provider override or configured AI provider.
- Verify admin metrics require `ADMIN_SECRET`.
- Verify object storage stores photos outside PostgreSQL.

## Production Setup

Production must use managed secrets and HTTPS only.

Required services:

- PostgreSQL with point-in-time restore.
- Redis with persistence policy documented.
- S3/R2/OSS-compatible object storage with lifecycle rules.
- Centralized logs for backend errors and provider failures.
- Monitoring for API latency, 5xx rate, provider fallback rate, and estimated AI cost.
- Admin secret rotation process.
- App Store subscription validation credentials.

Production backend startup:

```powershell
cd backend
alembic upgrade head
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Production mobile config:

```text
EXPO_PUBLIC_API_BASE_URL=https://api.example.com
EXPO_PUBLIC_APP_ENV=production
```

Production release gates:

- Full backend suite passes.
- Mobile `npm test` and `npm run typecheck` pass.
- Migration has been tested against staging data.
- Object storage write/delete smoke test passes.
- Provider credentials are present only in backend secret storage.
- Mobile bundle contains no AI provider keys.
- Admin metrics endpoint is protected and not publicly discoverable.

## Secret Ownership

AI provider keys:

- Owned by backend/runtime operations.
- Stored only in backend secret manager or local `.env`.
- Never stored in mobile app, Expo public variables, screenshots, or Git.

App Store credentials:

- Owned by release/subscription operations.
- Stored in backend secret manager.
- Private key files must not be committed.

Database credentials:

- Owned by backend/runtime operations.
- Rotated per environment.
- Production credentials must not be reused in staging or local development.

Redis credentials:

- Owned by backend/runtime operations.
- Production Redis must not be exposed publicly.

Object storage credentials:

- Owned by backend/runtime operations.
- Bucket policy should allow backend service access only.
- Use lifecycle policy for old food-photo cleanup after retention policy is defined.

Admin access:

- `ADMIN_SECRET` is backend-only.
- Rotate after any accidental exposure.
- Use separate values for local, staging, and production.

## Current Gaps

- Real object-storage provider adapter is not implemented yet; local fake exists behind the storage boundary.
- Real Xiaomi/Qwen HTTP provider adapters are implemented, but live provider smoke tests still require valid backend-only API keys.
- App Store receipt validation is still a contract placeholder.
- Redis is configured but not yet used for production rate limiting.
