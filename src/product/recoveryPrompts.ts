import type { AppDataState } from '../domain/models';
import { calculateEnergyTarget, summarizeFoodIntake } from '../services/energyTargets';

export type RecoveryPromptId =
  | 'cold_intro'
  | 'cold_photo'
  | 'cold_goal'
  | 'meal_check'
  | 'estimate_meal'
  | 'steady_next_meal'
  | 'restart_today'
  | 'overeaten'
  | 'reset'
  | 'next_meal'
  | 'scale_panic';

export type RecoveryPrompt = {
  id: RecoveryPromptId;
  label: string;
  message: string;
  action?: 'camera';
};

export const COLD_START_PROMPTS: RecoveryPrompt[] = [
  {
    id: 'cold_intro',
    label: '先认识我',
    message: '你现在还不了解我的目标和习惯。请用 30 秒问我最少的问题，先建立减脂/维持/增肌所需的基础信息，不要假设我有训练或饮食记录。',
  },
  {
    id: 'cold_photo',
    label: '拍这一餐',
    message: '我想先从这一餐开始记录。请等我上传照片后，只根据照片里能看到的内容判断，不要假设我的训练、目标或今天其他饮食。',
    action: 'camera',
  },
  {
    id: 'cold_goal',
    label: '我想减脂',
    message: '我想减脂，但你还不了解我的身体资料和生活习惯。请先问我最少的问题，然后再给初始建议。',
  },
];

export const LOW_CONTEXT_PROMPTS: RecoveryPrompt[] = [
  {
    id: 'meal_check',
    label: '这餐能吃吗',
    message: '请先判断这餐能不能吃、怎么吃、吃完下一步。只能引用我已经提供的信息；如果缺少份量、训练或目标，请直接说缺少什么，并只问一个小问题。',
  },
  {
    id: 'estimate_meal',
    label: '帮我估一下',
    message: '帮我估算这一餐。请只根据我给你的文字或照片，不要编造今天其他记录；不确定时给范围，并问一个最关键的问题。',
  },
  {
    id: 'steady_next_meal',
    label: '下一餐怎么稳',
    message: '我今天资料还不多。请不要说“根据今天记录”。只给一个通用但诚实的下一餐稳定方案，并问我一个能让建议更准的问题。',
  },
  {
    id: 'restart_today',
    label: '今天重新开始',
    message: '我想从今天重新开始记录。请不要让我补之前的记录，只帮我确定现在最小的下一步。',
  },
];

export const RECOVERY_PROMPTS: RecoveryPrompt[] = [
  {
    id: 'overeaten',
    label: '吃多了',
    message: '我刚刚吃多了，有点慌。请不要羞辱我。请先分析我的今日食物记录，判断我是不是明显吃多了；如果没有今日食物记录，请直接说你还不知道我今天吃了什么，问我是不是吃了但还没上传，或者只是因为焦虑觉得吃多了。不要生成未知餐次或 0 kcal 食物卡片，只给一个安全下一步。',
  },
  {
    id: 'reset',
    label: '断档了',
    message: '我这几天没有好好记录。请帮我从今天这一餐重新开始，只给我一个最小下一步，不要假装知道我过去几天吃了什么。',
  },
  {
    id: 'next_meal',
    label: '下一餐',
    message: '如果我今天已有饮食或训练记录，请基于它们安排下一餐；如果没有，请直接说你还没有今天记录，然后问我一个小问题。',
  },
  {
    id: 'scale_panic',
    label: '体重焦虑',
    message: '今天体重上去了，我有点焦虑。只有在有体重记录或趋势时才判断趋势；如果没有趋势，请解释可能原因，并给一个不极端的下一步。',
  },
];

export function promptsForState(state: AppDataState) {
  const foodRecords = state.records.filter((record) => record.kind === 'food');
  const workoutRecords = state.records.filter((record) => record.kind === 'workout');
  const weightRecords = state.records.filter((record) => record.kind === 'weight');
  const userMessages = state.chatMessages.filter((message) => message.role === 'user' && message.text.trim());
  const hasAnyRecord = state.records.length > 0;

  if (!hasAnyRecord && userMessages.length === 0) {
    return COLD_START_PROMPTS;
  }
  if (!foodRecords.length && !workoutRecords.length) {
    return LOW_CONTEXT_PROMPTS;
  }

  return RECOVERY_PROMPTS.filter((prompt) => {
    if (prompt.id === 'next_meal') {
      return foodRecords.length > 0 || workoutRecords.length > 0;
    }
    if (prompt.id === 'scale_panic') {
      return weightRecords.length > 0 || userMessages.some((message) => message.text.includes('体重'));
    }
    if (prompt.id === 'reset') {
      return hasAnyRecord;
    }
    return true;
  });
}

