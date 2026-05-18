export type SubscriptionTier = 'free' | 'pro' | 'elite';

export type Gender = 'female' | 'male' | 'unspecified';

export type UserProfile = {
  displayName: string;
  email: string;
  phone: string;
  avatarInitial: string;
  heightCm: number;
  weightKg: number;
  age: number;
  gender: Gender;
  goalLabel: string;
  trainingFrequency: string;
  dietPreference: string;
  healthRiskNote: string;
};

export type SubscriptionPlan = {
  tier: SubscriptionTier;
  title: string;
  price: string;
  featured?: boolean;
  features: string[];
};

export type Entitlements = {
  tier: SubscriptionTier;
  automaticRecording: boolean;
  memoryRetentionDays: number | 'extended';
  preferredVisionProvider: 'xiaomi' | 'qwen';
};

export type AuthUser = {
  id: string;
  displayName: string;
  email: string;
  phone?: string;
};

export type AuthSession = {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  user: AuthUser;
};

export type SubscriptionStatus = {
  tier: SubscriptionTier;
  active: boolean;
  renewsAt?: string;
  entitlements: Entitlements;
};

export type ConversationThread = {
  id: string;
  title: string;
  subtitle: string;
};

export type ChatMessage = {
  id: string;
  role: 'assistant' | 'user';
  text: string;
  fileInsight?: FileInsight;
};

export type FileInsight = {
  documentType: string;
  filename: string;
  syncStatus?: 'available' | 'synced' | 'unavailable';
  insights: Array<{
    label: string;
    value: string;
    source?: string;
  }>;
  recommendations: string[];
};

export type FoodAnalysis = {
  id: string;
  title: string;
  status: 'pending' | 'confirmed' | 'edited' | 'discarded' | 'analysis_only';
  confidence: number;
  calories: string;
  protein: string;
  carbs: string;
  fat?: string;
  caloriesKcal?: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
  detail?: string;
  advice: string;
};

export type DailySummary = {
  calorieRange: string;
  proteinFloor: string;
  weightKg: number;
  hungerScore: string;
};

export type DailyRecord = {
  id: string;
  kind?: 'food' | 'weight' | 'mood' | 'workout' | 'summary' | 'checkin';
  title: string;
  status: string;
  text: string;
  done?: boolean;
  caloriesKcal?: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
  detail?: string;
  weightKg?: number;
  moodLevel?: number;
  hungerLevel?: number;
  cravingLevel?: number;
};

export type AppDataState = {
  profile: UserProfile;
  entitlements: Entitlements;
  plans: SubscriptionPlan[];
  threads: ConversationThread[];
  chatMessages: ChatMessage[];
  activeFoodAnalysis: FoodAnalysis | null;
  dailySummary: DailySummary;
  records: DailyRecord[];
};
