# Task Plan: FitMate AI Backend MVP

## Status: CONTRACT_MVP_DONE
## Total Tasks: 10
## Completed: 10 / 10 contract tasks

### Task 1: Scaffold Backend App - DONE
- **Files:** `backend/pyproject.toml`, `backend/app/main.py`, `backend/app/config.py`
- **Preconditions:** None
- **Steps:**
  1. Create FastAPI app shell.
  2. Add environment config for database, Redis, object storage, and AI providers.
  3. Add `/healthz`.
- **Done when:** `pytest backend/tests/test_health.py` passes.
- **Verification:** `C:\Users\jiang\AppData\Roaming\Python\Python314\Scripts\pytest.exe tests/test_health.py` passed with 2 tests.
- **Complexity:** small

### Task 2: Add Database Models And Migrations - DONE
- **Files:** `backend/app/db/models.py`, `backend/migrations/*`, `backend/app/db/session.py`
- **Preconditions:** Task 1
- **Steps:**
  1. Add SQLAlchemy models for users, profiles, subscriptions, chats, logs, safety, and model calls.
  2. Add initial Alembic migration.
- **Done when:** migration applies cleanly to a local PostgreSQL database.
- **Verification:** PostgreSQL 18 on `localhost:5432` accepted `alembic upgrade head`; `fitmate` database contains 14 public tables including `users`, `food_logs`, `workout_logs`, `safety_events`, and `ai_model_calls`. Full backend suite passed with 42 tests using `DATABASE_URL=postgresql+psycopg://fitmate:fitmate@localhost:5432/fitmate`.
- **Complexity:** medium

### Task 3: Add Auth API - CONTRACT_DONE
- **Files:** `backend/app/api/auth.py`, `backend/app/services/auth_service.py`, `backend/tests/test_auth.py`
- **Preconditions:** Task 2
- **Steps:**
  1. Implement register, login, password-reset request, and password-reset confirm.
  2. Add JWT/session handling and password hashing.
- **Done when:** auth happy-path and invalid-password tests pass.
- **Verification:** `pytest` full backend suite passed with 10 tests.
- **Note:** API contract, password hashing, signed bearer tokens, and reset-token flow are implemented with an in-memory store until Task 2 can be verified against a real PostgreSQL database.
- **Complexity:** medium

### Task 4: Add Profile And Onboarding API - CONTRACT_DONE
- **Files:** `backend/app/api/me.py`, `backend/app/services/profile_service.py`, `backend/tests/test_profile.py`
- **Preconditions:** Task 3
- **Steps:**
  1. Implement `GET /v1/me`, `PATCH /v1/me/profile`, and `POST /v1/me/onboarding`.
  2. Store body, goal, preference, training, and risk data.
- **Done when:** onboarding writes profile data and `GET /v1/me` returns it.
- **Verification:** `pytest` full backend suite passed with 13 tests.
- **Note:** API contract is implemented with an in-memory profile store until Task 2 can be verified against a real PostgreSQL database.
- **Complexity:** medium

### Task 5: Add Subscription And Entitlement API - CONTRACT_DONE
- **Files:** `backend/app/api/subscription.py`, `backend/app/services/subscription_service.py`, `backend/tests/test_entitlements.py`
- **Preconditions:** Task 3
- **Steps:**
  1. Implement current subscription status and entitlement calculation.
  2. Add App Store restore and webhook placeholders with signature-validation boundary.
  3. Add fair-use decision function.
- **Done when:** Free, Pro, and Elite entitlement tests pass.
- **Verification:** `pytest` full backend suite passed with 19 tests.
- **Note:** API contract is implemented with an in-memory subscription store until Task 2 can be verified against a real PostgreSQL database.
- **Complexity:** medium

### Task 6: Add Chat Thread And Message API - CONTRACT_DONE
- **Files:** `backend/app/api/chat.py`, `backend/app/services/chat_service.py`, `backend/tests/test_chat.py`
- **Preconditions:** Tasks 3, 4, 5
- **Steps:**
  1. Implement chat thread list/create and message history.
  2. Implement text message request/response persistence with mock AI response.
