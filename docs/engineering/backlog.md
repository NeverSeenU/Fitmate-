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

### P3-1: Subscription And Fair-Use Enforcement
- Owner: Backend Lead
- Files: `backend/app/services/subscription_service.py`, `backend/app/db/models.py`, `backend/app/repositories/sqlalchemy/*`
- Done when: usage counters are read and incremented on chat/photo/workout paths and entitlement behavior is tested.

### P3-2: Mobile UI Automation
- Owner: QA Lead / Frontend Lead
- Files: test tooling to be selected, `src/screens/*`
- Done when: critical mobile workflows have repeatable smoke automation with screenshots or actionable logs.

### P3-3: Production Storage Adapter
- Owner: DevOps Lead / Backend Lead
- Files: `backend/app/storage/*`, `.env.example`, deployment docs
- Done when: non-local object storage can save and delete food photos through the existing storage protocol.

### P3-4: File Upload And Parsing Pipeline
- Owner: Backend Lead / AI-Vision Lead / Frontend Lead
- Files: `backend/app/api/*`, `backend/app/storage/*`, `src/services/*`, `src/screens/ChatScreen.tsx`
- Scope: add an explicit backend endpoint for user-approved file upload, storage, parsing, and privacy deletion.
- Done when: selected files can be uploaded only after clear user intent, parsed summaries appear in chat, storage keys are privacy-deletable, and tests cover supported and unsupported file types.

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
