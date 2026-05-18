# FitMate AI Backlog

This is the formal task queue for the main Codex conversation and subagent team. Move completed work into `progress.md`; keep this file focused on open work.

## Priority 0: Project Control System

### P0-1: Keep Command Docs Current
- Owner: Main conversation / Tech Lead
- Files: `README.md`, `AGENTS.md`, `docs/engineering/*`
- Done when: new contributors and subagents can find setup, architecture, current progress, open tasks, and decision history without reading old chats.

### P0-2: Protect GitHub Backup Flow
- Owner: DevOps Lead
- Files: `.gitignore`, GitHub remote, automation config
- Done when: daily backup can push to `origin/main`; ignored/generated files and secrets are not committed.

## Priority 1: Safety And Production Readiness

## Priority 2: Core Product Stabilization

### P2-1: On-Device Smoke Test Pass
- Owner: Frontend Lead / QA Lead
- Files: `src/screens/*`, `src/services/appActions.ts`, `docs/engineering/progress.md`
- Scope: login/register, chat send, food upload, confirm/edit/discard, manual food record, check-in, subscription restore, profile editing.
- Done when: each flow is tested in Expo Go against the local backend and failures are logged as backlog items.

## Priority 3: Product Expansion

### P3-9: Expo Go File Insight Verification
- Owner: Frontend Lead / QA Lead
- Files: `src/screens/*`, `src/services/appActions.ts`, `docs/engineering/smoke-checklist.md`
- Scope: run the already automated live file insight flow manually in Expo Go on a real phone against the live local backend.
- Done when: file picker, insight card rendering, sync button tap target, Records navigation, and card synced state are verified on-device and any issues are logged or fixed.

### P3-11: Expanded File Insight Expo Go Verification
- Owner: Frontend Lead / QA Lead
- Files: `src/screens/*`, `src/components/ui.tsx`, `docs/engineering/smoke-checklist.md`
- Scope: manually verify body-report, menu, and workout-plan file insight cards and sync buttons in Expo Go.
- Done when: card layout, sync labels, tap targets, Records navigation, and synced-state copy are verified on-device.

## Subagent Assignment Template

```text
Role:
Objective:
Owned files:
Read-only reference files:
Requirements:
Acceptance criteria:
Out of scope:
Verification command:
```
