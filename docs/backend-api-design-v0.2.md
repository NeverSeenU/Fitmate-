# FitMate AI Backend And API Design v0.2

## Scope

This backend design supports the current iPhone MVP structure without changing the approved mobile UI:

- AI Chat
- Check-in & Records
- Login, Register, Forgot Password
- Onboarding and user profile
- Subscription and entitlement control
- Settings, privacy, safety, and account controls

The backend owns all provider API keys, safety checks, subscription verification, fair-use enforcement, memory retention, and auto-record behavior. The mobile app never receives Xiaomi, Qwen, payment, or admin secrets.

## Recommended Stack

Initial backend:

- API: FastAPI with Python 3.12
- Database: PostgreSQL
- Cache and fair-use counters: Redis
- Object storage: S3-compatible storage for food photos
- Background jobs: Redis Queue, Celery, or managed job queue
- Observability: structured logs plus admin metrics table

Reasoning:

- The product is AI-pipeline-heavy and schema-heavy; Python makes provider integrations, JSON validation, and nutrition calibration easier.
- FastAPI gives OpenAPI contracts for the mobile team quickly.
- PostgreSQL is enough for accounts, logs, subscriptions, and normalized food records.
- Redis is enough for daily usage counters, temporary upload sessions, and model retry locks.

## Service Boundaries

### Auth Service

Owns:

- Registration
- Login
- Password reset
- Session refresh
- Account deletion

Does not own:

- Subscription verification
- Profile health data
- AI memory

### Profile Service

Owns:

- Body data
- Goal data
- Food preference
- Training baseline
- Safety and medical-risk screening answers

Health and body data should be treated as private user data. It should not be exposed in public analytics or model logs without redaction.

### Subscription Service

Owns:

- Current plan
- App Store receipt/server notification verification
- Entitlement calculation
- Backend-only fair-use rules
- Restore purchase flow

Rules:

- Subscription copy can say high-volume and priority use.
- Do not expose exact hard limits in the app.
- Free users get manual logging and short memory.
- Pro and Elite users get auto-created pending records.
- Elite can later unlock high-confidence auto-confirm.

### AI Orchestration Service

Owns:

- Safety pre-check
- Context and memory retrieval
- Model routing
- Provider retries
- JSON schema validation
- Provider fallback
- Safety post-check
- Structured result normalization

Model policy:

- Vision primary: Xiaomi MiMo
- Vision fallback: Qwen3-VL Plus
- Doubao: disabled until explicitly reintroduced
- GLM: removed

### Records Service

Owns:

- Food logs
- Workout logs
- Check-ins
- Daily summaries
- Confirm/edit/discard workflows

Every AI-created food or workout record starts as `pending` unless it meets explicit entitlement and confidence rules.

### Memory Service

Owns:

- User preference summaries
- Recent behavior summaries
- Weekly review summaries
- Retention enforcement

Rules:

- Free: memory retention 7 days.
- Paid: longer retention.
- Memory is a backend capability. It is not a front-end model switch.

### Safety Service

Owns:

- Extreme restriction detection
- Purging/laxative behavior detection
- Self-harm escalation
- Medical-risk routing
- Safety event logging

The product gives lifestyle coaching, not medical diagnosis, therapy, eating disorder treatment, or prescription advice.

## Database Schema v0.2

### users

```sql
id uuid primary key
email text unique
phone text unique
password_hash text not null
status text not null -- active, disabled, deleted
created_at timestamptz not null
updated_at timestamptz not null
deleted_at timestamptz
```

### user_profiles

```sql
user_id uuid primary key references users(id)
display_name text
sex text -- female, male, unspecified
age int
height_cm numeric(5,2)
current_weight_kg numeric(5,2)
goal_label text
goal_weight_kg numeric(5,2)
goal_date date
food_preferences_json jsonb not null default '{}'
training_baseline_json jsonb not null default '{}'
risk_flags_json jsonb not null default '{}'
created_at timestamptz not null
updated_at timestamptz not null
```

### subscriptions

```sql
id uuid primary key
user_id uuid not null references users(id)
plan text not null -- free, pro, elite
status text not null -- active, trialing, past_due, canceled, expired
provider text not null -- app_store, stripe, manual
provider_customer_id text
provider_subscription_id text
current_period_start timestamptz
current_period_end timestamptz
created_at timestamptz not null
updated_at timestamptz not null
```

