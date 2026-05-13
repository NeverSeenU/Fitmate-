# Subagent Team Model

This document defines the fixed FitMate subagent team. The main Codex conversation uses this model to assign bounded work; subagents are started per task and do not stay online permanently.

## Operating Model

- Main conversation acts as Product Owner, Tech Lead, integrator, and final reviewer.
- Subagents are temporary specialists launched for a specific task, investigation, or patch.
- Every subagent assignment must include role, objective, owned files, acceptance criteria, out-of-scope boundaries, and verification commands.
- Subagents may read broadly, but should edit only their owned files.
- Main conversation resolves product tradeoffs, architecture changes, file ownership conflicts, merge conflicts, and release decisions.

## Fixed Roles

| Role | Primary Scope | Owned Files | Typical Verification |
| --- | --- | --- | --- |
| Frontend Lead | Expo/React Native UI, interactions, state wiring, photo upload UX | `src/screens/*`, `src/overlays/*`, `src/components/*`, `src/styles.ts`, `src/theme.ts`, UI-facing parts of `src/FitMateApp.tsx` | `npm.cmd run typecheck`, `npm.cmd test`, Expo/on-device smoke when relevant |
| Backend Lead | FastAPI routes, services, repositories, DB models, migrations | `backend/app/api/*`, `backend/app/services/*`, `backend/app/repositories/*`, `backend/app/db/*`, `backend/migrations/*`, backend tests | `python -m pytest backend\tests`, focused pytest |
| AI/Vision Lead | Xiaomi/Qwen/OpenAI-compatible providers, food analysis schema, model-call logging | `backend/app/ai/*`, provider sections of `backend/app/services/food_service.py`, `backend/tests/test_vision_providers.py`, AI-related docs | provider tests, food-flow tests |
| QA Lead | pytest, TypeScript tests, smoke plans, regression coverage, test risk | `backend/tests/*`, `src/tests/*`, test config, smoke checklists in `docs/engineering/*` | targeted tests plus full suite when risk warrants |
| DevOps Lead | GitHub Actions, environment handling, deployment, database ops, object storage, backup flow | `.github/*`, `.env.example`, deployment docs, storage/deployment config, CI scripts | CI dry run where possible, command docs, migration SQL rendering |
| Product/PM Lead | Requirement slicing, backlog grooming, acceptance criteria, priority calls | `docs/engineering/backlog.md`, `docs/engineering/progress.md`, product notes in `docs/project_notes/*` | backlog clarity review; no code tests unless paired with implementation |

## Handoff Rules

Use this structure when the main conversation assigns work:

```text
Role:
Objective:
Owned files:
Read-only reference files:
Requirements:
Acceptance criteria:
Out of scope:
Verification command:
Final report should include:
```

For implementation tasks, add:

```text
You are not alone in the codebase. Do not revert unrelated edits. Work only in your owned files unless blocked, and report any needed cross-file change before making it.
```

## Reporting Format

Subagents should return:

- Files changed, if any
- What was implemented or discovered
- Tests or checks run
- Remaining risks or blockers
- Suggested next task, only when it directly follows from the work

Explorer subagents should not modify files. Worker subagents may modify files only inside their assigned ownership.

## Task Routing

| Task Type | Default Lead | Common Pair |
| --- | --- | --- |
| Mobile UI bug | Frontend Lead | QA Lead |
| Food photo upload issue | Frontend Lead | Backend Lead, AI/Vision Lead |
| API contract change | Backend Lead | Frontend Lead |
| Provider failure or bad food JSON | AI/Vision Lead | Backend Lead |
| Test failure | QA Lead | owning implementation lead |
| GitHub Actions failure | DevOps Lead | QA Lead |
| Deployment/environment issue | DevOps Lead | Backend Lead |
| New product feature | Product/PM Lead | Frontend Lead, Backend Lead |

## Conflict Rules

- If two roles need the same file, main conversation decides ownership before edits start.
- If a subagent discovers the assigned task is larger than expected, it should stop after the smallest useful finding and ask for re-scope.
- If product behavior is ambiguous, Product/PM Lead writes options and acceptance criteria; main conversation chooses.
- If a change affects secrets, payments, safety, privacy, or database deletion, main conversation must review before commit.

## Integration Checklist

Before final integration, the main conversation checks:

- Ownership boundaries were respected.
- `docs/engineering/backlog.md` reflects remaining work.
- `docs/engineering/progress.md` records completed meaningful work.
- Tests appropriate to the changed files ran or are explicitly documented as not run.
- Git status is understood before commit.
