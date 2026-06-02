import re
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
FILE_DOCUMENT_TYPES = {"body_report", "menu", "workout_plan", "general"}
FILE_INSIGHT_LABELS = {
    "document_type",
    "weight_kg",
    "bmi",
    "body_fat_percent",
    "protein_g",
    "calories_kcal",
    "training_frequency",
}
WORKOUT_TYPES = {"running", "strength", "cardio_plus_strength", "mixed", "mobility", "sports"}
WORKOUT_INTENSITIES = {"low", "medium", "high"}


class FoodVisionSchemaError(ValueError):
    pass


class FileInsightSchemaError(ValueError):
    pass


class WorkoutAnalysisSchemaError(ValueError):
    pass


def validate_food_analysis(raw: object) -> dict[str, Any]:
    if not isinstance(raw, dict):
        raise FoodVisionSchemaError("analysis_must_be_object")
    raw = dict(raw)
    missing = REQUIRED_FIELDS - set(raw)
    if missing:
        raise FoodVisionSchemaError(f"missing_fields:{','.join(sorted(missing))}")

    for field in RANGE_FIELDS:
        value = _coerce_numeric_range(raw[field])
        raw[field] = value
        if not isinstance(value, list) or len(value) != 2:
            raise FoodVisionSchemaError(f"{field}_must_be_range")
        if not all(isinstance(item, int | float) for item in value):
            raise FoodVisionSchemaError(f"{field}_must_be_numeric")
        if value[0] > value[1]:
            raise FoodVisionSchemaError(f"{field}_min_gt_max")

    confidence = _coerce_confidence(raw["confidence"])
    if confidence is None:
        raise FoodVisionSchemaError("confidence_out_of_range")
    raw["confidence"] = confidence
    if not isinstance(raw["meal_name"], str) or not raw["meal_name"].strip():
        raise FoodVisionSchemaError("meal_name_required")
    raw["detected_items"] = _coerce_string_list(raw["detected_items"])
    if not isinstance(raw["detected_items"], list):
        raise FoodVisionSchemaError("detected_items_must_be_list")
    raw["needs_follow_up"] = _coerce_bool(raw["needs_follow_up"])
    if not isinstance(raw["needs_follow_up"], bool):
        raise FoodVisionSchemaError("needs_follow_up_must_be_bool")
    if raw["follow_up_question"] == "":
        raw["follow_up_question"] = None
    if raw["follow_up_question"] is not None and not isinstance(raw["follow_up_question"], str):
        raise FoodVisionSchemaError("follow_up_question_invalid")
    if not isinstance(raw["fat_loss_advice"], str):
        raise FoodVisionSchemaError("fat_loss_advice_required")
    if not isinstance(raw["supportive_reply"], str):
        raise FoodVisionSchemaError("supportive_reply_required")
    raw["safety_flags"] = _coerce_string_list(raw["safety_flags"])
    if not isinstance(raw["safety_flags"], list):
        raise FoodVisionSchemaError("safety_flags_must_be_list")

    return dict(raw)


def validate_food_batch_analysis(raw: object, photo_count: int | None = None) -> dict[str, Any]:
    if not isinstance(raw, dict):
        raise FoodVisionSchemaError("batch_analysis_must_be_object")
    analyses = raw.get("food_analyses")
    if not isinstance(analyses, list) or not analyses:
        raise FoodVisionSchemaError("food_analyses_required")
    normalized_analyses = [validate_food_analysis(item) for item in analyses[:5]]
    groups = raw.get("groups")
    normalized_groups = _coerce_food_groups(groups, len(normalized_analyses), photo_count)
    if not normalized_groups:
        normalized_groups = [
            {
                "group_id": str(item.get("meal_name") or f"meal-{index + 1}"),
                "analysis_indexes": [index],
                "source_photo_indexes": [index],
                "meal_name": str(item.get("meal_name") or "餐食"),
            }
            for index, item in enumerate(normalized_analyses)
        ]
    return {
        "food_analyses": normalized_analyses,
        "groups": normalized_groups,
    }


def _coerce_food_groups(value: object, analysis_count: int, photo_count: int | None = None) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    groups: list[dict[str, Any]] = []
    for index, group in enumerate(value[:analysis_count]):
        if not isinstance(group, dict):
            continue
        raw_indexes = group.get("analysis_indexes")
        if not isinstance(raw_indexes, list):
            continue
        indexes = [
            int(item)
            for item in raw_indexes
            if isinstance(item, int) and not isinstance(item, bool) and 0 <= item < analysis_count
        ]
        raw_photo_indexes = group.get("source_photo_indexes")
        if not isinstance(raw_photo_indexes, list):
            raw_photo_indexes = group.get("photo_indexes")
        photo_limit = photo_count if isinstance(photo_count, int) and photo_count > 0 else analysis_count
        source_photo_indexes = [
            int(item)
            for item in (raw_photo_indexes if isinstance(raw_photo_indexes, list) else raw_indexes)
            if isinstance(item, int) and not isinstance(item, bool) and 0 <= item < photo_limit
        ]
        if not indexes and source_photo_indexes:
            indexes = [min(index, analysis_count - 1)]
        if not indexes:
            continue
        meal_name = group.get("meal_name")
        group_id = group.get("group_id") or meal_name or f"group-{index + 1}"
        groups.append({
            "group_id": str(group_id),
            "analysis_indexes": sorted(set(indexes)),
            "source_photo_indexes": sorted(set(source_photo_indexes or indexes)),
            "meal_name": str(meal_name or group_id),
        })
    return groups