### usage_counters

```sql
id uuid primary key
user_id uuid not null references users(id)
date date not null
ai_text_count int not null default 0
food_photo_count int not null default 0
fallback_model_count int not null default 0
deep_review_count int not null default 0
estimated_cost_cents int not null default 0
created_at timestamptz not null
updated_at timestamptz not null
unique(user_id, date)
```

This table is backend-only. It powers fair-use and cost controls; it should not be shown as a hard quota in subscription UI.

### chat_threads

```sql
id uuid primary key
user_id uuid not null references users(id)
title text not null
kind text not null -- general, food, craving, workout, weekly_plan
created_at timestamptz not null
updated_at timestamptz not null
archived_at timestamptz
```

### chat_messages

```sql
id uuid primary key
thread_id uuid not null references chat_threads(id)
user_id uuid not null references users(id)
role text not null -- user, assistant, system
message_type text not null -- text, image, food_analysis, workout_analysis, safety
content_text text
image_object_key text
structured_json jsonb
model_provider text
model_name text
created_at timestamptz not null
```

### food_logs

```sql
id uuid primary key
user_id uuid not null references users(id)
source_message_id uuid references chat_messages(id)
image_object_key text
meal_name text not null
calories_min int
calories_max int
protein_min numeric(6,2)
protein_max numeric(6,2)
carbs_min numeric(6,2)
carbs_max numeric(6,2)
fat_min numeric(6,2)
fat_max numeric(6,2)
confidence numeric(3,2)
status text not null -- pending, confirmed, edited, discarded
needs_follow_up boolean not null default false
follow_up_question text
user_portion_note text
model_provider text
model_name text
created_at timestamptz not null
updated_at timestamptz not null
```

### workout_logs

```sql
id uuid primary key
user_id uuid not null references users(id)
source_message_id uuid references chat_messages(id)
workout_type text not null
duration_minutes int
intensity text -- low, medium, high
calories_burned_min int
calories_burned_max int
status text not null -- pending, confirmed, edited, discarded
created_at timestamptz not null
updated_at timestamptz not null
```

### checkins

```sql
id uuid primary key
user_id uuid not null references users(id)
weight_kg numeric(5,2)
hunger_level int
mood_level int
craving_level int
notes text
created_at timestamptz not null
```

### memory_items

```sql
id uuid primary key
user_id uuid not null references users(id)
kind text not null -- preference, behavior, weekly_summary, risk_note
content text not null
source text not null -- onboarding, chat, records, weekly_review
retention_until timestamptz
created_at timestamptz not null
updated_at timestamptz not null
```

### safety_events

```sql
id uuid primary key
user_id uuid references users(id)
source_message_id uuid references chat_messages(id)
risk_type text not null
severity text not null -- low, medium, high, crisis
action_taken text not null
metadata_json jsonb not null default '{}'
created_at timestamptz not null
```

### notification_preferences

```sql
user_id uuid primary key references users(id)
morning_weight_enabled boolean not null default true
meal_logging_enabled boolean not null default true
evening_summary_enabled boolean not null default true
craving_reminder_enabled boolean not null default false
quiet_hours_start time
quiet_hours_end time
updated_at timestamptz not null
```

### ai_model_calls

```sql
id uuid primary key
user_id uuid references users(id)
provider text not null
model_name text not null
purpose text not null -- chat, food_photo, workout, weekly_review, safety
status text not null -- success, failed, fallback_used
latency_ms int
input_tokens int
output_tokens int
estimated_cost_cents int
error_code text
created_at timestamptz not null
```

## API Contract v0.2

Base path:

```text
/v1
```

Auth header:

```text
Authorization: Bearer <access_token>
```

### Auth

#### POST /v1/auth/register

Request:

```json
{
  "identifier": "jiang@example.com",
  "password": "string",
  "display_name": "jason xu"
}
```

Response:

```json
{
  "access_token": "string",
  "refresh_token": "string",
  "expires_at": "2026-05-07T00:00:00Z",
  "user": {
    "id": "uuid",
    "display_name": "jason xu",
    "email": "jiang@example.com",
    "phone": null
  }
}
```

#### POST /v1/auth/login

Same response as register.

#### POST /v1/auth/password-reset/request

Request:

```json
{
  "identifier": "jiang@example.com"
}
```

Response:

```json
{
  "sent": true
}
```

