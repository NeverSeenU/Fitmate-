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

## Subagent Work Boundaries

Use file ownership to avoid conflicts:

- Frontend Lead: `src/screens/*`, `src/overlays/*`, `src/components/*`, `src/styles.ts`, `src/theme.ts`
- Mobile Services Lead: `src/services/*`, `src/state/*`, `src/domain/*`, `src/tests/*`
- Backend Lead: `backend/app/api/*`, `backend/app/services/*`, `backend/app/repositories/*`, `backend/app/db/*`
- AI/Vision Lead: `backend/app/ai/*`, provider tests, food-photo tests
- QA/DevOps Lead: `.github/*`, `docs/engineering/*`, test configuration, deployment docs

Subagents may read any file, but should only edit their assigned owned files unless the main conversation expands scope.
