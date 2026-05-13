import type { FoodEstimate, VisionProvider } from '../aiVision';

export const xiaomiVisionProvider: VisionProvider = {
  id: 'xiaomi',
  async estimateFood() {
    return createFixtureEstimate('xiaomi');
  },
};

export function createFixtureEstimate(provider: FoodEstimate['provider']): FoodEstimate {
  return {
    id: `${provider}-bibimbap-estimate`,
    provider,
    title: '韩式石锅拌饭',
    status: 'pending',
    confidence: 0.7,
    calories: '600-900',
    protein: '25-40g',
    carbs: '70-100g',
    detectedItems: ['米饭', '鸡蛋', '泡菜', '蔬菜', '拌饭酱'],
    caloriesKcal: {
      min: 600,
      max: 900,
    },
    macros: {
      proteinG: {
        min: 25,
        max: 40,
      },
      carbsG: {
        min: 70,
        max: 100,
      },
      fatG: {
        min: 18,
        max: 35,
      },
    },
    advice: '能吃。饭和酱是主要热量，今天下一餐把油和主食压低，蛋白补足。',
    requiresUserConfirmation: true,
  };
}
