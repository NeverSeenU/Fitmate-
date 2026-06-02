from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any
import uuid

from app.ai.router import ChatReplyRouter, TextFoodAnalysisRouter
from app.services.safety_service import SafetyService
from app.services.usage_service import usage_service


@dataclass
class StoredThread:
    id: str
    user_id: str
    title: str
    kind: str = "general"
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    archived_at: datetime | None = None


@dataclass
class StoredMessage:
    id: str
    thread_id: str
    user_id: str
    role: str
    message_type: str
    content_text: str | None = None
    image_object_key: str | None = None
    structured_json: dict[str, Any] | None = None
    model_provider: str | None = None
    model_name: str | None = None
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


class InMemoryChatStore:
    def __init__(self) -> None:
        self.threads_by_id: dict[str, StoredThread] = {}
        self.messages_by_thread_id: dict[str, list[StoredMessage]] = {}

    def create_thread(self, user_id: str, title: str, kind: str) -> StoredThread:
        thread = StoredThread(id=str(uuid.uuid4()), user_id=user_id, title=title, kind=kind)
        self.threads_by_id[thread.id] = thread
        self.messages_by_thread_id[thread.id] = []
        return thread

    def list_threads(self, user_id: str) -> list[StoredThread]:
        return sorted(
            [
                thread
                for thread in self.threads_by_id.values()
                if thread.user_id == user_id and thread.archived_at is None
            ],
            key=lambda thread: thread.updated_at,
            reverse=True,
        )

    def get_thread(self, user_id: str, thread_id: str) -> StoredThread | None:
        thread = self.threads_by_id.get(thread_id)
        if thread is None or thread.user_id != user_id or thread.archived_at is not None:
            return None
        return thread

    def add_message(self, message: StoredMessage) -> StoredMessage:
        self.messages_by_thread_id.setdefault(message.thread_id, []).append(message)
        thread = self.threads_by_id[message.thread_id]
        thread.updated_at = message.created_at
        return message

    def list_messages(self, thread_id: str) -> list[StoredMessage]:
        return self.messages_by_thread_id.get(thread_id, [])


class TextChatUnavailableError(RuntimeError):
    pass


