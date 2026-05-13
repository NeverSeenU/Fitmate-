# FitMate AI Project Guide

## Project Root

The only active project root is:

`C:\Users\jiang\Projects\fitmate-ai`

Older Codex session paths are historical snapshots and should not be used for new development.

## Project Memory System

This project maintains institutional knowledge in `docs/project_notes/` for consistency across sessions.

### Memory Files

- `bugs.md` - bug log with root causes, fixes, and prevention notes
- `decisions.md` - architectural and product decisions
- `key_facts.md` - project configuration, ports, URLs, commands, and ownership notes
- `issues.md` - work history and current execution notes

### Protocols

- Before proposing architectural changes, check `docs/project_notes/decisions.md`.
- When encountering errors or repeated bugs, search `docs/project_notes/bugs.md`.
- When looking up project configuration, use `docs/project_notes/key_facts.md`.
- When completing meaningful work, update `docs/engineering/progress.md` and add a concise work note to `docs/project_notes/issues.md` when useful.
- Never store provider API keys or user secrets in committed files.

