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
