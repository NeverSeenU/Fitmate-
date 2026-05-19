# FitMate AI Smoke Checklist

Run this checklist in Expo Go after meaningful mobile or backend changes.

## Setup

- Project root: `C:\Users\jiang\Projects\fitmate-ai`
- Backend: `http://127.0.0.1:8000`
- Expo: `exp://192.168.1.71:8081`
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
- Verify the chat shows a file insight card with document type, filename, extracted metrics, and a recommendation.
- If the card shows `同步体重到记录`, tap it.
- Verify the app navigates to Records and a weight card appears with the source filename.
- Return to chat and verify the file card is marked as synced instead of offering a second identical sync.
- Confirm that selecting or uploading a file does not change profile or records until the sync button is tapped.
- Repeat with `docs/engineering/smoke-fixtures/menu-smoke.txt`; verify `同步菜单营养到记录` creates a nutrition record and updates today's intake summary.
- Repeat with `docs/engineering/smoke-fixtures/workout-plan-smoke.txt`; verify `同步训练计划到记录` creates a workout record with the source filename.

## Settings And Profile

- Open subscription page; plan cards respond to taps.
- Open profile; edit and save profile values.
- Restore purchase action shows visible feedback.
