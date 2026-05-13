# FitMate AI Agent Instructions

## Project Root

- Use `C:\Users\jiang\Projects\fitmate-ai` as the only active root.
- Treat older Codex session directories as historical snapshots only.

## Read First

| Need | File |
| --- | --- |
| Human setup and repo map | `README.md` |
| Current status | `docs/engineering/progress.md` |
| Open task queue | `docs/engineering/backlog.md` |
| Architecture and ownership | `docs/engineering/architecture.md` |
| Commands and troubleshooting | `docs/engineering/runbook.md` |
| Execution decisions | `docs/engineering/decisions.md` |
| Durable project memory | `docs/project_notes/` |

## Commands

| Task | Command |
| --- | --- |
| TypeScript | `npm.cmd run typecheck` |
| Mobile logic tests | `npm.cmd test` |
| Backend tests | `python -m pytest backend\tests` |
| Backend smoke | `python -m pytest backend\tests\test_health.py` |
| Expo start | `npm.cmd run start` |

## Subagent Protocol

- Main conversation owns product direction, prioritization, integration, and final verification.
- Subagents must receive owned files, acceptance criteria, out-of-scope notes, and a verification command.
- Subagents may read any file but should edit only assigned owned files.
- Before architecture changes, check `docs/engineering/decisions.md` and `docs/project_notes/decisions.md`.
- After meaningful work, update `docs/engineering/progress.md`; add or update backlog items when work remains.

## Safety Rules

- Keep provider keys, GitHub tokens, App Store secrets, and real `.env` files out of Git.
- Inject Xiaomi/Qwen/OpenAI-compatible keys through backend process environment only.
- Do not stage `node_modules`, `.test-build`, `dist-ios*`, `.runtime-logs`, `.env*`, or `docs/work-records/*.jsonl`.
- Do not run destructive backend tests against staging or production databases.
