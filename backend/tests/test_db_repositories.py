from datetime import datetime, timezone
from decimal import Decimal
import uuid

from app.db.session import SessionLocal
from app.repositories.protocols import (
    AuthRepository,
    ChatRepository,
    CheckinRepository,
    FoodLogRepository,
    ModelCallRepository,
    ProfileRepository,
    SafetyEventRepository,
    SubscriptionRepository,
    WorkoutLogRepository,
)
from app.repositories.sqlalchemy.auth import SqlAlchemyAuthRepository
from app.repositories.sqlalchemy.chat import SqlAlchemyChatRepository
from app.repositories.sqlalchemy.model_calls import SqlAlchemyModelCallRepository, StoredAiModelCall
from app.repositories.sqlalchemy.records import (
    SqlAlchemyCheckinRepository,
    SqlAlchemyFoodLogRepository,
    SqlAlchemySafetyEventRepository,
    SqlAlchemyWorkoutLogRepository,
)
from app.repositories.sqlalchemy.profile import SqlAlchemyProfileRepository
from app.repositories.sqlalchemy.subscription import SqlAlchemySubscriptionRepository
from app.services.chat_service import StoredMessage
from app.services.food_service import StoredFoodLog
from app.services.records_service import StoredCheckin
from app.services.safety_service import StoredSafetyEvent
from app.services.subscription_service import StoredSubscription
from app.services.workout_service import StoredWorkoutLog


def unique_email(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4()}@example.com"


def test_sqlalchemy_auth_repository_creates_and_updates_user() -> None:
    with SessionLocal() as session:
        repo = SqlAlchemyAuthRepository(session)
        assert isinstance(repo, AuthRepository)
        email = unique_email("db-auth")

        user = repo.create_user(email=email, password_hash="hash-v1", display_name="DB Auth")
        session.commit()

        by_email = repo.get_user_by_email(email.upper())
        by_id = repo.get_user_by_id(user.id)
        assert by_email is not None
        assert by_email.id == user.id
        assert by_id is not None
        assert by_id.email == email

        assert repo.update_password(email, "hash-v2") is True
        session.commit()
        assert repo.get_user_by_email(email).password_hash == "hash-v2"
        assert repo.update_password(unique_email("missing"), "hash") is False


def test_sqlalchemy_profile_repository_upserts_private_body_data() -> None:
    with SessionLocal() as session:
        auth_repo = SqlAlchemyAuthRepository(session)
        profile_repo = SqlAlchemyProfileRepository(session)
        assert isinstance(profile_repo, ProfileRepository)
        user = auth_repo.create_user(unique_email("db-profile"), "hash", "Profile")
        session.commit()

        created = profile_repo.upsert(
            user.id,
            {
                "height_cm": Decimal("175"),
                "current_weight_kg": Decimal("72.5"),
                "age": 23,
                "sex": "female",
                "goal_label": "wedding fat loss",
                "food_preferences": {"likes": ["spicy"]},
                "training_baseline": {"duration_minutes": 120},
                "risk_flags": {"medical_review": False},
            },
        )
        session.commit()

        assert created.current_weight_kg == Decimal("72.5")
        assert profile_repo.get(user.id).food_preferences == {"likes": ["spicy"]}

        updated = profile_repo.upsert(user.id, {"current_weight_kg": Decimal("71.8")})
        session.commit()
        assert updated.current_weight_kg == Decimal("71.8")
        assert updated.height_cm == Decimal("175.00")


def test_sqlalchemy_subscription_repository_defaults_and_saves_plan() -> None:
    with SessionLocal() as session:
        auth_repo = SqlAlchemyAuthRepository(session)
        subscription_repo = SqlAlchemySubscriptionRepository(session)
        assert isinstance(subscription_repo, SubscriptionRepository)
        user = auth_repo.create_user(unique_email("db-sub"), "hash", "Sub")
        session.commit()

        default_subscription = subscription_repo.get(user.id)
        assert default_subscription.plan == "free"
        assert default_subscription.status == "active"

        saved = subscription_repo.save(
            StoredSubscription(
                user_id=user.id,
                plan="pro",
                status="active",
                provider="app_store",
                provider_subscription_id="fitmate.pro.monthly",
                renews_at=datetime.now(timezone.utc),
            )
        )
        session.commit()

        loaded = subscription_repo.get(user.id)
        assert saved.plan == "pro"
        assert loaded.plan == "pro"
        assert loaded.provider_subscription_id == "fitmate.pro.monthly"


def test_sqlalchemy_chat_repository_persists_threads_and_messages() -> None:
    with SessionLocal() as session:
        auth_repo = SqlAlchemyAuthRepository(session)
        chat_repo = SqlAlchemyChatRepository(session)
        assert isinstance(chat_repo, ChatRepository)
        user = auth_repo.create_user(unique_email("db-chat"), "hash", "Chat")
        other_user = auth_repo.create_user(unique_email("db-chat-other"), "hash", "Other")
        session.commit()

        thread = chat_repo.create_thread(user.id, title="今日饮食分析", kind="food")
        other_thread = chat_repo.create_thread(other_user.id, title="Other", kind="food")
        session.commit()

        message = chat_repo.add_message(
            StoredMessage(
                id=str(uuid.uuid4()),
                thread_id=thread.id,
                user_id=user.id,
                role="assistant",
                message_type="text",
                content_text="先记录，再调整。",
                structured_json={"source": "test"},
                model_provider="mock",
                model_name="fitmate-contract-mock",
            )
        )
        session.commit()

        assert chat_repo.get_thread(user.id, thread.id).title == "今日饮食分析"
        assert chat_repo.get_thread(user.id, other_thread.id) is None
        assert [item.id for item in chat_repo.list_threads(user.id)] == [thread.id]

        messages = chat_repo.list_messages(thread.id)
        assert len(messages) == 1
        assert messages[0].id == message.id
        assert messages[0].structured_json == {"source": "test"}


