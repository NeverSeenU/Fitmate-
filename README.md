# FitMate AI

FitMate AI is a mobile-first fitness and nutrition assistant. The app combines an Expo/React Native client with a FastAPI backend for authentication, chat, food-photo analysis, records, subscriptions, privacy, safety, and admin metrics.

## Project Status

This repository is the official FitMate project root:

```text
C:\Users\jiang\Projects\fitmate-ai
```

Older Codex session directories are historical snapshots only. All future Codex, subagent, Git, GitHub, testing, and deployment work should happen from this repository.

## Tech Stack

| Area | Stack |
| --- | --- |
| Mobile app | Expo 54, React 19, React Native 0.81, TypeScript |
| Backend API | Python 3.12+, FastAPI, SQLAlchemy, Alembic |
| Database | PostgreSQL |
| AI vision | Xiaomi primary provider, Qwen fallback provider, OpenAI-compatible chat completions shape |
| Testing | TypeScript typecheck, custom mobile logic runner, pytest backend suite |
| Project ops | GitHub private repository, daily GitHub backup automation |

## Repository Map

| Path | Purpose |
| --- | --- |
| `src/` | Expo/React Native app, screens, state, services, domain models, tests |
| `backend/app/` | FastAPI app, API routes, services, repositories, DB models, AI providers |
| `backend/tests/` | Backend pytest suite |
| `backend/migrations/` | Alembic migrations |
| `docs/engineering/` | Execution control: progress, backlog, architecture, runbook, decisions |
| `docs/project_notes/` | Durable project memory: bugs, key facts, decisions, issues |
| `AGENTS.md` | Repo-wide instructions for Codex and subagents |

## Quick Start

Install mobile dependencies:

```powershell
npm.cmd install
```

Run mobile checks:

```powershell
npm.cmd run typecheck
npm.cmd test
```

Install backend development dependencies:

```powershell
python -m pip install -e ".\backend[dev]"
```

Run backend tests:

```powershell
python -m pytest backend\tests
```

Start Expo:

```powershell
npm.cmd run start
```

Start the backend from `backend/`:

```powershell
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

## Development Workflow

1. Read `AGENTS.md` before using Codex or subagents.
2. Check `docs/engineering/backlog.md` for the current task queue.
3. Use `docs/engineering/team.md` when assigning work to subagents.
4. Update `docs/engineering/progress.md` after meaningful work.
5. Record important technical decisions in `docs/engineering/decisions.md`.
6. Keep secrets out of committed files. Use `.env.example` only as a template.

## GitHub

Canonical remote:

```text
https://github.com/NeverSeenU/Fitmate-
```

The repository is private. Daily backup automation checks for changes and pushes legitimate project updates to `origin/main`.
