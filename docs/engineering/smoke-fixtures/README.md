# File Insight Smoke Fixtures

Use these files for Expo Go manual verification after `npm.cmd run smoke:file-insight-live` passes.

## Files

- `body-report-smoke.txt`: should classify as `body_report`, extract `weight_kg` and `body_fat_percent`, and sync into a weight record.
- `menu-smoke.txt`: should classify as `menu`, extract `calories_kcal` and `protein_g`, and sync into a food/nutrition record.
- `workout-plan-smoke.txt`: should classify as `workout_plan`, extract `training_frequency`, and sync into a workout record.

## Expected Flow

1. Copy these files to a phone-accessible location such as iCloud Drive, Files, or a shared folder.
2. In Expo Go, open FitMate and tap `+` then the file action.
3. Pick one fixture at a time.
4. Confirm the chat card document type, metric labels, sync button, Records navigation, synced state, and reload persistence.