def _coerce_numeric_range(value: object) -> object:
    if isinstance(value, str):
        numbers = re.findall(r"\d+(?:\.\d+)?", value.replace("–", "-").replace("—", "-"))
        if len(numbers) >= 2:
            return [float(numbers[0]), float(numbers[1])]
        if len(numbers) == 1:
            parsed = float(numbers[0])
            return [parsed, parsed]
    return value


def _coerce_confidence(value: object) -> float | None:
    if isinstance(value, str):
        stripped = value.strip().replace("%", "")
        try:
            value = float(stripped)
        except ValueError:
            return None
    if not isinstance(value, int | float):
        return None
    parsed = float(value)
    if 0 <= parsed <= 1:
        return round(parsed, 2)
    if 1 < parsed <= 100:
        return round(parsed / 100, 2)
    return None


def _coerce_string_list(value: object) -> object:
    if value is None:
        return []
    if isinstance(value, str):
        return [item.strip() for item in re.split(r"[,;，；]\s*", value) if item.strip()]
    return value


def _coerce_bool(value: object) -> object:
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"true", "yes", "1"}:
            return True
        if normalized in {"false", "no", "0"}:
            return False
    return value


def validate_file_insights(raw: object) -> dict[str, Any]:
    if not isinstance(raw, dict):
        raise FileInsightSchemaError("file_insights_must_be_object")
    document_type = raw.get("document_type")
    if document_type not in FILE_DOCUMENT_TYPES:
        raise FileInsightSchemaError("document_type_invalid")
    insights = raw.get("insights")
    if not isinstance(insights, list):
        raise FileInsightSchemaError("insights_must_be_list")
    overall_confidence = raw.get("confidence", 0.7)
    if not isinstance(overall_confidence, int | float) or overall_confidence < 0 or overall_confidence > 1:
        raise FileInsightSchemaError("confidence_invalid")

    normalized_insights: list[dict[str, Any]] = []
    for item in insights[:8]:
        if not isinstance(item, dict):
            raise FileInsightSchemaError("insight_must_be_object")
        label = item.get("label")
        value = item.get("value")
        source = item.get("source", "ai")
        source_text = item.get("source_text") or item.get("sourceText") or ""
        confidence = item.get("confidence", overall_confidence)
        if not isinstance(confidence, int | float) or confidence < 0 or confidence > 1:
            raise FileInsightSchemaError("insight_confidence_invalid")
        if label not in FILE_INSIGHT_LABELS:
            continue
        if not isinstance(value, str) or not value.strip():
            continue
        normalized_insights.append({
            "label": label,
            "value": value.strip(),
            "source": str(source or "ai"),
            "source_text": str(source_text).strip()[:240],
            "confidence": round(float(confidence), 2),
        })
    if not any(item["label"] == "document_type" for item in normalized_insights):
        normalized_insights.insert(0, {
            "label": "document_type",
            "value": document_type,
            "source": "ai",
            "source_text": "",
            "confidence": round(float(overall_confidence), 2),
        })

    recommendations = raw.get("recommendations", [])
    if not isinstance(recommendations, list):
        raise FileInsightSchemaError("recommendations_must_be_list")
    normalized_recommendations = [str(item).strip() for item in recommendations if str(item).strip()][:4]

    return {
        "schema_version": 1,
        "document_type": document_type,
        "confidence": round(float(overall_confidence), 2),
        "insights": normalized_insights,
        "recommendations": normalized_recommendations,
    }


def validate_workout_analysis(raw: object) -> dict[str, Any]:
    if not isinstance(raw, dict):
        raise WorkoutAnalysisSchemaError("workout_analysis_must_be_object")
    workout_type = raw.get("workout_type")
    if workout_type not in WORKOUT_TYPES:
        raise WorkoutAnalysisSchemaError("workout_type_invalid")
    duration = raw.get("duration_minutes")
    if not isinstance(duration, int) or duration < 0 or duration > 600:
        raise WorkoutAnalysisSchemaError("duration_minutes_invalid")
    intensity = raw.get("intensity")
    if intensity not in WORKOUT_INTENSITIES:
        raise WorkoutAnalysisSchemaError("intensity_invalid")
    calories = raw.get("calories_burned_range_kcal")
    if not isinstance(calories, list) or len(calories) != 2:
        raise WorkoutAnalysisSchemaError("calories_burned_range_kcal_invalid")
    if not all(isinstance(item, int | float) for item in calories):
        raise WorkoutAnalysisSchemaError("calories_burned_range_kcal_invalid")
    if calories[0] > calories[1]:
        raise WorkoutAnalysisSchemaError("calories_burned_range_kcal_min_gt_max")
    confidence = raw.get("confidence", 0.7)
    if not isinstance(confidence, int | float) or confidence < 0 or confidence > 1:
        raise WorkoutAnalysisSchemaError("confidence_invalid")
    summary = raw.get("summary", "")
    if summary is not None and not isinstance(summary, str):
        raise WorkoutAnalysisSchemaError("summary_invalid")

    return {
        "workout_type": workout_type,
        "duration_minutes": duration,
        "intensity": intensity,
        "calories_burned_range_kcal": [round(calories[0]), round(calories[1])],
        "confidence": confidence,
        "summary": summary or "",
    }
