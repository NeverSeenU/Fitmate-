# FitMate AI Smoke Checklist

Run this checklist in Expo Go after meaningful mobile or backend changes.

## Setup

- Project root: `C:\Users\jiang\Projects\fitmate-ai`
- Backend: `http://127.0.0.1:8000`
- Expo: `exp://192.168.1.71:8081`
- For physical phones, start the backend with `python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000` from `backend/`, then verify `http://192.168.1.71:8000/v1/healthz` works.
- Start Expo with cache clear when UI looks stale: `npx.cmd expo start --lan --port 8081 --clear`
- Before opening Expo Go, run `npm.cmd run smoke:file-insight-live` with the backend running to verify body-report, menu, and workout-plan uploads, file insight extraction, explicit sync actions, profile persistence, food-log persistence, workout-log persistence, and Records persistence.
- Manual file fixtures live in `docs/engineering/smoke-fixtures/`. Copy `body-report-smoke.txt`, `menu-smoke.txt`, and `workout-plan-smoke.txt` to a phone-accessible Files/iCloud/Drive location before the Expo Go pass.

## Authentication

- Login with an existing test account reaches the chat screen.
- New account registration reaches the chat screen.

## Chat And Food Cards

- Send a normal chat message and verify assistant response appears.
- Type a food text message such as `我吃了半碗米饭和鸡胸肉` and verify a food card appears.
- Tap `编辑内容`; verify the food editor page opens.
- Edit food name, calories, protein, carbs, fat, and detail text.
- Save edit; verify card values and status update.
- Tap `确认并写入`; verify Records tab opens and the food record is confirmed.
- Create another food card and tap `丢弃`; verify the card disappears and does not count toward records.

## Photo Food Flow

- Tap `+` then camera/photo library.
- Select a food image; verify analysis card appears.
- Confirm, edit, and discard paths behave like the text/manual food card.

## Records

- Verify `今日摄入` reflects confirmed food records.
- Edit a confirmed food record; verify nutrition summary changes.
- Delete a food record; verify it disappears and nutrition summary changes.
- Tap `体重打卡`; verify a form opens, save weight and notes, and record appears.
- Tap `心情日记`; verify mood, hunger, craving, and detail fields save into a record.
- Edit and delete weight/mood records.

## File Insight Flow

- Pre-device automated baseline: `npm.cmd run smoke:file-insight-live` must pass against the same backend the phone will use.

- Tap `+` then `文件`.
- Select `docs/engineering/smoke-fixtures/body-report-smoke.txt` or another TXT, CSV, PDF, Word, or Excel file that contains a body metric such as `weight 70kg`.
- Verify the selected file appears above the composer before upload, with filename/type/size and a removable `X`.
- Type a question in the composer, such as `What should I sync from this report?`, then tap send.
- Verify the user chat bubble includes both the question and the attached filename, and that only one file-analysis request is created.
- Verify the chat shows a file insight card with document type, filename, extracted metrics, and a recommendation.
- If the card shows `同步体重到记录`, tap it.
- Verify the app navigates to Records and a weight card appears with the source filename.
- Return to chat and verify the file card is marked as synced instead of offering a second identical sync.
- Confirm that selecting or uploading a file does not change profile or records until the sync button is tapped.
- Repeat with `docs/engineering/smoke-fixtures/menu-smoke.txt`; verify `同步菜单营养到记录` creates a nutrition record and updates today's intake summary.
- Repeat with `docs/engineering/smoke-fixtures/workout-plan-smoke.txt`; verify `同步训练计划到记录` creates a workout record with the source filename.

## Live AI Provider Smoke

- Keep these flags `false` for deterministic local smoke unless you are explicitly testing real AI providers:
  - `FILE_AI_EXTRACTION_ENABLED`
  - `WORKOUT_AI_ANALYSIS_ENABLED`
  - `TEXT_FOOD_AI_ANALYSIS_ENABLED`
- For a real provider pass, inject Xiaomi or Qwen keys into the backend process environment, set one flag to `true`, restart the backend, run the matching manual flow, then set the flag back to `false` before ordinary smoke testing.
- For file extraction, run `FITMATE_REQUIRE_AI_FILE_METADATA=true npm.cmd run smoke:file-insight-live` with `FILE_AI_EXTRACTION_ENABLED=true`; this requires Xiaomi/Qwen provider metadata, top-level confidence, per-field confidence, and per-field `source_text` for body-report, menu, and workout-plan fixtures.
- Do not run destructive pytest cleanup at the same time as live provider smoke; run live smoke and backend tests sequentially to avoid local PostgreSQL table-lock deadlocks.

## Settings And Profile

- Open subscription page; plan cards respond to taps.
- Open profile; edit and save profile values.
- Restore purchase action shows visible feedback.
