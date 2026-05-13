# Task Plan: FitMate AI Productionization

## Status: COMPLETE
## Total Tasks: 8
## Completed: 8 / 8

### Task 11: Verify PostgreSQL Runtime And Migration - DONE
- **Files:** `backend/alembic.ini`, `backend/migrations/*`, `backend/app/db/session.py`
- **Preconditions:** Local PostgreSQL or Docker is available.
- **Steps:**
  1. Start a local PostgreSQL database.
  2. Set `DATABASE_URL`.
  3. Run `alembic upgrade head`.
  4. Run model and health tests against the migrated schema.
- **Done when:** migration applies cleanly and schema-backed smoke tests pass.
- **Verification:** PostgreSQL 18 service `postgresql-x64-18` is running on `localhost:5432`; database `fitmate` and user `fitmate` were created; `alembic upgrade head` completed; table inspection returned 14 public tables; full backend suite passed with 42 tests.
- **Complexity:** medium

### Task 12: Add Repository Interfaces - DONE
- **Files:** `backend/app/repositories/*`, `backend/app/services/*`
- **Preconditions:** Task 10
- **Steps:**
  1. Define repository protocols for users, profiles, subscriptions, chat, records, safety, and model calls.
  2. Keep current in-memory stores as test implementations.
  3. Make services depend on repository boundaries instead of concrete stores.
- **Done when:** existing 42 backend tests pass unchanged.
- **Verification:** Added repository protocol contracts under `backend/app/repositories/`; existing in-memory stores satisfy the protocols; full backend suite passed with 43 tests using the real local `DATABASE_URL`.
- **Complexity:** medium

### Task 13: Implement Database Repositories - DONE
- **Files:** `backend/app/repositories/sqlalchemy/*`, `backend/tests/test_db_repositories.py`
- **Preconditions:** Tasks 11, 12
- **Steps:**
  1. Implement SQLAlchemy repositories for auth/profile/subscription/chat.
  2. Implement SQLAlchemy repositories for food/workout/check-ins/safety/model calls.
  3. Add transaction-scoped test fixtures.
- **Done when:** DB repository tests pass against PostgreSQL.
- **Verification:** Added SQLAlchemy repositories for auth, profile, subscription, chat, food logs, workout logs, check-ins, safety events, and model-call usage metrics; `tests/test_db_repositories.py` passed with 7 database-backed tests; full backend suite passed with 50 tests against local PostgreSQL.
- **Complexity:** large

### Task 14: Wire Services To Database In Runtime - DONE
- **Files:** `backend/app/api/deps.py`, `backend/app/main.py`, `backend/app/services/*`
- **Preconditions:** Task 13
- **Steps:**
  1. Add request-scoped database session dependency.
  2. Wire runtime services to database repositories.
  3. Preserve in-memory repositories for contract/unit tests.
- **Done when:** full backend suite passes with database integration tests enabled.
- **Verification:** Runtime API dependencies now create request-scoped SQLAlchemy-backed services for auth, profile, subscription, chat, food, workout, records, safety, and admin metrics; `get_db` commits successful requests and rolls back failures; full backend suite passed with 50 tests against local PostgreSQL.
- **Complexity:** medium

### Task 15: Add Object Storage Boundary - DONE
- **Files:** `backend/app/storage/*`, `backend/app/services/food_service.py`, `backend/tests/test_storage.py`
- **Preconditions:** Task 8
- **Steps:**
  1. Add object-storage client interface.
  2. Add local/dev fake storage implementation.
  3. Store food photos through the storage boundary and keep only object keys in logs.
  4. Wire photo deletion placeholder to storage deletion.
- **Done when:** photo upload/delete tests pass without storing raw image bytes in PostgreSQL.
- **Verification:** Added `backend/app/storage` object-storage protocol and local fake; food-photo analysis now stores bytes through the storage boundary while chat messages and food logs keep only object keys; privacy photo deletion calls the storage delete boundary; full backend suite passed with 53 tests.
- **Complexity:** medium

### Task 16: Add Mobile API Client Layer - DONE
- **Files:** `src/services/apiClient.ts`, `src/services/*.ts`, `src/config/env.ts`, `src/tests/*`
- **Preconditions:** Backend contract Tasks 1-10
- **Steps:**
  1. Add typed API client with auth header handling.
  2. Connect auth, profile, subscription, chat, food photo, records, workout, safety, and privacy service contracts to HTTP calls.
  3. Keep local mock fallback for prototype mode.
- **Done when:** TypeScript tests and typecheck pass.
- **Verification:** Added typed mobile backend API client with bearer-token handling, JSON requests, React Native photo upload FormData conversion, endpoint wrappers for auth/profile/subscription/chat/food/records/workouts/safety/privacy, and `createFitMateServices` mock fallback; `npm.cmd test` and `npm.cmd run typecheck` passed.
- **Complexity:** medium

### Task 17: Add Provider Call Logging - DONE
- **Files:** `backend/app/ai/*`, `backend/app/services/admin_service.py`, `backend/tests/test_ai_router.py`
- **Preconditions:** Task 13
- **Steps:**
  1. Log Xiaomi and Qwen calls with provider, model, purpose, status, latency, and estimated cost.
  2. Record fallback usage.
  3. Feed admin metrics from persisted model calls.
- **Done when:** admin metrics reflect model calls and fallback rate.
- **Verification:** Food vision router now records every Xiaomi/Qwen provider attempt through the model-call repository with provider, model, purpose, status, latency, estimated cost, and error code; fallback calls use purpose `fallback`, which feeds existing admin fallback-rate metrics; full backend suite passed with 53 tests.
- **Complexity:** medium

### Task 18: Add Deployment Environment Checklist - DONE
- **Files:** `docs/deployment-checklist-v0.1.md`, `.env.example`
- **Preconditions:** Tasks 11-17
- **Steps:**
  1. Document required env vars.
  2. Document local, staging, and production startup commands.
  3. Document secret ownership for AI providers, App Store, database, Redis, object storage, and admin access.
- **Done when:** a new machine can bootstrap backend and app from docs.
- **Verification:** Added `.env.example` and `docs/deployment-checklist-v0.1.md` covering required environment variables, local/staging/production startup commands, release gates, and secret ownership for AI providers, App Store, database, Redis, object storage, and admin access.
- **Complexity:** small

## Dependency Graph

```text
Task 11 -> Task 13 -> Task 14
Task 12 --------^
Task 8  -> Task 15
Tasks 1-10 -> Task 16
Task 13 -> Task 17
Tasks 11-17 -> Task 18
```

## Current User Action Needed

- PostgreSQL 18 is now installed and verified locally on port `5432`.
- Productionization Tasks 11-18 are complete.
- Keep AI provider keys out of the mobile app. They belong in backend environment variables only.
- Later, prepare Apple Developer / StoreKit access for real subscription receipt validation.
