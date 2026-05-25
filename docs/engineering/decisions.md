# Engineering Decisions

This file records project-level execution decisions for the main conversation and subagent team. Architecture/product ADRs can also be mirrored in `docs/project_notes/decisions.md` when they should persist as project memory.

## ED-001: Canonical Project Root

- Date: 2026-05-12
- Decision: `C:\Users\jiang\Projects\fitmate-ai` is the only active project root.
- Consequence: all Codex, subagent, Git, GitHub, test, and deployment work must use this root.

## ED-002: GitHub Is The Backup And Collaboration Source

- Date: 2026-05-12
- Decision: `https://github.com/NeverSeenU/Fitmate-` is the canonical private GitHub remote.
- Consequence: local work should be committed and pushed to `origin/main`; daily backup automation handles routine backup when changes exist.

## ED-003: Main Conversation Owns Direction, Subagents Own Bounded Work

- Date: 2026-05-13
- Decision: the main Codex conversation acts as product owner and technical lead. Subagents receive bounded tasks with owned files, acceptance criteria, and verification commands.
- Consequence: subagents should not make broad architecture changes or edit outside their assigned ownership without explicit main-conversation approval.

## ED-004: Documentation Is The Team Interface

- Date: 2026-05-13
- Decision: `README.md`, `AGENTS.md`, `docs/engineering/progress.md`, `docs/engineering/backlog.md`, `docs/engineering/architecture.md`, `docs/engineering/runbook.md`, and `docs/engineering/decisions.md` form the project command system.
- Consequence: new agents should read these files instead of relying on old chat context.

## ED-005: Secrets Stay Outside Git

- Date: 2026-05-13
- Decision: real provider keys, GitHub tokens, database passwords beyond local templates, and App Store secrets must not be committed.
- Consequence: `.env.example` may contain placeholders only; real `.env` files remain ignored.

## ED-006: Fixed Six-Role Subagent Team

- Date: 2026-05-13
- Decision: FitMate uses six standing subagent roles: Frontend Lead, Backend Lead, AI/Vision Lead, QA Lead, DevOps Lead, and Product/PM Lead.
- Consequence: the roles are operational templates, not permanent running agents. Main conversation launches the needed role per task using `docs/engineering/team.md`.

## ED-007: Template Smoke Is Not Product Intelligence

- Date: 2026-05-19
- Decision: deterministic templates and heuristics are allowed for smoke tests, but production food, file, photo, and workout cards must be filled by an AI extraction pipeline with structured output validation.
- Consequence: tests should keep stable fixture coverage, while product work must route real user uploads through AI/Vision providers before showing nutrition, body, or training parameters as user-facing insight.

## ED-008: Energy Targets Start With BMR/TDEE And Later Calibrate From History

- Date: 2026-05-22
- Decision: Records uses Mifflin-St Jeor BMR as the MVP baseline, activity-factor TDEE, goal adjustment, partial exercise calorie return, and a protein target derived from body weight.
- Formula:
  - BMR male = `10 * weightKg + 6.25 * heightCm - 5 * age + 5`
  - BMR female/unspecified = `10 * weightKg + 6.25 * heightCm - 5 * age - 161`
  - TDEE = `BMR * activityFactor`
  - Daily target = maintenance TDEE, fat-loss TDEE - 500 kcal, or muscle-gain TDEE + 200 kcal
  - Calories left = `dailyTarget - foodLogged + exerciseCalories * returnRate`
- Product rule: exercise calories are not fully returned; default return rate is 60%, clamped to 50-70% because device estimates can overstate burn.
- Inputs: sex, age, height, weight, goal, activity/training frequency, confirmed food records, and workout calories when available.
- Consequence: the MVP is an estimate, not a medical measurement. After 2-3 weeks of weight, food, and workout records, FitMate should dynamically adjust maintenance calories/TDEE from weight trend, expected deficit, and logging consistency.
- Sources: National Academies DRI/EER materials define energy needs using age, sex, height, weight, and physical activity level; FitMate uses the simpler Mifflin-St Jeor implementation for mobile product clarity until the historical calibration module exists.

## ED-009: FitMate Is Trust-First, Not Logging-First

- Date: 2026-05-24
- Decision: FitMate must behave as a trusted companion first and a tracking system second. Product and engineering work should reduce user burden, preserve user control, and make uncertainty visible instead of optimizing only for automatic logging.
- Source: red-team critique summarized in `docs/engineering/red-team-response.md`.
- Product rules:
  - AI-generated records are drafts until user-confirmed or governed by a clear automation policy.
  - User corrections override AI estimates.
  - Failure states must preserve user input and offer recovery options.
  - Follow-up questions belong in chat bubbles, not buried inside record details.
  - Emotional safety takes priority over calorie optimization when the user expresses guilt, shame, binge panic, extreme restriction, or self-harm risk.
- Consequence: `Soul.md` is now a product contract, not only a prompt. Frontend card states, backend AI routing, settings/privacy language, and QA tests must align with it.
