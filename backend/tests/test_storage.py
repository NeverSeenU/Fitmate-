from app.services.chat_service import ChatService, InMemoryChatStore
from app.services.food_service import FoodService, InMemoryFoodLogStore
from app.services.privacy_service import PrivacyService
from app.services.subscription_service import InMemorySubscriptionStore, SubscriptionService
from app.storage.local import LocalObjectStorage


VISION_ANALYSIS = {
    "meal_name": "test meal",
    "detected_items": ["rice"],
    "calories_range_kcal": [300, 400],
    "protein_g_range": [10, 15],
    "carbs_g_range": [45, 55],
    "fat_g_range": [8, 12],
    "confidence": 0.8,
    "needs_follow_up": False,
    "follow_up_question": None,
    "fat_loss_advice": "keep protein steady",
    "supportive_reply": "logged",
    "safety_flags": [],
    "model_provider": "test",
    "model_name": "fake-vision",
}


class FakeVisionRouter:
    def analyze_food_photo(
        self,
        image_bytes: bytes,
        user_note: str | None = None,
        user_id: str | None = None,
    ) -> dict:
        return dict(VISION_ANALYSIS)


class FailingVisionRouter:
    def analyze_food_photo(
        self,
        image_bytes: bytes,
        user_note: str | None = None,
        user_id: str | None = None,
    ) -> dict:
        raise RuntimeError("provider_timeout")


def test_local_object_storage_saves_and_deletes_bytes() -> None:
    storage = LocalObjectStorage()

    stored = storage.put(
        key="food-photos/user-1/photo.jpg",
        content=b"fake-image",
        content_type="image/jpeg",
    )

    assert stored.object_key == "food-photos/user-1/photo.jpg"
    assert storage.get_bytes(stored.object_key) == b"fake-image"

    assert storage.delete(stored.object_key) is True
    assert storage.get_bytes(stored.object_key) is None
    assert storage.delete(stored.object_key) is False


def test_food_photo_upload_uses_storage_boundary_and_logs_only_object_key() -> None:
    chat = ChatService(store=InMemoryChatStore())
    subscription = SubscriptionService(store=InMemorySubscriptionStore())
    food_logs = InMemoryFoodLogStore()
    storage = LocalObjectStorage()
    service = FoodService(
        store=food_logs,
        chat_service_dependency=chat,
        subscription_service_dependency=subscription,
        storage=storage,
    )
    user_id = "user-1"
    subscription.restore_app_store_purchase(
        user_id=user_id,
        provider="app_store",
        product_id="fitmate.pro.monthly",
        receipt="dev-receipt",
    )
    thread = chat.create_thread(user_id=user_id, title="food", kind="food")

    response = service.analyze_photo(
        user_id=user_id,
        thread_id=thread["id"],
        image_bytes=b"fake-image",
        image_filename="photo.jpg",
        image_content_type="image/jpeg",
        user_note=None,
        vision_router=FakeVisionRouter(),
    )

    food_log_id = response["food_analysis"]["food_log_id"]
    log = food_logs.get_for_user(user_id, food_log_id)
    assert log is not None
    assert log.image_object_key is not None
    assert storage.get_bytes(log.image_object_key) == b"fake-image"
    assert log.image_object_key in chat.store.list_messages(thread["id"])[0].structured_json.values()
    assert not hasattr(log, "image_bytes")


def test_food_photo_upload_deletes_stored_object_when_vision_fails() -> None:
    chat = ChatService(store=InMemoryChatStore())
    subscription = SubscriptionService(store=InMemorySubscriptionStore())
    food_logs = InMemoryFoodLogStore()
    storage = LocalObjectStorage()
    service = FoodService(
        store=food_logs,
        chat_service_dependency=chat,
        subscription_service_dependency=subscription,
        storage=storage,
    )
    user_id = "user-1"
    thread = chat.create_thread(user_id=user_id, title="food", kind="food")

    try:
        service.analyze_photo(
            user_id=user_id,
            thread_id=thread["id"],
            image_bytes=b"fake-image",
            image_filename="photo.jpg",
            image_content_type="image/jpeg",
            user_note=None,
            vision_router=FailingVisionRouter(),
        )
    except RuntimeError as exc:
        assert str(exc) == "provider_timeout"
    else:
        raise AssertionError("vision failure must be raised")

    assert storage._objects == {}
    assert chat.store.list_messages(thread["id"]) == []
    assert food_logs.list_for_user(user_id) == []


def test_photo_deletion_placeholder_calls_storage_delete() -> None:
    chat = ChatService(store=InMemoryChatStore())
    subscription = SubscriptionService(store=InMemorySubscriptionStore())
    food_logs = InMemoryFoodLogStore()
    storage = LocalObjectStorage()
    food_service = FoodService(
        store=food_logs,
        chat_service_dependency=chat,
        subscription_service_dependency=subscription,
        storage=storage,
    )
    user_id = "user-1"
    subscription.restore_app_store_purchase(
        user_id=user_id,
        provider="app_store",
        product_id="fitmate.pro.monthly",
        receipt="dev-receipt",
    )
    thread = chat.create_thread(user_id=user_id, title="food", kind="food")
    created = food_service.analyze_photo(
        user_id=user_id,
        thread_id=thread["id"],
        image_bytes=b"fake-image",
        image_filename="photo.jpg",
        image_content_type="image/jpeg",
        user_note=None,
        vision_router=FakeVisionRouter(),
    )
    food_log = food_logs.get_for_user(user_id, created["food_analysis"]["food_log_id"])
    assert food_log is not None
    assert storage.get_bytes(food_log.image_object_key) == b"fake-image"

    response = PrivacyService(food_service_dependency=food_service).schedule_photo_deletion(user_id)

    assert response["status"] == "scheduled"
    assert response["scope"] == "food_photos"
    assert response["deleted_photo_count"] == 1
    assert storage.get_bytes(food_log.image_object_key) is None
