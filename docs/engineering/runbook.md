# FitMate AI Runbook

## Canonical Project Root

```powershell
cd C:\Users\jiang\Projects\fitmate-ai
```

Run all commands from this root unless a step explicitly says to enter `backend/`.

## Install

Mobile dependencies:

```powershell
npm.cmd install
```

Backend development package:

```powershell
python -m pip install -e ".\backend[dev]"
```

## Mobile Checks

TypeScript:

```powershell
npm.cmd run typecheck
```

Mobile logic tests:

```powershell
npm.cmd test
```

Mobile workflow smoke with structured logs:

```powershell
npm.cmd run smoke:mobile
```

Expo dev server:

```powershell
npm.cmd run start
```

Expo iOS export check:

```powershell
npx.cmd expo export --platform ios
```

## Backend Checks

Run all backend tests from the project root:

```powershell
python -m pytest backend\tests
```

Focused backend smoke:

```powershell
python -m pytest backend\tests\test_health.py
python -m pytest backend\tests\test_food_flow.py backend\tests\test_records.py
```

Alembic SQL rendering:

```powershell
cd backend
alembic upgrade head --sql
```

GitHub CI runs the same backend and mobile quality gates on pushes and pull requests to `main`:

- `npm ci`
- `npm run typecheck`
- `npm test`
- `python -m pip install -e "backend[dev]"`
- `python -m pytest backend/tests`
- `python -m alembic upgrade head --sql`

Start backend:

```powershell
cd backend
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

For Expo Go on a physical phone, bind the backend to all local interfaces so the phone can reach the machine LAN IP:

```powershell
cd backend
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## Backend Environment

Use `.env.example` as the template. Do not commit real `.env` files.

Important local variables:

```text
DATABASE_URL=postgresql+psycopg://fitmate:fitmate@localhost:5432/fitmate
FITMATE_ENV=local
EXPO_PUBLIC_API_BASE_URL=http://localhost:8000
EXPO_PUBLIC_USE_MOCK_API=true
```

For real provider smoke tests, inject Xiaomi/Qwen keys into the backend process environment only.
Set `FILE_AI_EXTRACTION_ENABLED=true` when you explicitly want uploaded files to use the AI structured-extraction router; leave it unset for deterministic fixture/smoke testing.
Set `WORKOUT_AI_ANALYSIS_ENABLED=true` when you explicitly want workout text logs to use the AI structured-analysis router; leave it unset for deterministic fixture/smoke testing.
Set `TEXT_FOOD_AI_ANALYSIS_ENABLED=true` when you explicitly want text food chat messages to use the AI structured-analysis router; leave it unset for deterministic fixture/smoke testing.
For the strict file-provider pass, run `npm.cmd run smoke:file-insight-ai`; the smoke will fail unless body-report, menu, and workout-plan uploads include provider/model metadata, top-level confidence, per-field confidence, and per-field source text.

Production runtime rules:

- `AUTH_SECRET_KEY` and `ADMIN_SECRET` must be real strong secrets, not local defaults.
- Production startup fails if either secret is shorter than 32 characters.
- Production startup requires `OBJECT_STORAGE_DRIVER=s3` and a non-empty `OBJECT_STORAGE_BUCKET`.
- S3-compatible storage reads `OBJECT_STORAGE_ENDPOINT`, `OBJECT_STORAGE_REGION`, `OBJECT_STORAGE_ACCESS_KEY_ID`, `OBJECT_STORAGE_SECRET_ACCESS_KEY`, and `OBJECT_STORAGE_KEY_PREFIX`.
- Password reset request responses include `debug_reset_token` only in `development`, `local`, or `test`.

## GitHub Backup

Remote:

```text
origin https://github.com/NeverSeenU/Fitmate-.git
```

Manual backup:

```powershell
git status --short
git add -A
git commit -m "Daily backup YYYY-MM-DD"
git push
```

Before committing, check that generated files and secrets are ignored:

```powershell
git status --short --ignored
```

Never commit:

- `.env`
- `.env.*`
- `node_modules/`
- `.test-build/`
- `dist-ios*/`
- `.runtime-logs/`
- `docs/work-records/*.jsonl`

## Troubleshooting

### GitHub Rejects Push For Large Files

Cause: a file larger than 100 MB was committed.

Fix:

```powershell
git rm --cached path\to\large-file
git add .gitignore
git commit --amend --no-edit
git push
```

Only use history-rewrite commands after confirming the branch has not been shared or after coordinating with the main conversation.

### Backend Tests Risk Real Data

Backend tests truncate application tables before each test. The test fixture now refuses cleanup unless:

- `FITMATE_ENV` is `local` or `test`
- `DATABASE_URL` points to localhost
- the database user is `fitmate`
- the database name is one of the approved local FitMate database names

Do not bypass this guard for staging or production databases.

### Expo Cannot Reach Backend On Device

Use the machine LAN IP in `EXPO_PUBLIC_API_BASE_URL`, not `localhost`, when testing from a physical phone.
Also make sure the backend was started with `--host 0.0.0.0`; binding only to `127.0.0.1` will make the phone login fail with a network timeout.

### Provider Keys Missing

If food-photo provider smoke fails with missing key errors, restart the backend with provider keys injected into the process environment. Do not write real keys into source files or docs.
