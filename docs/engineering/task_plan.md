# Task Plan: FitMate AI MVP Engineering

## Status: COMPLETE
## Total Tasks: 8
## Completed: 8 / 8

### Task 1: Establish App Source Structure - DONE
- **Files:** `App.tsx`, `src/FitMateApp.tsx`, `src/types.ts`, `src/theme.ts`
- **Preconditions:** None
- **Steps:**
  1. Move the current prototype out of the root entry file.
  2. Add shared navigation types, responsive theme values, and prototype mock data.
  3. Keep current UI behavior unchanged.
- **Done when:** `npx.cmd tsc --noEmit` -> passes.
- **Complexity:** small

### Task 2: Split Reusable UI Components - DONE
- **Files:** `src/components/*.tsx`, `src/FitMateApp.tsx`
- **Preconditions:** Task 1
- **Steps:**
  1. Extract buttons, rows, cards, top bars, tabs, and panels into reusable components.
  2. Keep visual output unchanged.
- **Done when:** `npx.cmd tsc --noEmit` -> passes, and iOS export succeeds.
- **Complexity:** medium

### Task 3: Split Screens And Overlays - DONE
- **Files:** `src/screens/*.tsx`, `src/overlays/*.tsx`, `src/FitMateApp.tsx`
- **Preconditions:** Task 2
- **Steps:**
  1. Move login, onboarding, chat, records, subscription, settings, and profile into screen modules.
  2. Move drawer and bottom panels into overlay modules.
- **Done when:** `npx.cmd tsc --noEmit` -> passes, and `expo export --platform ios` succeeds.
- **Complexity:** medium

### Task 4: Add App State And Domain Models - DONE
- **Files:** `src/domain/*.ts`, `src/state/*.ts`
- **Preconditions:** Task 3
- **Steps:**
  1. Define user profile, subscription, conversation, food analysis, and record types.
  2. Replace scattered literal data with typed state.
- **Done when:** `npx.cmd tsc --noEmit` -> passes.
- **Complexity:** medium

### Task 5: Add Auth And Subscription Service Contracts - DONE
- **Files:** `src/services/auth.ts`, `src/services/subscription.ts`, `src/config/env.ts`
- **Preconditions:** Task 4
- **Steps:**
  1. Define login/register/reset-password service boundaries.
  2. Define subscription status and fair-use entitlement checks.
- **Done when:** service methods type-check and can be mocked locally.
- **Complexity:** small

### Task 6: Add AI Vision Service Contract - DONE
- **Files:** `src/services/aiVision.ts`, `src/services/providers/*.ts`
- **Preconditions:** Task 4
- **Steps:**
  1. Add Xiaomi-first, Qwen-fallback provider interface.
  2. Return structured food-estimate JSON for UI confirmation.
- **Done when:** provider contract type-checks and can use fixture output.
- **Complexity:** medium

### Task 7: Add Local Persistence Stub - DONE
- **Files:** `src/storage/*.ts`, `src/state/*.ts`
- **Preconditions:** Task 4
- **Steps:**
  1. Persist records, conversations, profile, and local auth session stubs.
  2. Keep paid memory and auto-record flags controlled by entitlement logic.
- **Done when:** state can be saved and restored in local mock flow.
- **Complexity:** medium

### Task 8: Add Verification Harness - DONE
- **Files:** `package.json`, `tsconfig.test.json`, `src/tests/runLogicTests.ts`, `docs/engineering/progress.md`
- **Preconditions:** Tasks 2-7
- **Steps:**
  1. Add focused unit tests for domain parsing and entitlement logic.
  2. Keep TypeScript and iOS export as required checks.
- **Done when:** `npx.cmd tsc --noEmit` and tests pass.
- **Complexity:** medium

## Dependency Graph

Task 1 -> Task 2 -> Task 3 -> Task 4
Task 4 -> Task 5
Task 4 -> Task 6
Task 4 -> Task 7
Task 5 + Task 6 + Task 7 -> Task 8
