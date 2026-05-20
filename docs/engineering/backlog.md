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
- Files: `src/screens/*`, `src/components/ui.tsx`, `src/tests/runLiveFileInsightSmoke.ts`, `docs/engineering/smoke-checklist.md`
- Scope: manually verify body-report, menu, and workout-plan file insight cards and sync buttons in Expo Go after the automated live smoke has passed.
- Automated baseline: `npm.cmd run smoke:file-insight-live` now verifies all three document types, sync actions, and backend persistence.
- Done when: card layout, sync labels, tap targets, Records navigation, synced-state copy, and reload persistence are verified on-device.

### P3-12: AI-Generated Card Parameter Extraction
- Owner: AI/Vision Lead / Backend Lead / Frontend Lead
- Files: `backend/app/*`, `src/services/appActions.ts`, `src/components/ui.tsx`, `docs/engineering/architecture.md`
- Scope: replace heuristic-only user-facing extraction with AI structured outputs for food photos, uploaded images, uploaded files, and workout notes. Keep deterministic templates only as smoke fixtures and fallback tests.
- Done when: food, body-report, menu, and workout-plan cards are populated from validated AI output with confidence/source metadata, and fixture tests still pass without live provider credentials.

### P3-13: GPT-Style Attachment Composer
- Owner: Frontend Lead / QA Lead
- Files: `src/screens/ChatScreen.tsx`, `src/styles.ts`, `src/tests/*`
- Scope: selected files should appear in the composer as a removable attachment preview before upload; tapping send should upload/analyze the attachment and then render the insight card.
- Done when: Expo Go shows the selected filename/type/size before send, remove works, send triggers backend upload, and smoke tests cover the interaction.

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
