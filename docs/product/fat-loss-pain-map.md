# FitMate Fat-Loss Pain Map

Date: 2026-05-25

This document exists so developers, subagents, and FitMate AI do not build for an imaginary "motivated user." The real user often opens the app when they are tired, guilty, hungry, rushed, or afraid they have ruined progress.

## Core Insight

Most fat-loss users do not fail because they lack another calorie formula. They fail because the hard moment feels emotionally expensive:

- "I already ate too much, so today is ruined."
- "I missed several days, so I don't want to look at the app."
- "The scale went up, so maybe nothing is working."
- "I am hungry after training and afraid to eat."
- "I don't know how to log this restaurant meal, so I won't log anything."
- "The AI guessed wrong, so I don't trust the whole product."

FitMate's job is to lower that emotional cost and move the user back to one safe next action.

## Hardest Moments

### 1. After overeating

What the user feels: shame, panic, all-or-nothing thinking.

Wrong product response: "You exceeded your target by 812 kcal."

FitMate response: "This is one meal, not a failed week. Do not punish yourself tonight. Drink water, keep the next meal protein-forward, and let me help you choose the simplest recovery plan."

Product requirement: every overeating flow must offer recovery, not punishment math.

### 2. After disappearing

What the user feels: avoidance, embarrassment, loss of momentum.

Wrong product response: streak loss, empty dashboard, or "you have not logged."

FitMate response: "No catch-up needed. Start from this meal."

Product requirement: returning users should see a reset path, not a failure state.

### 3. When the scale jumps

What the user feels: fear that effort is wasted.

Wrong product response: immediate calorie cuts.

FitMate response: explain water, salt, training soreness, food volume, menstrual cycle, sleep, and trend vs single weigh-in before adjusting targets.

Product requirement: scale anxiety must route through trend explanation before calorie advice.

### 4. When craving hits

What the user feels: urgency, bargaining, fear of losing control.

Wrong product response: generic willpower quote.

FitMate response: one pause action, one satisfying substitute, one permissioned option if the user chooses to eat.

Product requirement: craving flows should stabilize first, then give choices.

### 5. After training hunger

What the user feels: hunger plus fear that eating will erase the workout.

Wrong product response: "Stay under target."

FitMate response: protein, carbs, hydration, and a portion that protects recovery.

Product requirement: post-workout advice must protect recovery, not only deficit.

### 6. When AI is wrong

What the user feels: distrust.

Wrong product response: overconfident card or hidden uncertainty.

FitMate response: range, confidence, visible source, quick edit, and learning from the correction.

Product requirement: wrong estimates must be easy to correct and must not feel like arguing with the app.

## Product Design Rule

Every FitMate feature must answer:

```text
Does this reduce the user's burden in a hard fat-loss moment?
Does it preserve trust when the AI is uncertain or wrong?
Does it give one concrete next step instead of a lecture?
```

If not, it is secondary.

## Developer Checklist

- Do not optimize for perfect logging before emotional recovery.
- Do not hide uncertainty inside record details.
- Do not add steps when one tap or one sentence is enough.
- Do not punish gaps, overeating, cravings, or water-weight fluctuation.
- Preserve user input through failures.
- Use the user's corrections as product learning, not just local edits.
- Treat `Soul.md` as product behavior, not only prompt text.
