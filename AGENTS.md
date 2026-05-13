# FitMate AI Agent Instructions

## Project Root

The only active project root is:

`C:\Users\jiang\Projects\fitmate-ai`

Do not treat the older Codex session directory as the working project. It is an archive/source snapshot only.

## Working Rules

- Run all Codex, subagent, Git, GitHub, deployment, and test work from this project root.
- Keep API provider keys out of files. Inject Xiaomi/Qwen/OpenAI-style keys through process environment only.
- Prefer the existing Expo + React Native frontend and FastAPI backend structure.
- Before changing architecture, check `docs/project_notes/decisions.md`.
- Before debugging recurring behavior, check `docs/project_notes/bugs.md`.
- Before using ports, URLs, commands, or project constants, check `docs/project_notes/key_facts.md`.
- After completing meaningful work, update `docs/engineering/progress.md` and, when useful, `docs/project_notes/issues.md`.

## Current Verification Commands

- Frontend/type logic: `npm.cmd test`
- TypeScript: `npm.cmd run typecheck`
- Backend smoke: `python -m pytest backend\tests`

