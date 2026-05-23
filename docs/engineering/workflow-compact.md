# FitMate Development Workflow Compact

Date: 2026-05-22

## Project Goal

FitMate is an AI fitness, fat-loss, food logging, workout logging, and emotional companion app. The product should feel clean, premium, dark-mode friendly, coaching-oriented, and practical for daily use.

The main conversation owns product and technical direction. Subagents take bounded tasks through the documented workflow, not through scattered chat memory.

## Canonical Workflow

1. Product direction is decided in the main Codex conversation.
2. Requirements are written into `docs/engineering/backlog.md`, `progress.md`, `architecture.md`, `decisions.md`, or this compact file.
3. A bounded task is assigned to a role from `docs/engineering/team.md`.
4. Code changes are made in `C:\Users\jiang\Projects\fitmate-ai`.
5. Verification runs before handoff:
   - `npm.cmd run typecheck`
   - `npm.cmd test`
   - backend pytest when backend/provider code changes
   - Expo Go true-device smoke for UI and photo/file flows
6. Changes are committed and pushed to GitHub branch `codex/p3-12-ai-file-extraction` until merged.

## Completed Recently

- Real AI food photo analysis via Xiaomi/Qwen-compatible vision provider.
- iPhone/Android image handling including HEIC-oriented provider path.
- Photo attachment preview before sending.
- User image bubble appears in chat and can be tapped for larger preview.
- Food card actions: confirm/write to Records, edit, discard.
- Follow-up answers trigger AI reanalysis instead of copying raw user text into the card.
- Food card now lives in the chat timeline, so multiple uploaded photos keep their own cards in place.
- AI follow-up text appears after the food card, matching user reading order.
- Records page shows confirmed food logs and workout cards.
- Energy target module calculates BMR, TDEE, daily target, exercise credit, calories left, and macro targets.
- Records summary now uses a progress-ring style for calories and macro progress.
- Profile gender is a two-option selector: male/female.

## Not Done Yet

- Dynamic 2-3 week calibration from weight trend, food logs, workout logs, and expected deficit.
- Better workout calorie estimation and explicit exercise credit source.
- Onboarding flow that forces the required energy inputs: sex, age, height, weight, goal, activity level.
- Apple Health / iPhone files / photo library deeper integration.
- Soul.md companion identity and safety rules for the emotional coach persona.
- Persistent chat history/cards across backend reloads beyond the current local app state.
- Better AI uncertainty flow: ask separate question bubbles, update the existing card after answer, avoid premature confirm state.
- Visual polish pass across Records, Chat, Profile, and card density after more true-device screenshots.

## Next Recommended Build Step

Build the dynamic calibration foundation:

1. Add weekly trend data selectors for confirmed food calories, weight check-ins, workout logs, and average body weight.
2. Add a calibration service that compares expected weight change against actual 7/14/21-day trend.
3. Output a recommendation object:
   - keep target
   - lower daily target by 100-150 kcal
   - raise daily target by 100-150 kcal
   - increase daily steps/training consistency
   - warn about insufficient data or water-weight noise
4. Show the recommendation in Records as a small coaching card, not inside the main calorie ring.

## UI Direction

- Clean + premium + coaching.
- Dark-mode friendly.
- Rounded cards at 8px unless a specific component needs a circle/ring.
- Large progress rings for daily energy and nutrition status.
- Food/photo cards should be inspectable and stay in chronological chat order.
- Microcopy may be bilingual, but the primary user-facing language should stay Chinese unless system language changes.
