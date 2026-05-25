# Red Team Response: Trust-First FitMate

Date: 2026-05-24

This document translates the red-team critique into product rules and engineering tasks. The critique is treated as directionally correct even though the original thread is not embedded in this repository: FitMate can fail if it becomes a complicated logging tool that asks too much from the user, makes opaque AI guesses, or damages trust when the user is emotionally vulnerable.

## Core Diagnosis

FitMate's biggest product risk is not model quality alone. The bigger risk is asking the user to operate the app like a database while marketing it as a companion.

The user comes to FitMate when they are hungry, guilty, tired, post-workout, anxious about weight, or unsure whether a meal "counts." In that state:

- Too many manual steps feel like judgment.
- Wrong AI estimates feel like betrayal.
- Silent failures feel like abandonment.
- Overconfident nutrition numbers feel unsafe.
- Generic coaching text feels fake.
- Legal or privacy ambiguity destroys trust.

## Product Principle

FitMate must feel like a trusted companion first, and a tracking system second.

The app should reduce work for the user, keep the user in control, and make every AI uncertainty visible without making the user feel blamed.

## Non-Negotiable Rules

1. Fewer steps by default
   - Uploading a photo or file should produce one clear next action, not a maze of cards and buttons.
   - FitMate should ask at most one high-value follow-up question at a time.
   - Users should be able to confirm, edit, or ignore without understanding the backend workflow.

2. Trust before automation
   - AI estimates must be treated as drafts until the user confirms them.
   - Every record written to Records must have a visible user-confirmed state or a clear automation policy.
   - User edits outrank AI output.

3. Emotional safety before optimization
   - When the user shows guilt, shame, panic, binge language, extreme restriction, or self-harm risk, the first response must reduce emotional pressure before giving tactics.
   - The app must never frame one meal as failure.
   - The app must avoid "punishment math" such as telling the user to compensate harshly after eating.

4. Uncertainty must be honest
   - If portion, sauce, cooking method, serving share, or document source is unclear, ask a separate question bubble.
   - Do not bury uncertainty questions inside a food card detail field.
   - Do not present precise calories when the evidence only supports a range.

5. Privacy must be obvious
   - Food photos, body data, weight, mood, and chat history are sensitive data.
   - Settings must make delete/export/privacy controls findable.
   - Future model-training or analytics use must be opt-in, not assumed.

6. Failures must be humane
   - If AI analysis fails, tell the user what still works: text description, manual entry, retry, or save for later.
   - Avoid dead states like "already read" or vague "internal server error."
   - A failed analysis should not erase the user's message, photo preview, or trust.

## Product Changes Required

### 1. Simplify The Main Loop

Target flow:

```text
User sends photo/file/text
FitMate immediately shows the user's message
FitMate produces either:
  A. one draft card + optional one question bubble
  B. one normal AI answer
  C. one humane failure state with recovery options
User can confirm/edit/ignore
Records updates only after confirmation or explicit automation policy
```

Avoid:

- Multiple competing cards for one upload.
- Questions above cards where they are visually missed.
- Buttons that have unclear consequences.
- Requiring the user to know whether the result came from file, photo, backend, or provider fallback.

### 2. Make AI Soul Product-Level, Not Just Prompt-Level

Soul rules must control:

- AI wording.
- Food card state.
- Follow-up question placement.
- Error copy.
- Records confirmation behavior.
- Safety escalation.
- Settings privacy language.

The assistant should be emotionally steady, direct, and protective. It should not flatter, shame, panic, or overpromise.

### 3. Add A Trust Layer To Cards

Every AI-generated card should communicate:

- Draft / confirmed / edited / discarded status.
- Confidence as a plain-language label, not just a decimal.
- Source: photo, file, user text, manual edit.
- One sentence explaining uncertainty when confidence is not high.
- Clear buttons: Confirm, Edit, Ignore.

### 4. Reduce Manual Burden In Onboarding

Onboarding should collect only the minimum required to calculate daily targets and make the companion feel personal:

- Sex.
- Age.
- Height.
- Weight.
- Goal.
- Activity level.
- Preferred coaching tone.
- Sensitive health warning if relevant.

Everything else should be optional and editable later.

### 5. Build Emotional Recovery Flows

Add explicit flows for:

- "I overate."
- "I want to skip food tomorrow."
- "I feel guilty."
- "I am craving."
- "I missed training."
- "The scale went up."

Each flow should:

1. Lower panic.
2. Normalize fluctuation without excusing harmful patterns.
3. Give one next action.
4. Avoid moral judgment.
5. Log only if the user wants it logged.

### 6. Make Settings A Trust Center

Settings is not just configuration. For a health companion app, Settings is where users decide whether they trust the product.

Required trust controls:

- Data export.
- Delete photos.
- Delete chat history.
- Delete account.
- AI memory on/off.
- Photo/file usage policy.
- Safety disclaimer.
- Terms.
- Privacy policy.
- Purchase restore and subscription management.

## Backlog Impact

### New P1 Work

P1-1: Soul And Trust Constitution
- Create a product-level Soul contract that binds AI output, UI states, error copy, and safety behavior.
- Add prompt tests for shame/guilt/restriction/craving scenarios.

P1-2: Humane Failure And Recovery States
- Replace raw backend/provider errors with user-facing recovery options.
- Preserve user messages and attachments after failures.

P1-3: Safety And Emotional Risk Classifier In Chat
- Detect extreme restriction, purging, binge panic, self-harm, medical risk, and unsafe overtraining.
- Route to safe supportive responses before nutrition tactics.

### P2 Work Changes

P2-2 Settings must be framed as Trust Center, not only account settings.

P2-4 Conversation UX must include local history trust behavior: no disappearing messages, recoverable drafts, clear active conversation title, and delete/rename controls.

P3-12 AI extraction must output validated schema plus uncertainty explanation and recovery question when needed.

## Acceptance Criteria

FitMate passes this red-team response when:

- A tired user can upload a meal photo and understand exactly what happened in under 10 seconds.
- A wrong estimate can be corrected without friction.
- A failed model call does not lose user input.
- The assistant never shames the user for food, weight, missed training, or cravings.
- The app can explain what data is stored and how to delete it.
- Every AI-written record has a visible trust status.
- Emotional high-risk messages produce safe support instead of ordinary diet advice.