export function recoveryPromptText(id: RecoveryPromptId, state?: AppDataState) {
  if (id === 'overeaten' && state) {
    return overeatenPromptText(state);
  }
  if ((id === 'next_meal' || id === 'steady_next_meal') && state) {
    return nextMealPromptText(state);
  }
  return baseRecoveryPromptText(id);
}

function baseRecoveryPromptText(id: RecoveryPromptId) {
  return [...COLD_START_PROMPTS, ...LOW_CONTEXT_PROMPTS, ...RECOVERY_PROMPTS].find((prompt) => prompt.id === id)?.message ?? '';
}

function overeatenPromptText(state: AppDataState) {
  const foodRecords = state.records.filter((record) => record.kind === 'food' && record.status !== '已丢弃');
  if (!foodRecords.length) {
    return [
      '我刚刚觉得自己吃多了，有点慌。请先稳定我的情绪，不要羞辱我。',
      '你还没有我的今日食物记录，所以不要假装知道我今天吃了什么，也不要生成未知餐次或 0 kcal 食物卡片。',
      '请问我一个小问题：我是吃了但还没上传，还是只是因为焦虑觉得吃多了？然后给一个安全下一步。',
    ].join('\n');
  }
  const foodSummary = foodRecords.map((record, index) => {
    const macros = [
      record.caloriesKcal === undefined ? null : `${record.caloriesKcal} kcal`,
      record.proteinG === undefined ? null : `蛋白 ${record.proteinG}g`,
      record.carbsG === undefined ? null : `碳水 ${record.carbsG}g`,
      record.fatG === undefined ? null : `脂肪 ${record.fatG}g`,
    ].filter(Boolean).join(' · ');
    return `${index + 1}. ${record.title}${macros ? `：${macros}` : ''}${record.detail ? `；${record.detail}` : record.text ? `；${record.text}` : ''}`;
  }).join('\n');
  return [
    '我刚刚觉得自己吃多了，有点慌。请不要羞辱我。',
    '请基于下面的今日食物记录判断我是不是明显吃多了，还是只是短期焦虑/水分/盐分/碳水带来的感觉。',
    foodSummary,
    '先直接回答：今天是否需要担心。然后给一个稳定情绪的解释和一个安全下一步。请保持温柔、具体、像真人说话，不要写星号或 markdown 标题。',
  ].join('\n');
}

function nextMealPromptText(state: AppDataState) {
  const foodRecords = state.records.filter((record) => record.kind === 'food' && record.status !== '已丢弃' && record.done !== false);
  const intake = summarizeFoodIntake(state.records);
  const energy = calculateEnergyTarget({ profile: state.profile, foodCaloriesKcal: intake.caloriesKcal });
  if (!foodRecords.length) {
    return [
      '今天还没有食物记录。请不要假装知道我今天吃过什么。',
      '如果这是今天第一顿，请给我一个适合减脂但不痛苦的第一顿食谱：蛋白质、主食、蔬菜和酱料怎么搭配都说清楚。',
      '如果你还需要信息，只问一个小问题。回复要像真人教练，不要写星号或 markdown 标题。',
    ].join('\n');
  }
  const foodSummary = foodRecords.map((record, index) => {
    const macros = [
      record.caloriesKcal === undefined ? null : `${record.caloriesKcal} kcal`,
      record.proteinG === undefined ? null : `蛋白 ${record.proteinG}g`,
      record.carbsG === undefined ? null : `碳水 ${record.carbsG}g`,
      record.fatG === undefined ? null : `脂肪 ${record.fatG}g`,
    ].filter(Boolean).join(' · ');
    return `${index + 1}. ${record.title}${macros ? `：${macros}` : ''}${record.detail ? `；${record.detail}` : record.text ? `；${record.text}` : ''}`;
  }).join('\n');
  if (energy.progress >= 0.8) {
    return [
      `我的今日摄入已经接近或超过目标的 80%。今日已记录：`,
      foodSummary,
      `当前大概已吃 ${intake.caloriesKcal} kcal，目标约 ${energy.dailyTargetCalories} kcal。`,
      '请不要再安排很大的一餐。帮我判断今天如果还饿怎么收尾，并顺手给一个明天的轻盈高蛋白食谱。回复要短、有人味，不要写星号或 markdown 标题。',
    ].join('\n');
  }
  return [
    '请根据我今天已经记录的食物，推荐下一餐怎么吃，重点是搭配上一餐来补足蛋白、控制油和主食，不要泛泛科普。',
    foodSummary,
    `当前大概已吃 ${intake.caloriesKcal} kcal，今日目标约 ${energy.dailyTargetCalories} kcal，还可吃约 ${Math.max(0, energy.caloriesLeft)} kcal。`,
    '请给一个具体食谱：蛋白质、主食、蔬菜、酱料和份量怎么搭。回复要像真人，不要写星号或 markdown 标题。',
  ].join('\n');
}
