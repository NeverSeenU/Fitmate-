from app.repositories.protocols import (
    AuthRepository,
    ChatRepository,
    CheckinRepository,
    FoodLogRepository,
    ProfileRepository,
    SafetyEventRepository,
    SubscriptionRepository,
    WorkoutLogRepository,
)
from app.services.auth_service import InMemoryAuthStore
from app.services.chat_service import InMemoryChatStore
from app.services.food_service import InMemoryFoodLogStore
from app.services.profile_service import InMemoryProfileStore
from app.services.records_service import InMemoryCheckinStore
from app.services.safety_service import InMemorySafetyEventStore
from app.services.subscription_service import InMemorySubscriptionStore
from app.services.workout_service import InMemoryWorkoutLogStore


def test_in_memory_stores_satisfy_repository_protocols() -> None:
    assert isinstance(InMemoryAuthStore(), AuthRepository)
    assert isinstance(InMemoryProfileStore(), ProfileRepository)
    assert isinstance(InMemorySubscriptionStore(), SubscriptionRepository)
    assert isinstance(InMemoryChatStore(), ChatRepository)
    assert isinstance(InMemoryFoodLogStore(), FoodLogRepository)
    assert isinstance(InMemoryWorkoutLogStore(), WorkoutLogRepository)
    assert isinstance(InMemoryCheckinStore(), CheckinRepository)
    assert isinstance(InMemorySafetyEventStore(), SafetyEventRepository)
