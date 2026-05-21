# FitMate AI Architecture

## System Overview

FitMate AI has two primary runtime surfaces:

1. Expo/React Native mobile app in `src/`
2. FastAPI backend in `backend/app/`

The mobile app owns presentation, local state shaping, photo selection, and user interactions. The backend owns authentication, data persistence, AI provider secrets, model routing, safety/privacy boundaries, subscription entitlement logic, and admin metrics.

## Mobile App

| Layer | Files | Responsibility |
| --- | --- | --- |
| Entry | `App.tsx`, `index.ts` | Expo entry and app mounting |
| App shell | `src/FitMateApp.tsx` | screen routing, sheet routing, app state wiring, service creation |
| Screens | `src/screens/*` | auth, chat, records, subscription, settings, profile UI |
| Overlays | `src/overlays/*` | drawer and bottom panel UI |
| UI primitives | `src/components/ui.tsx`, `src/styles.ts`, `src/theme.ts` | reusable visual building blocks and styling |
| Domain/state | `src/domain/models.ts`, `src/state/*` | typed app data and persistence helpers |
| Services | `src/services/*` | auth, subscription, API client, app actions, photo picker, AI provider contracts |
| Tests | `src/tests/runLogicTests.ts` | focused logic coverage for mappings and action lifecycle |

The mobile client supports mock mode and backend mode through `src/config/env.ts` and `createFitMateServices`.

## Backend

| Layer | Files | Responsibility |
| --- | --- | --- |
| App entry | `backend/app/main.py` | FastAPI creation and route registration |
| API routes | `backend/app/api/*` | HTTP contracts, request validation, auth dependencies |
| Services | `backend/app/services/*` | business logic for auth, chat, food, records, safety, privacy, subscriptions |
| Repositories | `backend/app/repositories/*` | persistence protocols and SQLAlchemy implementations |
| Database | `backend/app/db/*`, `backend/migrations/*` | SQLAlchemy models, sessions, Alembic migrations |
| AI routing | `backend/app/ai/*` | Xiaomi-first, Qwen-fallback food photo analysis |
| Storage | `backend/app/storage/*` | food photo object-storage protocol and local adapter |
| Tests | `backend/tests/*` | API, services, repositories, providers, storage |

## Data And Secret Boundaries

- Mobile app never stores Xiaomi, Qwen, OpenAI-compatible, App Store, or admin secrets.
- `.env.example` documents variable names only; real `.env` files are ignored.
- Backend provider keys are injected through the process environment.
- GitHub backup must not stage `node_modules`, build output, `.env`, runtime logs, or Codex work-record JSONL files.

## AI Food Photo Flow

1. User selects or captures a food photo in the mobile app.
2. Mobile action layer uploads multipart photo data to the backend.
3. Backend stores the image through the storage protocol.
4. Vision router tries Xiaomi first and falls back to Qwen when needed.
5. Backend validates the structured food analysis schema.
6. Backend creates chat and food-log state according to user entitlement.
7. Mobile app renders a confirmation card for confirm/edit/discard.

## AI File Insight Flow

1. User selects a file in the mobile chat composer and sees a pending attachment preview.
2. User taps send; mobile uploads the file to `POST /v1/files/upload`.
3. Backend stores the file and extracts readable text from TXT, CSV, DOCX, XLSX, and simple PDFs.
4. When `FILE_AI_EXTRACTION_ENABLED=true`, the backend routes extracted text through the Xiaomi-first, Qwen-fallback structured extraction router.
5. AI output is validated into the same `document_type`, `insights`, and `recommendations` contract that the mobile file card already renders, plus top-level `confidence`, `model_provider`, and `model_name`.
6. Each extracted insight can carry `confidence` and `source_text`, so the mobile card can show which file excerpt supports the value.
7. If AI extraction is disabled, unavailable, or invalid, deterministic heuristics remain as the local smoke-test fallback.

## AI Workout Text Flow

1. User enters a workout note in the mobile chat utility sheet.
2. Mobile sends the note to `POST /v1/workouts/analyze`.
3. When `WORKOUT_AI_ANALYSIS_ENABLED=true`, the backend routes the text through the Xiaomi-first, Qwen-fallback structured workout router.
4. AI output is validated into `workout_type`, `duration_minutes`, `intensity`, `calories_burned_range_kcal`, `confidence`, and `summary`.
5. If AI analysis is disabled, unavailable, or invalid, the existing deterministic workout parser remains as the local smoke-test fallback.

## AI Food Text Flow

1. User sends a food description in chat.
2. Backend detects food-like text and, when `TEXT_FOOD_AI_ANALYSIS_ENABLED=true`, routes it through the Xiaomi-first, Qwen-fallback text food router.
3. AI output uses the same structured nutrition schema as food-photo analysis.
4. Chat service adapts the validated AI output into the existing editable food-card response contract.
5. If AI analysis is disabled, unavailable, or invalid, the deterministic text food parser remains as the local smoke-test fallback.

## Subagent Work Boundaries

Use file ownership to avoid conflicts:

- Frontend Lead: `src/screens/*`, `src/overlays/*`, `src/components/*`, `src/styles.ts`, `src/theme.ts`
- Mobile Services Lead: `src/services/*`, `src/state/*`, `src/domain/*`, `src/tests/*`
- Backend Lead: `backend/app/api/*`, `backend/app/services/*`, `backend/app/repositories/*`, `backend/app/db/*`
- AI/Vision Lead: `backend/app/ai/*`, provider tests, food-photo tests
- QA/DevOps Lead: `.github/*`, `docs/engineering/*`, test configuration, deployment docs

Subagents may read any file, but should only edit their assigned owned files unless the main conversation expands scope.