def test_sqlalchemy_food_and_workout_repositories_persist_user_scoped_logs() -> None:
    with SessionLocal() as session:
        auth_repo = SqlAlchemyAuthRepository(session)
        food_repo = SqlAlchemyFoodLogRepository(session)
        workout_repo = SqlAlchemyWorkoutLogRepository(session)
        assert isinstance(food_repo, FoodLogRepository)
        assert isinstance(workout_repo, WorkoutLogRepository)
        user = auth_repo.create_user(unique_email("db-logs"), "hash", "Logs")
        other_user = auth_repo.create_user(unique_email("db-logs-other"), "hash", "Other")
        session.commit()

        food = food_repo.create(
            StoredFoodLog(
                id=str(uuid.uuid4()),
                user_id=user.id,
                source_message_id=None,
                image_object_key="food-photos/test.jpg",
                meal_name="石锅拌饭",
                calories_range_kcal=[600, 900],
                protein_g_range=[25, 40],
                carbs_g_range=[70, 100],
                fat_g_range=[18, 35],
                confidence=0.72,
                status="pending",
                needs_follow_up=False,
                follow_up_question=None,
                model_provider="xiaomi",
                model_name="mimo-v2-omni",
            )
        )
        workout = workout_repo.create(
            StoredWorkoutLog(
                id=str(uuid.uuid4()),
                user_id=user.id,
                workout_type="cardio_plus_strength",
                duration_minutes=80,
                intensity="high",
                calories_burned_range_kcal=[360, 560],
                status="pending",
            )
        )
        session.commit()

        assert food_repo.get_for_user(user.id, food.id).meal_name == "石锅拌饭"
        assert food_repo.get_for_user(other_user.id, food.id) is None
        assert food_repo.list_for_user(user.id)[0].calories_range_kcal == [600, 900]
        food.status = "confirmed"
        assert food_repo.save(food).status == "confirmed"

        assert workout_repo.get_for_user(user.id, workout.id).duration_minutes == 80
        assert workout_repo.get_for_user(other_user.id, workout.id) is None
        assert workout_repo.list_for_user(user.id)[0].calories_burned_range_kcal == [360, 560]
        workout.status = "confirmed"
        assert workout_repo.save(workout).status == "confirmed"


def test_sqlalchemy_checkin_and_safety_repositories_persist_events() -> None:
    with SessionLocal() as session:
        auth_repo = SqlAlchemyAuthRepository(session)
        checkin_repo = SqlAlchemyCheckinRepository(session)
        safety_repo = SqlAlchemySafetyEventRepository(session)
        assert isinstance(checkin_repo, CheckinRepository)
        assert isinstance(safety_repo, SafetyEventRepository)
        user = auth_repo.create_user(unique_email("db-safety"), "hash", "Safety")
        session.commit()

        checkin = checkin_repo.create(
            StoredCheckin(
                id=str(uuid.uuid4()),
                user_id=user.id,
                weight_kg=Decimal("71.6"),
                hunger_level=7,
                mood_level=5,
                craving_level=8,
                notes="training day",
            )
        )
        event = safety_repo.create(
            StoredSafetyEvent(
                id=str(uuid.uuid4()),
                user_id=user.id,
                risk_type="purging_or_laxative",
                severity="high",
                action_taken="supportive_safety_redirect",
                metadata={"matched_terms": ["催吐"]},
            )
        )
        session.commit()

        assert checkin_repo.list_for_user(user.id)[0].id == checkin.id
        assert safety_repo.list_events()[0].id == event.id
        assert safety_repo.list_events()[0].metadata == {"matched_terms": ["催吐"]}


def test_sqlalchemy_model_call_repository_persists_usage_metrics() -> None:
    with SessionLocal() as session:
        auth_repo = SqlAlchemyAuthRepository(session)
        model_call_repo = SqlAlchemyModelCallRepository(session)
        assert isinstance(model_call_repo, ModelCallRepository)
        user = auth_repo.create_user(unique_email("db-model-call"), "hash", "Model Call")
        session.commit()

        created = model_call_repo.create(
            StoredAiModelCall(
                id=str(uuid.uuid4()),
                user_id=user.id,
                provider="xiaomi",
                model_name="mimo-v2-omni",
                purpose="food_photo",
                status="success",
                latency_ms=1200,
                input_tokens=900,
                output_tokens=300,
                estimated_cost_cents=3,
            )
        )
        model_call_repo.create(
            StoredAiModelCall(
                id=str(uuid.uuid4()),
                user_id=user.id,
                provider="qwen",
                model_name="qwen3-vl-plus",
                purpose="fallback",
                status="success",
                estimated_cost_cents=5,
            )
        )
        session.commit()

        recent = model_call_repo.list_recent(limit=2)
        metrics = model_call_repo.metrics()
        assert any(call.id == created.id for call in recent)
        assert metrics["total_calls"] >= 2
        assert metrics["estimated_cost_cents"] >= 8
        assert metrics["by_provider"]["xiaomi"] >= 1