class ChatService:
    def __init__(
        self,
        store: InMemoryChatStore | None = None,
        allow_contract_mocks: bool = True,
        usage_service_dependency=None,
        text_food_analysis_router: TextFoodAnalysisRouter | None = None,
        chat_reply_router: ChatReplyRouter | None = None,
        safety_service_dependency: SafetyService | None = None,
    ) -> None:
        self.store = store or InMemoryChatStore()
        self.allow_contract_mocks = allow_contract_mocks
        self.usage_service = usage_service_dependency or usage_service
        self.text_food_analysis_router = text_food_analysis_router
        self.chat_reply_router = chat_reply_router
        self.safety_service = safety_service_dependency

    def create_thread(self, user_id: str, title: str, kind: str) -> dict:
        return self._thread_response(self.store.create_thread(user_id, title, kind))

    def list_threads(self, user_id: str) -> dict:
        return {"threads": [self._thread_response(thread) for thread in self.store.list_threads(user_id)]}

    def list_messages(self, user_id: str, thread_id: str) -> dict | None:
        thread = self.store.get_thread(user_id, thread_id)
        if thread is None:
            return None
        return {
            "thread": self._thread_response(thread),
            "messages": [
                self._message_response(message)
                for message in self.store.list_messages(thread_id)
            ],
        }

    def send_text_message(self, user_id: str, thread_id: str, text: str, context: dict | None) -> dict | None:
        thread = self.store.get_thread(user_id, thread_id)
        if thread is None:
            return None
        safety_candidate = self._safety_candidate(text)
        recovery_candidate = self._recovery_candidate(text)
        if not safety_candidate and not self.allow_contract_mocks and self.text_food_analysis_router is None:
            raise TextChatUnavailableError("text_chat_provider_not_configured")
        self.usage_service.ensure_allowed(user_id, "chat")
        ai_reply = None if safety_candidate else self._ai_chat_reply(user_id=user_id, thread_id=thread_id, text=text, context=context)
        soul_reply = None if safety_candidate or ai_reply else self._recovery_soul_response(text, context)
        food_analysis = None if safety_candidate or recovery_candidate else self._text_food_analysis(user_id, text)
        if not self.allow_contract_mocks and food_analysis is None and soul_reply is None and not safety_candidate:
            raise TextChatUnavailableError("text_chat_provider_not_configured")
        user_message = self.store.add_message(
            StoredMessage(
                id=str(uuid.uuid4()),
                thread_id=thread_id,
                user_id=user_id,
                role="user",
                message_type="text",
                content_text=text,
                structured_json={"context": context or {}},
            )
        )
        safety_result = (
            self._safety_result(user_id=user_id, text=text, source_message_id=user_message.id)
            if safety_candidate
            else None
        )
        chat_reply_source = "ai" if ai_reply else "fallback" if soul_reply else "mock"
        assistant_text = (
            self._safety_redirect_response(safety_result)
            if safety_result
            else
            "我先把这顿生成一张可编辑食物卡片。你确认热量和份量后，再写入今日记录。"
            if food_analysis
            else self._clean_chat_reply_text((ai_reply or {}).get("content_text") or soul_reply or self._mock_ai_response(text))
        )
        assistant_message = self.store.add_message(
            StoredMessage(
                id=str(uuid.uuid4()),
                thread_id=thread_id,
                user_id=user_id,
                role="assistant",
                message_type="safety" if safety_result else "food_analysis" if food_analysis else "text",
                content_text=assistant_text,
                structured_json=(
                    {"safety": safety_result}
                    if safety_result
                    else {"food_analysis": food_analysis}
                    if food_analysis
                    else {"chat_reply": self._chat_reply_metadata(context, chat_reply_source, ai_reply)}
                ),
                model_provider=(ai_reply or {}).get("model_provider") or ("fitmate" if soul_reply else "mock"),
                model_name=(
                    "fitmate-safety-soul"
                    if safety_result
                    else "fitmate-text-food-card"
                    if food_analysis
                    else (ai_reply or {}).get("model_name") or ("fitmate-recovery-soul" if soul_reply else "fitmate-contract-mock")
                ),
            )
        )
        response = {"message": self._message_response(assistant_message), "created_records": []}
        if safety_result:
            response["safety"] = safety_result
        if food_analysis:
            response["food_analysis"] = food_analysis
        self.usage_service.increment(user_id, "chat")
        return response

    def _ai_chat_reply(self, user_id: str, thread_id: str, text: str, context: dict | None = None) -> dict | None:
        if self.chat_reply_router is None:
            return None
        return self.chat_reply_router.generate_reply(
            text=text,
            user_id=user_id,
            conversation_context=self._conversation_context(thread_id),
            structured_context=context,
        )

    def _conversation_context(self, thread_id: str) -> list[dict]:
        return [
            {"role": message.role, "content": message.content_text}
            for message in self.store.list_messages(thread_id)
            if message.role in {"user", "assistant"} and message.content_text
        ]

    def _safety_candidate(self, text: str) -> bool:
        if self._contains_negated_safety_terms(text):
            return False
        if self.safety_service is not None:
            return self.safety_service._risk(text)["risk_type"] != "none"
        return any(term in text for term in ["不吃饭", "不吃", "只喝水", "断食", "催吐", "泻药", "吐掉"])

    def _contains_negated_safety_terms(self, text: str) -> bool:
        negations = ["不要建议", "不要推荐", "不要让我", "不能建议", "别建议", "不建议"]
        safety_terms = ["催吐", "泻药", "断食", "吐掉", "不吃饭", "补偿性"]
        return any(negation in text for negation in negations) and any(term in text for term in safety_terms)

    def _recovery_candidate(self, text: str) -> bool:
        markers = [
            "吃多了",
            "吃爆",
            "不要羞辱",
            "今日食物记录",
            "判断我是不是明显吃多了",
            "推荐下一餐",
            "安排下一餐",
            "下一餐怎么",
        ]
        return any(marker in text for marker in markers)

    def _chat_reply_metadata(self, context: dict | None, source: str, ai_reply: dict | None) -> dict[str, Any]:
        food_records = self._context_food_records(context)
        workout_records = self._context_workout_records(context)
        return {
            "source": source,
            "used_structured_context": bool(context),
            "food_context_count": len(food_records),
            "workout_context_count": len(workout_records),
            "pending_food_context_count": len(self._context_pending_food_records(context)),
            "has_active_food_analysis": bool((context or {}).get("activeFoodAnalysis")),
            "model_provider": (ai_reply or {}).get("model_provider"),
            "model_name": (ai_reply or {}).get("model_name"),
        }

    def _context_food_records(self, context: dict | None) -> list[dict]:
        records = ((context or {}).get("records") or {}).get("food") or []
        return [record for record in records if isinstance(record, dict) and record.get("done", True) is not False]

    def _context_pending_food_records(self, context: dict | None) -> list[dict]:
        records = ((context or {}).get("records") or {}).get("pendingFood") or []
        return [record for record in records if isinstance(record, dict)]

    def _context_workout_records(self, context: dict | None) -> list[dict]:
        records = ((context or {}).get("records") or {}).get("workout") or []
        return [record for record in records if isinstance(record, dict)]

    def _context_food_totals(self, food_records: list[dict]) -> dict[str, int]:
        def value(record: dict, key: str) -> int:
            raw = record.get(key)
            return int(raw) if isinstance(raw, (int, float)) else 0

        return {
            "calories": sum(value(record, "caloriesKcal") for record in food_records),
            "protein": sum(value(record, "proteinG") for record in food_records),
            "carbs": sum(value(record, "carbsG") for record in food_records),
            "fat": sum(value(record, "fatG") for record in food_records),
        }

    def _daily_target_from_context(self, context: dict | None) -> int | None:
        summary = (context or {}).get("dailySummary") or {}
        value = summary.get("dailyTargetCalories") or summary.get("targetCalories") or summary.get("calorieTarget")
        return int(value) if isinstance(value, (int, float)) else None

    def _safety_result(self, user_id: str, text: str, source_message_id: str | None = None) -> dict | None:
        if self.safety_service is not None:
            result = self.safety_service.classify(
                user_id=user_id,
                text=text,
                source_message_id=source_message_id,
            )
            return result if result["risk_type"] != "none" else None
        if self._safety_candidate(text):
            return {
                "risk_type": "extreme_restriction",
                "severity": "medium",
                "action_taken": "supportive_safety_redirect",
                "event_id": None,
            }
        return None

    def _safety_redirect_response(self, safety_result: dict | None) -> str:
        risk_type = (safety_result or {}).get("risk_type")
        if risk_type == "purging_or_laxative":
            return (
                "先停一下。催吐、泻药或把食物吐掉不是补救，会伤害身体，也会让下一次失控风险更高。"
                "现在只做安全下一步：喝水，坐下休息，下一餐正常吃一点蛋白质和主食。"
                "如果这种冲动反复出现，建议找医生、营养师或心理专业人士一起处理。"
            )
        if risk_type == "self_harm":
            return (
                "我先不继续聊减脂。你现在的安全比体重更重要。请立刻联系身边可信的人，"
                "或联系当地紧急服务/危机热线。现在先离开危险物品，待在有人能看见你的地方。"
            )
        return (
            "不行，这不是补救，是给下一次暴食和更大压力铺路。今天需要的是稳定，不是惩罚。"
            "明天正常吃，蛋白质够，少油少糖，多走路，别玩极端操作。"
        )

    def _recovery_soul_response(self, text: str, context: dict | None = None) -> str | None:
        if any(term in text for term in ["吃多了", "吃爆", "补救", "不要羞辱"]):
            food_records = self._context_food_records(context)
            if food_records:
                totals = self._context_food_totals(food_records)
                titles = "、".join(str(record.get("title") or "这餐") for record in food_records[:3])
                target = self._daily_target_from_context(context)
                if target and totals["calories"] >= int(target * 0.8):
                    return (
                        f"我看到了今天已经记了{titles}，大概 {totals['calories']} kcal。今天确实接近目标了，但这不是需要惩罚自己的信号，只是提醒我们把收尾做轻一点。"
                        "接下来别补偿，别把节奏打乱。如果还饿，选一份清淡蛋白加蔬菜；如果不饿，就喝水、休息，明天第一餐用高蛋白、少油、正常主食把状态接回来。"
                    )
                return (
                    f"我看到了今天已经记了{titles}，大概 {totals['calories']} kcal。先别急着把它定义成吃崩了，单看这一组记录，更像是需要把下一餐安排稳，而不是补救。"
                    "下一步很简单：水喝够，别追加零食追情绪；下一餐放一掌心蛋白质，主食半拳到一拳，油和酱料轻一点。你现在是身体撑，还是心里慌？"
                )
            if context:
                return (
                    "我现在还没有看到你的今日食物卡片，所以不能假装知道你今天到底吃了多少。先别急着给自己判刑，这种“我是不是吃多了”的感觉有时只是焦虑先到了。"
                    "你只要回我一句：是吃了但还没上传，还是看到体重/份量后开始慌？我再按真实情况帮你判断下一步。"
                )
            return (
                "先别急着给自己判刑。这只是一餐，不是整周报废。现在最有用的不是补偿，而是把接下来的节奏稳住。"
                "你先喝点水，今晚别用零食继续追着情绪跑；下一餐正常吃，蛋白质放前面，主食少一点但不要不吃。"
                "你刚才大概吃了什么？我帮你估个范围，再把下一餐安排得稳一点。"
            )
        if any(term in text for term in ["断档", "没好好记录", "重新开始"]):
            return (
                "不用补作业。断档以后最容易卡住的地方，就是以为要把前几天全整理完才能继续。其实不用。"
                "我们从现在这一餐接上就行。你下一步只做一件小事：拍下一餐，或者一句话告诉我吃了什么。"
                "先把线接回来，比完美记录重要。"
            )
        if any(term in text for term in ["下一餐", "怎么吃", "饱腹"]):
            food_records = self._context_food_records(context)
            if food_records:
                totals = self._context_food_totals(food_records)
                titles = "、".join(str(record.get("title") or "这餐") for record in food_records[:3])
                target = self._daily_target_from_context(context)
                if target and totals["calories"] >= int(target * 0.8):
                    return (
                        f"今天已经有{titles}，大概 {totals['calories']} kcal，接近当天目标了。下一餐不需要再硬凑很完整的大餐，重点是轻、稳、别饿到报复性找零食。"
                        "如果今晚还饿，就吃无糖酸奶或鸡蛋加一点蔬菜；如果已经不饿，今天到这里就很好。明天第一餐可以用鸡蛋/鱼/鸡胸加一拳主食和两拳蔬菜开局。"
                    )
                return (
                    f"上一餐我看到了{titles}，大概 {totals['calories']} kcal。下一餐就把缺口补得稳一点：蛋白质放前面，主食别归零，油和酱料轻一点。"
                    "你可以选鸡胸/鱼/鸡蛋豆腐，加半拳到一拳米饭或土豆，再配两拳蔬菜。这样不会像惩罚，也不容易晚上继续饿。"
                )
            if context:
                return (
                    "今天我还没看到食物卡片，所以不能说“根据今天记录”。如果这是第一餐，先吃一顿不痛苦的稳餐：一掌心蛋白质，一拳主食，两拳蔬菜，酱料少一点。"
                    "你更想吃中餐、日料，还是简单便利店组合？"
                )
            return (
                "我现在还没有足够的今日记录，所以不能装作已经了解你今天吃了什么。先给你一个稳的框架：一掌心蛋白质，半拳到一拳主食，两拳蔬菜，酱料和油少一点。"
                "这餐的目标不是越少越好，而是吃完 3-4 小时不崩、不乱找零食。"
                "你今天训练了吗？"
            )
        if any(term in text for term in ["体重", "焦虑", "上去", "涨"]):
            return (
                "先别被今天这个数字牵着走。一天体重上去，很多时候是水分、盐分、碳水、训练后的炎症、睡眠或经期影响，不等于脂肪突然长上来了。"
                "今天不要补偿性挨饿，正常吃，水喝够，走一走，明早同一时间再看。我们看 3-7 天趋势，不让一天的数字决定你的情绪。"
            )
        return None

    def _clean_chat_reply_text(self, text: str) -> str:
        cleaned = text.replace("**", "").replace("*", "")
        cleaned_lines = []
        for line in cleaned.splitlines():
            stripped = line.strip()
            while stripped.startswith("#"):
                stripped = stripped[1:].strip()
            if stripped.startswith(("- ", "• ")):
                stripped = stripped[2:].strip()
            cleaned_lines.append(stripped)
        return "\n".join(cleaned_lines).strip()

    def _mock_ai_response(self, text: str) -> str:
        if "甜" in text or "饿" in text:
            return "先喝水，等 10 分钟；如果还饿，选高蛋白小份。你不是没自控力，是训练后身体需要恢复。"
        return "我先帮你记录重点，再给你一个可执行的小步骤。"

    def _text_food_analysis(self, user_id: str, text: str) -> dict[str, Any] | None:
        if not self._looks_like_food_log(text):
            return None
        if self.text_food_analysis_router is not None:
            ai_analysis = self.text_food_analysis_router.analyze_food_text(text=text, user_id=user_id)
            if ai_analysis is not None:
                ai_analysis.setdefault("fallback_used", False)
                ai_analysis.setdefault("analysis_source", "ai")
                return self._food_analysis_response(ai_analysis)
        calories = self._estimate_calories(text)
        protein = self._estimate_protein(text)
        carbs = self._estimate_carbs(text)
        fat = self._estimate_fat(text)
        return self._food_analysis_response({
            "meal_name": self._meal_name_from_text(text),
            "calories_range_kcal": [max(calories - 80, 0), calories + 80],
            "protein_g_range": [max(protein - 8, 0), protein + 8],
            "carbs_g_range": [max(carbs - 12, 0), carbs + 12],
            "fat_g_range": [max(fat - 6, 0), fat + 6],
            "confidence": 0.55,
            "needs_follow_up": False,
            "follow_up_question": None,
            "model_provider": "fitmate",
            "model_name": "fitmate-text-food-heuristic",
            "fallback_used": self.text_food_analysis_router is not None,
            "fallback_source": "local_heuristic",
            "fallback_error_code": (
                getattr(self.text_food_analysis_router, "last_error_code", None) or "provider_unavailable"
                if self.text_food_analysis_router is not None
                else None
            ),
            "analysis_source": "heuristic",
        })

    def _food_analysis_response(self, analysis: dict[str, Any]) -> dict[str, Any]:
        return {
            "food_log_id": None,
            "meal_name": analysis["meal_name"],
            "calories_range_kcal": analysis["calories_range_kcal"],
            "protein_g_range": analysis["protein_g_range"],
            "carbs_g_range": analysis["carbs_g_range"],
            "fat_g_range": analysis["fat_g_range"],
            "confidence": analysis["confidence"],
            "status": "pending",
            "needs_follow_up": analysis.get("needs_follow_up", False),
            "follow_up_question": analysis.get("follow_up_question"),
            "model_provider": analysis.get("model_provider"),
            "model_name": analysis.get("model_name"),
            "fallback_used": analysis.get("fallback_used", False),
            "fallback_source": analysis.get("fallback_source"),
            "fallback_error_code": analysis.get("fallback_error_code"),
            "analysis_source": analysis.get("analysis_source"),
        }

    def _looks_like_food_log(self, text: str) -> bool:
        if any(marker in text for marker in ["想吃", "嘴馋", "很饿"]):
            return False
        if any(marker in text for marker in ["吃了", "喝了", "早餐", "午餐", "晚餐", "夜宵"]):
            return True
        food_terms = [
            "米饭",
            "鸡胸",
            "牛肉",
            "鱼",
            "鸡蛋",
            "面",
            "饭",
            "沙拉",
            "火锅",
            "奶茶",
            "咖啡",
            "拿铁",
            "蛋白",
        ]
        return any(term in text for term in food_terms)

    def _meal_name_from_text(self, text: str) -> str:
        meal_name = text.strip()
        for prefix in ["我吃了", "吃了", "我喝了", "喝了"]:
            if meal_name.startswith(prefix):
                meal_name = meal_name[len(prefix):].strip()
        return meal_name[:28] or "文字食物记录"

    def _estimate_calories(self, text: str) -> int:
        calories = 320
        if "米饭" in text or "饭" in text:
            calories += 180
        if "面" in text:
            calories += 260
        if "奶茶" in text:
            calories += 300
        if "火锅" in text:
            calories += 500
        if "半" in text:
            calories -= 80
        return max(calories, 120)

    def _estimate_protein(self, text: str) -> int:
        protein = 12
        if any(term in text for term in ["鸡胸", "牛肉", "鱼"]):
            protein += 28
        if any(term in text for term in ["鸡蛋", "蛋白"]):
            protein += 10
        return protein

    def _estimate_carbs(self, text: str) -> int:
        carbs = 25
        if "米饭" in text or "饭" in text:
            carbs += 45
        if "面" in text:
            carbs += 60
        if "奶茶" in text:
            carbs += 45
        if "半" in text:
            carbs -= 15
        return max(carbs, 8)

    def _estimate_fat(self, text: str) -> int:
        fat = 10
        if "火锅" in text:
            fat += 35
        if "牛肉" in text:
            fat += 12
        if "奶茶" in text or "拿铁" in text:
            fat += 10
        return fat

    def _thread_response(self, thread: StoredThread) -> dict:
        data = asdict(thread)
        data["created_at"] = thread.created_at.isoformat()
        data["updated_at"] = thread.updated_at.isoformat()
        data["archived_at"] = thread.archived_at.isoformat() if thread.archived_at else None
        return data

    def _message_response(self, message: StoredMessage) -> dict:
        data = asdict(message)
        data["created_at"] = message.created_at.isoformat()
        return data


chat_service = ChatService()
