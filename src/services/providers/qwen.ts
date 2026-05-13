import type { VisionProvider } from '../aiVision';
import { createFixtureEstimate } from './xiaomi';

export const qwenVisionProvider: VisionProvider = {
  id: 'qwen',
  async estimateFood() {
    return createFixtureEstimate('qwen');
  },
};
