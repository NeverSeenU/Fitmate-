import type { AppDataState } from '../domain/models';

export const initialAppState: AppDataState = {
  profile: {
    displayName: 'jason xu',
    email: 'jiang@example.com',
    phone: '+1 778 918 8632',
    avatarInitial: 'J',
    heightCm: 175,
    weightKg: 72,
    age: 23,
    gender: 'female',
    goalLabel: '婚纱减脂阶段',
    trainingFrequency: '几乎每天 2 小时',
    dietPreference: '辣、重口、控油',
    healthRiskNote: '无已填写慢病信息',
  },
  entitlements: {
    tier: 'pro',
    automaticRecording: true,
    memoryRetentionDays: 'extended',
    preferredVisionProvider: 'xiaomi',
  },
  plans: [
    {
      tier: 'free',
      title: 'Free',
      price: '¥0',
      features: ['基础 AI 使用', '手动记录', '基础打卡'],
    },
    {
      tier: 'pro',
      title: 'Pro',
      price: '¥29/月',
      featured: true,
      features: ['高频 AI 使用', 'AI 自动创建待确认记录', '周总结和基础记忆'],
    },
    {
      tier: 'elite',
      title: 'Elite',
      price: '¥59/月',
      features: ['大量图片和聊天使用', '高置信度自动确认', '婚纱塑形计划和优先模型'],
    },
  ],
  threads: [
    { id: 'food-today', title: '今日饮食分析', subtitle: '石锅拌饭 · 训练后饥饿' },
    { id: 'craving', title: '嘴馋急救', subtitle: '想吃甜品时的替代方案' },
    { id: 'wedding-plan', title: '婚纱塑形计划', subtitle: '本周热量和蛋白目标' },
    { id: 'training', title: '运动记录', subtitle: '有氧 + 无氧 120 分钟' },
  ],
  chatMessages: [
    {
      id: 'assistant-1',
      role: 'assistant',
      text: '今天训练后如果很饿，先发食物照片。我会先估区间，再帮你决定要不要记录。',
    },
    { id: 'user-1', role: 'user', text: '这份石锅拌饭能吃吗？' },
    {
      id: 'assistant-2',
      role: 'assistant',
      text: '你不是没自控力，是今天训练消耗大。先喝水，等 10 分钟；如果还饿，选高蛋白小份。',
    },
  ],
  activeFoodAnalysis: null,
  dailySummary: {
    calorieRange: '1280-1560',
    proteinFloor: '82g',
    weightKg: 72,
    hungerScore: '6/10',
  },
  records: [
    { id: 'gym', kind: 'workout', title: '健身房有氧 + 无氧', status: '已记录', text: '120 分钟 · 强度中高 · 注意补蛋白', done: true },
    { id: 'evening-summary', kind: 'summary', title: '晚间总结', status: 'AI', text: '今天执行力很好，明天把晚餐主食减半，训练后别硬扛饥饿。', done: true },
  ],
};

export function getProfileRows(state: AppDataState) {
  const { profile } = state;
  return [
    ['身高', `${profile.heightCm} cm`],
    ['体重', `${profile.weightKg} kg`],
    ['目标体重', profile.goalLabel],
    ['年龄', `${profile.age}`],
    ['性别', profile.gender === 'female' ? '女' : profile.gender === 'male' ? '男' : '未填写'],
    ['训练频率', profile.trainingFrequency],
    ['饮食偏好', profile.dietPreference],
    ['风险提示', profile.healthRiskNote],
  ] as const;
}
