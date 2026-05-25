export type RecoveryPromptId = 'overeaten' | 'reset' | 'next_meal' | 'scale_panic';

export type RecoveryPrompt = {
  id: RecoveryPromptId;
  label: string;
  message: string;
};

export const RECOVERY_PROMPTS: RecoveryPrompt[] = [
  {
    id: 'overeaten',
    label: '吃多了',
    message: '我刚刚吃多了，有点慌。请不要羞辱我，帮我判断现在最安全的下一步和下一餐怎么补救。',
  },
  {
    id: 'reset',
    label: '断档了',
    message: '我这几天没有好好记录。请帮我从今天这一餐重新开始，只给我一个最小下一步。',
  },
  {
    id: 'next_meal',
    label: '下一餐',
    message: '根据我今天的记录，帮我安排下一餐怎么吃，重点是稳住减脂和饱腹感。',
  },
  {
    id: 'scale_panic',
    label: '体重焦虑',
    message: '今天体重上去了，我有点焦虑。请先帮我判断可能原因，再给一个不极端的下一步。',
  },
];

export function recoveryPromptText(id: RecoveryPromptId) {
  return RECOVERY_PROMPTS.find((prompt) => prompt.id === id)?.message ?? '';
}
