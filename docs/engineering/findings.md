# Findings: FitMate AI MVP Engineering

## Decisions Made
- Keep the current Expo prototype behavior intact during engineering refactors. The user already validated the iPhone interaction shape, so structural work should not redesign screens unless requested.
- Use Xiaomi-first and Qwen-fallback as the AI provider direction. The app UI should not expose model selection to users.
- Keep automatic recording, AI memory, and fair-use limits as entitlement-controlled backend behavior, not visible front-end toggles.
- Backend/API design should use FastAPI, PostgreSQL, Redis, object storage, and backend-owned provider keys.
- Backend model routing remains Xiaomi-first with Qwen fallback; Doubao is disabled until reintroduced and GLM remains removed.

## Discoveries
- The current prototype was a single `App.tsx` file. This is workable for visual iteration but not for backend integration, tests, or long-term maintenance.
- `npx.cmd` must be used on this Windows environment; bare `npm` can hit PowerShell script policy issues.
- `frontend-design` has been installed but requires a Codex restart before it is available as an active skill. Its design guidance should be applied as a review constraint without changing the approved app structure.
- Python packages installed with `python -m pip install -e ".[dev]"` landed under the user Python directory, so backend pytest execution needs the installed `pytest.exe` path in this sandboxed workspace.
- Backend Task 2 can be partially verified without PostgreSQL through SQLAlchemy metadata tests and Alembic offline SQL generation.
- Auth API can be contract-tested with an in-memory store while PostgreSQL is unavailable, but production persistence must move behind a database repository before app integration.
- Profile and onboarding API can be contract-tested with an in-memory store while PostgreSQL is unavailable, but private body/risk data must move to database persistence before real users.
- Subscription entitlements should be returned as capability booleans/labels only. Concrete fair-use thresholds stay backend-only and must not appear in app-facing subscription responses.
- Chat contract can be implemented with a mock assistant response before provider routing. Thread/message ownership checks must stay server-side because chat history includes sensitive diet, body, and emotional context.
- Vision routing should treat exact model calls as backend infrastructure. The mobile app only receives normalized nutrition ranges, confidence, advice, and provider metadata.
- Low-confidence primary model results should fallback to Qwen, not blindly trust Xiaomi, because food-photo calorie estimation is high variance.
- Food-photo uploads should store only object-storage keys in app data. The current Task 8 contract uses generated object keys and in-memory logs until a real object-storage provider and PostgreSQL repository are wired.
- Automatic food logging must be entitlement-gated. Free users get analysis-only output, while Pro/Elite users can receive pending records that still require confirmation/edit/discard.
- Today's records summary should aggregate confirmed, edited, and pending records, but ignore discarded records so users do not see rejected AI estimates counted in daily totals.
- Workout auto-recording follows the same entitlement rule as food photos: Free gets analysis-only, while Pro/Elite gets pending records for confirmation.
- The current workout analyzer is deterministic contract logic, not a nutrition-grade AI estimate. It is only enough to stabilize mobile/backend API integration before provider orchestration.
- Safety classification currently uses deterministic keyword matching as a boundary test. Production should route this through the AI orchestration/safety layer and keep conservative fallback behavior.
- Privacy deletion/export endpoints intentionally return placeholder jobs. Real deletion/export must run asynchronously and cover object storage, database rows, and provider log redaction where available.
- Admin metrics use a local admin secret for MVP contract testing. Production should move to separate admin identity, audit logs, and model-call persistence.
- Repository protocols should stay narrow and service-shaped. This keeps current in-memory stores valid for fast contract tests while allowing SQLAlchemy repositories to replace them behind the same boundary.

## Blockers Encountered
- None in Backend Task 1.
- Backend Task 2 real migration verification is blocked because no local PostgreSQL service is listening on `localhost:5432` and `psql` is not on PATH.
- None in Task 2.
- None in Task 3.
- None in Task 4.
- None in Task 5.
- None in Task 6.
- None in Task 7.
- None in Task 8.
- None in Task 9.
- None in Task 10.