- **Done when:** authenticated user can create a thread and send a text message.
- **Verification:** `pytest` full backend suite passed with 23 tests.
- **Note:** Text assistant response uses a contract mock until Task 7 provider routing is wired.
- **Complexity:** medium

### Task 7: Add AI Vision Provider Router - CONTRACT_DONE
- **Files:** `backend/app/ai/router.py`, `backend/app/ai/providers/xiaomi.py`, `backend/app/ai/providers/qwen.py`, `backend/tests/test_ai_router.py`
- **Preconditions:** Task 5
- **Steps:**
  1. Implement Xiaomi-first provider interface.
  2. Implement Qwen fallback interface.
  3. Add JSON schema validation for food photo output.
- **Done when:** Xiaomi success, Xiaomi invalid JSON retry, and Qwen fallback tests pass.
- **Verification:** `pytest` full backend suite passed with 27 tests.
- **Note:** Router, provider interface, schema validation, retry, low-confidence fallback, and Qwen fallback are implemented. Real provider HTTP calls remain behind provider classes.
- **Complexity:** medium

### Task 8: Add Food Photo And Food Log Flow - CONTRACT_DONE
- **Files:** `backend/app/api/food.py`, `backend/app/services/food_service.py`, `backend/tests/test_food_flow.py`
- **Preconditions:** Tasks 6, 7
- **Steps:**
  1. Implement authenticated image upload and object-storage boundary.
  2. Create food analysis response.
  3. Apply Free/Pro/Elite auto-record rules.
  4. Implement confirm, edit, and discard.
- **Done when:** Free does not auto-create records and Pro creates pending records.
- **Verification:** `pytest` full backend suite passed with 31 tests.
- **Note:** API contract is implemented with an in-memory food-log store and object-storage key boundary. Real object upload and database-backed food-log persistence remain pending until storage/PostgreSQL are available.
- **Complexity:** medium

### Task 9: Add Records, Check-ins, And Workout API - CONTRACT_DONE
- **Files:** `backend/app/api/records.py`, `backend/app/api/workouts.py`, `backend/app/services/records_service.py`, `backend/tests/test_records.py`
- **Preconditions:** Task 8
- **Steps:**
  1. Implement `GET /v1/records/today`.
  2. Implement check-in creation.
  3. Implement workout analyze/confirm/edit.
- **Done when:** records today returns calorie range, protein floor, logs, and AI summary fields.
- **Verification:** `pytest` full backend suite passed with 36 tests.
- **Note:** API contract is implemented with in-memory check-in/workout stores. Workout analysis uses a deterministic contract parser until real AI orchestration and database persistence are wired.
- **Complexity:** medium

### Task 10: Add Safety, Privacy, And Admin MVP - CONTRACT_DONE
- **Files:** `backend/app/api/safety.py`, `backend/app/api/privacy.py`, `backend/app/api/admin.py`, `backend/tests/test_safety_privacy_admin.py`
- **Preconditions:** Tasks 6-9
- **Steps:**
  1. Add safety classifier boundary and safety event logging.
  2. Add account deletion, photo deletion, and export-job placeholders.
  3. Add admin metrics for model usage, fallback rate, estimated cost, and safety events.
- **Done when:** safety event logging, privacy deletion placeholder, and admin metrics tests pass.
- **Verification:** `pytest` full backend suite passed with 42 tests.
- **Note:** Safety, privacy, and admin contracts are implemented with in-memory stores and placeholder jobs. Real safety model orchestration, deletion workers, export workers, model-call logging, and admin auth hardening remain productionization tasks.
- **Complexity:** medium

## Dependency Graph

```text
Task 1 -> Task 2 -> Task 3 -> Task 4
                  -> Task 5
Task 3 + Task 4 + Task 5 -> Task 6
Task 5 -> Task 7
Task 6 + Task 7 -> Task 8 -> Task 9 -> Task 10
```

## Implementation Guardrails

- Do not place AI provider keys in the mobile app.
- Do not expose model choice, fair-use thresholds, or backend memory controls in the front-end settings.
- Store image files in object storage, not PostgreSQL.
- Keep AI nutrition estimates as ranges.
- Log all fallback model calls for cost control.
- Add tests before wiring real provider calls.
