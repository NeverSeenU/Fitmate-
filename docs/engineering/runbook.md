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

Start backend:

```powershell
cd backend
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
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

### Provider Keys Missing

If food-photo provider smoke fails with missing key errors, restart the backend with provider keys injected into the process environment. Do not write real keys into source files or docs.
