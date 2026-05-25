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

### P1-1: Soul And Trust Constitution
- Owner: Product/PM Lead / AI/Vision Lead / QA Lead
- Files: `Soul.md`, `docs/product/souls/default-recovery-companion.md`, `docs/engineering/red-team-response.md`, backend prompt/risk routing, mobile card/error copy
- Scope: convert the companion identity into enforceable rules for AI wording, card states, follow-up placement, failure copy, privacy copy, and safety escalation.
- Done when: shame/guilt/craving/restriction/scale-panic prompts produce emotionally safe responses; AI cards show draft/confirmed/edited state and uncertainty clearly; product copy follows `Soul.md`.

### P1-2: Humane Failure And Recovery States
- Owner: Frontend Lead / Backend Lead / QA Lead
- Files: `src/screens/ChatScreen.tsx`, `src/services/appActions.ts`, backend provider error mapping
- Scope: replace raw provider/backend failures with recovery options; preserve outgoing user bubbles, attachment previews, and drafts after failure.
- Done when: photo/file/text model failures never erase input and always offer retry, describe manually, or save for later.

### P1-3: Emotional And Health Risk Routing
- Owner: AI/Vision Lead / Backend Lead / Product/PM Lead
- Files: `backend/app/api/safety.py`, chat service, `Soul.md`, tests
- Scope: detect extreme restriction, purging/laxative language, binge panic, self-harm risk, medical-risk phrases, and unsafe overtraining before ordinary diet advice.
- Done when: high-risk chat messages route to safe supportive responses and log safety events without continuing normal weight-loss optimization.

## Priority 2: Core Product Stabilization

### P2-1: On-Device Smoke Test Pass
- Owner: Frontend Lead / QA Lead
- Files: `src/screens/*`, `src/services/appActions.ts`, `docs/engineering/progress.md`
- Scope: login/register, chat send, food upload, confirm/edit/discard, manual food record, check-in, subscription restore, profile editing.
- Done when: each flow is tested in Expo Go against the local backend and failures are logged as backlog items.

### P2-2: Settings, Account, Legal, And Privacy Completion
- Owner: Product/PM Lead / Frontend Lead / Backend Lead
- Files: `src/screens/SheetScreens.tsx`, `src/services/appActions.ts`, `backend/app/api/*`, legal docs
- Scope: restore purchases from real App Store / Play Store receipts, subscription management, email/phone editing, health/safety profile, language/theme/notifications, personalization, data export, legal Terms, Privacy Policy, Safety Disclaimer, help center, bug reporting, logout, account deletion confirmation.
- Done when: every Settings row either opens a complete screen or shows a clear disabled/planned state; legal text is product-specific and reviewed before release; privacy export/delete flows are backed by server jobs.

### P2-3: Dynamic Energy Calibration
- Owner: AI/Vision Lead / Product Lead / QA Lead
- Files: `src/services/energyTargets.ts`, `src/screens/RecordsScreen.tsx`, backend records endpoints
- Scope: compare expected weight trend against actual 7/14/21-day data from food logs, workout logs, and weight check-ins.
- Done when: Records shows a coaching recommendation to keep, lower, or raise daily targets with confidence and data sufficiency status.

### P2-4: Conversation UX Parity
- Owner: Frontend Lead
- Files: `src/overlays/ChatOverlays.tsx`, `src/services/appActions.ts`, `src/state/persistence.ts`
- Scope: ChatGPT-like conversation drawer with title-only rows, search, delete/rename, pinned conversations, and backend-side message sync.
- Done when: old conversations remain available locally and remotely, can be searched, renamed, deleted, and restored after reinstall/login.

## Priority 3: Product Expansion

### P3-12: AI-Generated Card Parameter Extraction
- Owner: AI/Vision Lead / Backend Lead / Frontend Lead
- Files: `backend/app/*`, `src/services/appActions.ts`, `src/components/ui.tsx`, `docs/engineering/architecture.md`
- Scope: replace heuristic-only user-facing extraction with AI structured outputs for food photos, uploaded images, uploaded files, and workout notes. Keep deterministic templates only as smoke fixtures and fallback tests.
- Done when: food, body-report, menu, and workout-plan cards are populated from validated AI output with confidence/source metadata, and fixture tests still pass without live provider credentials.

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
