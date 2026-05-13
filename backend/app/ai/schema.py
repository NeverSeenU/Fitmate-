from typing import Any


REQUIRED_FIELDS = {
    "meal_name",
    "detected_items",
    "calories_range_kcal",
    "protein_g_range",
    "carbs_g_range",
    "fat_g_range",
    "confidence",
    "needs_follow_up",
    "follow_up_question",
    "fat_loss_advice",
    "supportive_reply",
    "safety_flags",
}

RANGE_FIELDS = [
    "calories_range_kcal",
    "protein_g_range",
    "carbs_g_range",
    "fat_g_range",
]


class FoodVisionSchemaError(ValueError):
    pass


def validate_food_analysis(raw: object) -> dict[str, Any]:
    if not isinstance(raw, dict):
        raise FoodVisionSchemaError("analysis_must_be_object")
    missing = REQUIRED_FIELDS - set(raw)
    if missing:
        raise FoodVisionSchemaError(f"missing_fields:{','.join(sorted(missing))}")

    for field in RANGE_FIELDS:
        value = raw[field]
        if not isinstance(value, list) or len(value) != 2:
            raise FoodVisionSchemaError(f"{field}_must_be_range")
        if not all(isinstance(item, int | float) for item in value):
            raise FoodVisionSchemaError(f"{field}_must_be_numeric")
        if value[0] > value[1]:
            raise FoodVisionSchemaError(f"{field}_min_gt_max")

    confidence = raw["confidence"]
    if not isinstance(confidence, int | float) or confidence < 0 or confidence > 1:
        raise FoodVisionSchemaError("confidence_out_of_range")
    if not isinstance(raw["meal_name"], str) or not raw["meal_name"].strip():
        raise FoodVisionSchemaError("meal_name_required")
    if not isinstance(raw["detected_items"], list):
        raise FoodVisionSchemaError("detected_items_must_be_list")
    if not isinstance(raw["needs_follow_up"], bool):
        raise FoodVisionSchemaError("needs_follow_up_must_be_bool")
    if raw["follow_up_question"] is not None and not isinstance(raw["follow_up_question"], str):
        raise FoodVisionSchemaError("follow_up_question_invalid")
    if not isinstance(raw["fat_loss_advice"], str):
        raise FoodVisionSchemaError("fat_loss_advice_required")
    if not isinstance(raw["supportive_reply"], str):
        raise FoodVisionSchemaError("supportive_reply_required")
    if not isinstance(raw["safety_flags"], list):
        raise FoodVisionSchemaError("safety_flags_must_be_list")

    return dict(raw)