#### POST /v1/auth/password-reset/confirm

Request:

```json
{
  "reset_token": "string",
  "new_password": "string"
}
```

Response:

```json
{
  "ok": true
}
```

### Me And Profile

#### GET /v1/me

Response:

```json
{
  "user": {
    "id": "uuid",
    "display_name": "jason xu",
    "email": "jiang@example.com",
    "phone": "+17789188632"
  },
  "profile": {
    "height_cm": 175,
    "current_weight_kg": 72,
    "age": 23,
    "sex": "female",
    "goal_label": "婚纱减脂阶段",
    "goal_weight_kg": null,
    "goal_date": null,
    "food_preferences": {
      "likes": ["辣", "重口"],
      "constraints": ["控油"]
    },
    "training_baseline": {
      "frequency": "几乎每天",
      "duration_minutes": 120,
      "types": ["有氧", "无氧", "塑形"]
    }
  },
  "subscription": {
    "plan": "pro",
    "status": "active"
  }
}
```

#### PATCH /v1/me/profile

Updates body data, goal, food preference, and training baseline.

#### POST /v1/me/onboarding

Creates or replaces the initial profile and risk screen.

### Subscription

#### GET /v1/subscription

Response:

```json
{
  "plan": "pro",
  "status": "active",
  "renews_at": "2026-06-07T00:00:00Z",
  "entitlements": {
    "automatic_recording": true,
    "memory_retention": "extended",
    "priority_analysis": true
  }
}
```

#### POST /v1/subscription/checkout

For App Store MVP, this can return product IDs and server expected metadata. Actual purchase happens client-side through StoreKit.

#### POST /v1/subscription/restore

Validates restored receipts and refreshes backend subscription status.

#### POST /v1/webhooks/app-store

Receives App Store Server Notifications. Requires signature validation.

### Chat

#### GET /v1/chat/threads

Returns drawer conversation list.

#### POST /v1/chat/threads

Creates a new conversation.

#### GET /v1/chat/threads/{thread_id}/messages

Returns messages for one thread.

#### POST /v1/chat/messages

Text chat request.

Request:

```json
{
  "thread_id": "uuid",
  "text": "训练后很饿，想吃甜品",
  "context": {
    "local_time": "2026-05-07T21:30:00-07:00"
  }
}
```

Response:

```json
{
  "message": {
    "id": "uuid",
    "role": "assistant",
    "message_type": "text",
    "content_text": "先别硬扛。你今天训练消耗大，先喝水等 10 分钟..."
  },
  "created_records": []
}
```

#### POST /v1/chat/photo

Multipart request:

- `thread_id`
- `image`
- optional `user_note`

Response:

```json
{
  "assistant_message": {
    "id": "uuid",
    "message_type": "food_analysis",
    "content_text": "这份石锅拌饭能吃，但今天下一餐要压低油和主食。"
  },
  "food_analysis": {
    "food_log_id": "uuid",
    "meal_name": "韩式石锅拌饭",
    "calories_range_kcal": [600, 900],
    "protein_g_range": [25, 40],
    "carbs_g_range": [70, 100],
    "fat_g_range": [18, 35],
    "confidence": 0.7,
    "status": "pending",
    "needs_follow_up": false,
    "follow_up_question": null,
    "model_provider": "xiaomi",
    "model_name": "mimo-v2-omni"
  }
}
```

Auto-record rules:

- Free: do not create `food_logs` until user confirms.
- Pro: create `food_logs.status=pending`.
- Elite: create `pending`; later can auto-confirm high-confidence results if explicitly enabled.

### Food Logs

#### GET /v1/food/logs?date=YYYY-MM-DD

Returns food logs for one day.

#### POST /v1/food/logs/{id}/confirm

Confirms an AI-created pending record.

#### PATCH /v1/food/logs/{id}

Edits portion, calories, macros, or meal name.

#### POST /v1/food/logs/{id}/discard

Marks a pending record as discarded.

#### DELETE /v1/food/logs/{id}/photo

Deletes only the photo object while preserving optional text nutrition record.

### Workout Logs

#### POST /v1/workouts/analyze

Analyzes workout text and creates a pending workout log for paid users.

#### POST /v1/workouts/logs/{id}/confirm

Confirms workout log.

#### PATCH /v1/workouts/logs/{id}

Edits workout log.

### Records

#### GET /v1/records/today

Response:

```json
{
  "date": "2026-05-07",
  "calories_range_kcal": [1280, 1560],
  "protein_floor_g": 82,
  "weight_kg": 72,
  "hunger_score": 6,
  "food_logs": [],
  "workout_logs": [],
  "ai_summary": "今天执行力很好，晚餐主食减半，训练后优先补蛋白。"
}
```

#### POST /v1/checkins

Creates weight, hunger, mood, or craving check-in.

### Privacy And Safety

#### GET /v1/privacy/export

Returns a downloadable account export job.

#### DELETE /v1/me

Soft-deletes account and schedules data deletion.

#### DELETE /v1/me/photos

Deletes all stored food photos.

#### GET /v1/safety/disclaimer

Returns current safety disclaimer copy.

### Notifications

#### GET /v1/notifications/preferences

#### PATCH /v1/notifications/preferences

### Admin

Admin endpoints must be behind separate admin auth.

```text
GET /v1/admin/metrics
GET /v1/admin/model-usage
GET /v1/admin/safety-events
GET /v1/admin/users/{user_id}/timeline
```

## AI Pipeline

### Food Photo Pipeline

1. Authenticate user.
2. Verify subscription and fair-use.
3. Store image in object storage.
4. Create chat message with `message_type=image`.
5. Run safety pre-check if text note suggests risk.
6. Call Xiaomi MiMo.
7. Validate model JSON against schema.
8. Retry Xiaomi once if transport or malformed JSON.
9. Fallback to Qwen if Xiaomi fails twice or confidence is too low.
10. Normalize result into `food_logs`.
11. Create assistant message.
12. Return analysis card data to app.

### Required Model JSON

```json
{
  "meal_name": "string",
  "detected_items": ["string"],
  "calories_range_kcal": [0, 0],
  "protein_g_range": [0, 0],
  "carbs_g_range": [0, 0],
  "fat_g_range": [0, 0],
  "confidence": 0.0,
  "needs_follow_up": true,
  "follow_up_question": "string|null",
  "fat_loss_advice": "string",
  "supportive_reply": "string",
  "safety_flags": []
}
```

Validation rules:

- `confidence` must be 0-1.
- Ranges must have min <= max.
- Image-only calories are always ranges, never exact values.
- If the meal is shared or ambiguous, `needs_follow_up=true`.
- If JSON is invalid, retry or fallback; do not invent missing nutrition data silently.

## Entitlement Rules

### Free

- Manual logging.
- Basic chat.
- Memory retention: 7 days.
- Food photo analysis can be limited server-side.
- No auto-created records until user taps confirm/log.

### Pro

- High-frequency usage with fair-use protection.
- Auto-create pending food/workout records.
- Weekly summary.
- Extended memory.

### Elite

- High-volume image/chat usage with fair-use protection.
- Stronger review workflows.
- Wedding/photo-shoot plan.
- Future: high-confidence auto-confirm.

## Error Contract

All API errors should use:

```json
{
  "error": {
    "code": "subscription_required",
    "message": "Upgrade required for automatic records.",
    "request_id": "uuid"
  }
}
```

Common codes:

- `unauthorized`
- `validation_error`
- `subscription_required`
- `fair_use_review`
- `model_unavailable`
- `invalid_model_output`
- `image_too_large`
- `safety_redirect`
- `not_found`

## Security Notes

- Never ship provider API keys in the mobile app.
- Upload photos through authenticated backend endpoints or short-lived signed URLs.
- Encrypt secrets with the deployment provider's secret manager.
- Redact user health data from provider logs where possible.
- Use separate admin auth and audit logs.
- Store password hashes with Argon2id or bcrypt.
- Validate App Store server notifications before changing subscription state.

## MVP Acceptance Criteria

- Mobile can register, log in, restore session, and reset password.
- Onboarding writes profile and risk data.
- Chat can send text and food photo.
- Xiaomi result returns valid normalized JSON.
- Qwen fallback works when Xiaomi fails.
- Pro creates pending food logs automatically.
- Free requires manual confirmation before food log creation.
- Records today endpoint returns calorie range, protein floor, weight, hunger, food logs, workout logs, and AI summary.
- User can confirm, edit, and discard AI-created records.
- Safety events are logged for extreme dieting, purging/laxatives, self-harm, and medical-risk requests.
- Admin can see model usage, fallback rate, estimated cost, and safety events.
