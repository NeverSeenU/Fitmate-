# Key Facts

## Project Root

- Active root: `C:\Users\jiang\Projects\fitmate-ai`
- Previous source snapshot: `C:\Users\jiang\Documents\Codex\2026-05-06\ask-planner-agent-planner-systematic-debugging\fitmate-ai-app`
- The previous snapshot should not be used for new development.

## Local Services

- Backend local URL: `http://127.0.0.1:8000`
- Backend LAN URL used by Expo Go: `http://192.168.1.71:8000`
- Expo Metro URL: `http://127.0.0.1:8081`
- Expo Go URL: `exp://192.168.1.71:8081`
- Local PostgreSQL database URL in dev config: `postgresql+psycopg://fitmate:fitmate@localhost:5432/fitmate`

## Commands

- Install frontend dependencies: `npm.cmd install`
- Frontend logic tests: `npm.cmd test`
- TypeScript check: `npm.cmd run typecheck`
- Backend tests: `python -m pytest backend\tests`
- Backend dev server: run `python -m uvicorn app.main:app --host 0.0.0.0 --port 8000` from `backend`
- Expo dev server: `npx.cmd expo start --lan --port 8081 --clear`

## Secret Handling

- Do not commit provider API keys.
- Inject Xiaomi and Qwen keys only into the backend process environment.
- `.env.example` is a template only and must not contain real secrets.

