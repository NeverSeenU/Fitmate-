# Decisions

## ADR-001: Permanent Project Root (2026-05-12)

**Context:**
- FitMate started inside a Codex session directory under `Documents\Codex\2026-05-06\...`.
- Long-term development needs one stable root for Codex, subagents, Git, GitHub, deployment, and tests.

**Decision:**
- Use `C:\Users\jiang\Projects\fitmate-ai` as the only active project root.
- Keep old session directories as historical snapshots only.

**Consequences:**
- All future commands, subagent work, Git operations, and documentation updates should happen from the new root.
- Project-level memory and agent instructions now live in the repository.

## ADR-002: Backend-Owned AI Provider Keys (2026-05-12)

**Context:**
- FitMate uses Xiaomi-first and Qwen fallback vision providers.
- Mobile apps must not expose provider secrets.

**Decision:**
- Store provider keys only in backend process environment variables.
- Do not write provider API keys into `.env.example`, source files, docs, or committed config.

**Consequences:**
- Local provider testing requires launching the backend with keys injected into the process environment.
- Expo/mobile code talks only to the FitMate backend.

