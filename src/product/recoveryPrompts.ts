import type { AppDataState } from '../domain/models';

export type RecoveryPromptId =
  | 'cold_intro'
  | 'cold_photo'
  | 'cold_goal'
  | 'tone_setup'
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
  {
    id: 'tone_setup',
    label: '语气设置',
    message: '我想设置你的陪伴语气。请给我几个简单选项，比如温柔、直接、毒舌闺蜜，但不要羞辱或鼓励极端减肥。',
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
    message: '我刚刚吃多了，有点慌。请不要羞辱我。只能基于已知记录判断；如果你不知道我今天训练或吃了什么，请先承认不知道，再给安全下一步。',
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

export function recoveryPromptText(id: RecoveryPromptId) {
  return [...COLD_START_PROMPTS, ...LOW_CONTEXT_PROMPTS, ...RECOVERY_PROMPTS].find((prompt) => prompt.id === id)?.message ?? '';
}
