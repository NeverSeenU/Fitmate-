import type { FoodAnalysis } from '../domain/models';
import { qwenVisionProvider } from './providers/qwen';
import { xiaomiVisionProvider } from './providers/xiaomi';

export type VisionProviderId = 'xiaomi' | 'qwen';

export type FoodVisionInput = {
  imageUri: string;
  userNote?: string;
  locale: 'zh-CN';
};

export type FoodEstimate = Omit<FoodAnalysis, 'caloriesKcal' | 'proteinG' | 'carbsG' | 'fatG'> & {
  provider: VisionProviderId;
  detectedItems: string[];
  caloriesKcal: {
    min: number;
    max: number;
  };
  macros: {
    proteinG: {
      min: number;
      max: number;
    };
    carbsG: {
      min: number;
      max: number;
    };
    fatG: {
      min: number;
      max: number;
    };
  };
  requiresUserConfirmation: boolean;
};

export type VisionProvider = {
  id: VisionProviderId;
  estimateFood(input: FoodVisionInput): Promise<FoodEstimate>;
};

export type AiVisionService = {
  estimateFood(input: FoodVisionInput): Promise<FoodEstimate>;
};

export function createAiVisionService({
  primary = xiaomiVisionProvider,
  fallback = qwenVisionProvider,
}: {
  primary?: VisionProvider;
  fallback?: VisionProvider;
} = {}): AiVisionService {
  return {
    async estimateFood(input) {
      try {
        return await primary.estimateFood(input);
      } catch {
        return fallback.estimateFood(input);
      }
    },
  };
}
