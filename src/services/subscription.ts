import type { Entitlements, SubscriptionStatus, SubscriptionTier } from '../domain/models';

export type UsageKind = 'chat' | 'image' | 'autoRecord' | 'memory';

export type UsageSnapshot = {
  tier: SubscriptionTier;
  imageRequestsToday: number;
  chatMessagesToday: number;
};

export type EntitlementDecision = {
  allowed: boolean;
  reason?: 'subscription_required' | 'fair_use_review';
};

export type SubscriptionService = {
  getStatus(userId: string): Promise<SubscriptionStatus>;
  canUse(kind: UsageKind, usage: UsageSnapshot): EntitlementDecision;
};

export function createMockSubscriptionService(status: SubscriptionStatus): SubscriptionService {
  return {
    async getStatus() {
      return status;
    },
    canUse(kind, usage) {
      return evaluateEntitlement(kind, usage);
    },
  };
}

export function entitlementsForTier(tier: SubscriptionTier): Entitlements {
  if (tier === 'free') {
    return {
      tier,
      automaticRecording: false,
      memoryRetentionDays: 7,
      preferredVisionProvider: 'xiaomi',
    };
  }

  return {
    tier,
    automaticRecording: true,
    memoryRetentionDays: 'extended',
    preferredVisionProvider: 'xiaomi',
  };
}

export function evaluateEntitlement(kind: UsageKind, usage: UsageSnapshot): EntitlementDecision {
  if ((kind === 'autoRecord' || kind === 'memory') && usage.tier === 'free') {
    return { allowed: false, reason: 'subscription_required' };
  }

  if (usage.tier !== 'free' && (usage.imageRequestsToday > 80 || usage.chatMessagesToday > 600)) {
    return { allowed: false, reason: 'fair_use_review' };
  }

  return { allowed: true };
}
