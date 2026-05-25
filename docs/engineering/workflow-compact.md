# FitMate Development Workflow Compact

Date: 2026-05-24

## Project Goal

FitMate is a trust-first fat-loss recovery companion. It helps users record food, understand trends, and recover from the moments where weight loss usually breaks: overeating panic, missed records, cravings, post-workout hunger, scale anxiety, and feeling that one imperfect meal ruined the whole plan.

The product should feel clean, premium, dark-mode friendly, coaching-oriented, emotionally steady, and practical for daily use.

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

- Red-team response shifted FitMate away from "broad AI fitness app" toward "non-shaming fat-loss recovery companion."
- `docs/product/fat-loss-pain-map.md` documents the real hard moments developers and FitMate AI must design for.
- `docs/product/souls/default-recovery-companion.md` defines the default main AI Soul and example responses for the four recovery shortcuts.
- `Soul.md` now includes trust, uncertainty, emotional recovery, and hard-moment behavior rules.
- AI Chat now has one-tap recovery prompts: eating too much, restarting after a gap, next meal, and scale anxiety.
- Recovery prompt tests ensure those shortcuts stay focused on real fat-loss pain and concrete next actions.
- Backend text chat now applies deterministic recovery Soul replies for overeating panic, record gaps, next-meal planning, and scale anxiety instead of the generic contract mock.
- Backend text chat now sends high-risk compensation language through safety routing before nutrition advice.
- Chat-created safety events now keep the source user message id for auditability.
- Chat drawer "New chat" now directly creates a blank conversation. The template selection bottom sheet was removed.
- Settings P2-2 first pass is implemented: rows open account/info/legal/privacy/help/detail sheets instead of being dead buttons.
- Settings destructive actions now require a confirmation dialog before deleting photos/records or account data.
- Settings logout now shows a clear planned-state message until real auth logout is wired.
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
- Profile activity level is a fixed selector: sedentary, lightly active, moderately active, very active, extra active.
- Profile no longer shows the old manual training-frequency field once activity level exists.
- Profile close now guards unsaved edits with a save/discard/continue prompt.
- Records UI does not show BMR/TDEE implementation details; those stay inside the calculation module.
- Daily food intake is calculated from the first confirmed food record in a 24-hour rolling window, then resets until a new food record starts the next window.
- Records macro cards use explicit labels/icons and colored progress bars instead of placeholder text.
- Chat now supports real local conversation history: each thread stores its own messages, switching threads restores that thread, and the first user message can become the local chat title.
- Local persistence saves conversations, active thread id, and active thread messages so old chats survive app restarts.
- Chat drawer now shows title-only conversation rows, closer to ChatGPT mobile. Food/general subtitles are not displayed.
- Dynamic calibration MVP is implemented in `energyTargets`: FitMate compares food logs and weight trend, then recommends keep/lower/raise target or waits for more data.
- Records now shows a small AI coaching calibration card with food-day count, weight-trend days, confidence, and recommendation.

## Not Done Yet

- Live provider prompt assembly does not yet load/enforce `Soul.md`; only deterministic backend recovery paths are wired.
- Emotional risk routing still needs broader tests for guilt, purging, unsafe overtraining, medical-risk language, and repeated high-risk patterns.
- Recovery shortcuts currently send text prompts; they do not yet create a structured recovery card or state machine.
- Settings P2-2 still needs real App Store / Play Store purchase restore, real logout, email/phone editing, data export, backend account deletion verification, and release-reviewed legal copy.
- Dynamic calibration backend persistence and richer 21-day trend UI.
- Better workout calorie estimation and explicit exercise credit source.
- Onboarding flow that forces the required energy inputs: sex, age, height, weight, goal, activity level.
- Apple Health / iPhone files / photo library deeper integration.
- Soul.md companion identity and safety rules for the emotional coach persona.
- Backend-side long-term chat message sync; current implementation keeps full local conversation history in AsyncStorage.
- Better AI uncertainty flow: ask separate question bubbles, update the existing card after answer, avoid premature confirm state.
- Settings completion: real purchase restore, subscription management, email/phone editing, language/theme/notifications, personalization, data export, legal Terms, Privacy Policy, Safety Disclaimer, help center, bug report, logout, and destructive-account confirmation.
- Visual polish pass across Records, Chat, Profile, and card density after more true-device screenshots.

## Next Recommended Build Step

Move Soul from deterministic backend paths into the live AI path:

1. Add backend prompt assembly that includes `Soul.md` or a compiled Soul policy for real provider text responses.
2. Add structured recovery cards/state for the four recovery shortcut paths.
3. Expand tests for shame, guilt, purging, unsafe overtraining, medical risk, and repeated restriction patterns.
4. Make photo/file failure responses preserve the user's input and offer retry, describe manually, or save for later.

After that, return to P2-2 trust-center Settings: purchase restore, data export, legal copy, privacy controls, logout, and backend-verified account deletion.

## Whole-App Audit Snapshot

- Chat: local multi-conversation history works; still needs search, rename/delete, pinned chats, and backend message sync.
- Food vision: real provider path works; still needs stronger uncertainty UX and better portion correction loops.
- Files: body report/menu/workout-plan extraction exists; still needs iPhone Files channel polish and richer document previews.
- Records: food/workout/weight/mood cards work; still needs weekly trend chart, calibration history, and workout-calorie source clarity.
- Profile/onboarding: profile has required energy inputs; onboarding still needs to force sex/age/height/weight/goal/activity before real use.
- Settings: many rows are still placeholders; purchase restore is currently a dev restore path, not real store-account purchase verification.
- Legal/privacy: API boundaries exist for privacy/delete; user-facing Terms, Privacy Policy, Safety Disclaimer, data export, and deletion confirmation are not release-ready.
- Subscription: entitlement UI exists; real StoreKit/Play Billing checkout, restore, and server notification verification remain open.

## UI Direction

- Clean + premium + coaching.
- Dark-mode friendly.
- Rounded cards at 8px unless a specific component needs a circle/ring.
- Large progress rings for daily energy and nutrition status.
- Food/photo cards should be inspectable and stay in chronological chat order.
- Microcopy may be bilingual, but the primary user-facing language should stay Chinese unless system language changes.
