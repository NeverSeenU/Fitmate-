import type { AppDataState, DailyRecord, FoodAnalysis, SubscriptionTier } from '../domain/models';

export type BackendApiForAppData = {
  profile: {
    getMe(): Promise<{
      user: { email?: string | null; display_name?: string | null };
      profile?: Record<string, unknown> | null;
      subscription?: Record<string, unknown>;
    }>;
  };
  subscription: {
    getStatus(): Promise<{
      tier: SubscriptionTier;
      active: boolean;
      entitlements: AppDataState['entitlements'];
    }>;
  };
  chat: {
    listThreads(): Promise<{ threads?: Array<Record<string, unknown>> }>;
  };
  records: {
    today(): Promise<{
      summary?: Record<string, unknown>;
      calories_range_kcal?: number[];
      protein_floor_g?: number | null;
      weight_kg?: number | null;
      hunger_score?: number | null;
      food_logs?: Array<Record<string, unknown>>;
      workout_logs?: Array<Record<string, unknown>>;
      checkins?: Array<Record<string, unknown>>;
    }>;
  };
};

export async function loadAppDataFromBackend(
  api: BackendApiForAppData,
  fallback: AppDataState,
): Promise<AppDataState> {
  const [me, subscription, threads, records] = await Promise.all([
    api.profile.getMe(),
    api.subscription.getStatus(),
    api.chat.listThreads(),
    api.records.today(),
  ]);

  return {
    ...fallback,
    profile: mapProfile(me, fallback),
    entitlements: subscription.entitlements,
    threads: mapThreads(threads, fallback),
    activeFoodAnalysis: mapActiveFoodAnalysis(records, fallback),
    dailySummary: mapDailySummary(records, fallback),
    records: mapRecords(records, fallback),
  };
}

function mapActiveFoodAnalysis(
  records: Awaited<ReturnType<BackendApiForAppData['records']['today']>>,
  fallback: AppDataState,
): FoodAnalysis | null {
  const pending = (records.food_logs ?? []).find((log) => stringValue(log.status) === 'pending' || stringValue(log.status) === 'edited');
  if (!pending) {
    return fallback.activeFoodAnalysis;
  }
  return {
    id: stringValue(pending.id) ?? `food-${Date.now()}`,
    title: stringValue(pending.meal_name) ?? '食物记录',
    status: stringValue(pending.status) === 'edited' ? 'edited' : 'pending',
    confidence: numberValue(pending.confidence) ?? 0.7,
    modelProvider: stringValue(pending.model_provider),
    modelName: stringValue(pending.model_name),
    calories: formatPlainRange(pending.calories_range_kcal) ?? '待估算',
    protein: `${formatPlainRange(pending.protein_g_range) ?? '待估算'}g`,
    carbs: `${formatPlainRange(pending.carbs_g_range) ?? '待估算'}g`,
    fat: `${formatPlainRange(pending.fat_g_range) ?? '待估算'}g`,
    caloriesKcal: rangeMidpoint(pending.calories_range_kcal),
    proteinG: rangeMidpoint(pending.protein_g_range),
    carbsG: rangeMidpoint(pending.carbs_g_range),
    fatG: rangeMidpoint(pending.fat_g_range),
    detail: stringValue(pending.user_portion_note),
    advice: stringValue(pending.user_portion_note) ?? '请确认份量，确认后才写入今日记录。',
  };
}

function mapProfile(me: Awaited<ReturnType<BackendApiForAppData['profile']['getMe']>>, fallback: AppDataState) {
  const profile = me.profile ?? {};
  const displayName = stringValue(me.user.display_name) ?? fallback.profile.displayName;
  return {
    ...fallback.profile,
    displayName,
    avatarInitial: displayName.slice(0, 1).toUpperCase() || fallback.profile.avatarInitial,
    email: stringValue(me.user.email) ?? fallback.profile.email,
    heightCm: numberValue(profile.height_cm) ?? fallback.profile.heightCm,
    weightKg: numberValue(profile.current_weight_kg) ?? fallback.profile.weightKg,
    age: numberValue(profile.age) ?? fallback.profile.age,
    gender: profile.sex === 'male' || profile.sex === 'female' ? profile.sex : fallback.profile.gender,
    goalLabel: stringValue(profile.goal_label) ?? fallback.profile.goalLabel,
    trainingFrequency: summaryValue(profile.training_baseline) ?? fallback.profile.trainingFrequency,
    dietPreference: summaryValue(profile.food_preferences) ?? fallback.profile.dietPreference,
    healthRiskNote: summaryValue(profile.risk_flags) ?? fallback.profile.healthRiskNote,
  };
}

function mapThreads(threads: { threads?: Array<Record<string, unknown>> }, fallback: AppDataState) {
  const items = threads.threads ?? [];
  if (items.length === 0) {
    return fallback.threads;
  }
  return items.map((item) => ({
    id: stringValue(item.id) ?? 'thread',
    title: stringValue(item.title) ?? 'FitMate chat',
    subtitle: stringValue(item.kind) ?? 'backend',
  }));
}

function mapDailySummary(
  records: Awaited<ReturnType<BackendApiForAppData['records']['today']>>,
  fallback: AppDataState,
) {
  const summary = records.summary ?? {};
  return {
    calorieRange: stringValue(summary.calorie_range)
      ?? formatPlainRange(records.calories_range_kcal)
      ?? fallback.dailySummary.calorieRange,
    proteinFloor: formatProtein(summary.protein_floor_g ?? records.protein_floor_g)
      ?? fallback.dailySummary.proteinFloor,
    weightKg: numberValue(summary.current_weight_kg ?? records.weight_kg) ?? fallback.dailySummary.weightKg,
    hungerScore: formatHunger(summary.hunger_level ?? records.hunger_score) ?? fallback.dailySummary.hungerScore,
  };
}

function mapRecords(
  records: Awaited<ReturnType<BackendApiForAppData['records']['today']>>,
  fallback: AppDataState,
): DailyRecord[] {
  const foodRecords = (records.food_logs ?? []).map((log) => ({
    id: stringValue(log.id) ?? 'food-log',
    kind: 'food' as const,
    title: stringValue(log.meal_name) ?? 'Food log',
    status: stringValue(log.status) ?? 'pending',
    text: foodRecordText(log),
    done: stringValue(log.status) === 'confirmed',
    caloriesKcal: rangeMidpoint(log.calories_range_kcal),
    proteinG: rangeMidpoint(log.protein_g_range),
    carbsG: rangeMidpoint(log.carbs_g_range),
    fatG: rangeMidpoint(log.fat_g_range),
    detail: stringValue(log.user_portion_note),
  }));
  const workoutRecords = (records.workout_logs ?? []).map((log) => ({
    id: stringValue(log.id) ?? 'workout-log',
    kind: 'workout' as const,
    title: stringValue(log.workout_type) ?? 'Workout',
    status: stringValue(log.status) ?? 'pending',
    text: `${numberValue(log.duration_minutes) ?? 0} min`,
    done: stringValue(log.status) === 'confirmed',
  }));
  const checkinRecords = (records.checkins ?? []).map((checkin) => {
    const weight = numberValue(checkin.weight_kg);
    const mood = numberValue(checkin.mood_level);
    const hunger = numberValue(checkin.hunger_level);
    const craving = numberValue(checkin.craving_level);
    const kind = weight !== undefined ? 'weight' as const : 'mood' as const;
    return {
      id: stringValue(checkin.id) ?? 'checkin',
      kind,
      title: kind === 'weight' ? '体重打卡' : '心情日记',
      status: '已记录',
      text: [
        weight !== undefined ? `${weight} kg` : null,
        hunger !== undefined ? `饥饿 ${hunger}/10` : null,
        mood !== undefined ? `心情 ${mood}/10` : null,
        craving !== undefined ? `嘴馋 ${craving}/10` : null,
        stringValue(checkin.notes),
      ].filter(Boolean).join(' · '),
      done: true,
      weightKg: weight,
      moodLevel: mood,
      hungerLevel: hunger,
      cravingLevel: craving,
      detail: stringValue(checkin.notes),
    };
  });
  const nextRecords = [...foodRecords, ...workoutRecords, ...checkinRecords];
  return nextRecords.length ? nextRecords : fallback.records;
}

function foodRecordText(log: Record<string, unknown>) {
  return [
    formatCalorieRange(log.calories_range_kcal),
    rangeMidpoint(log.protein_g_range) !== undefined ? `蛋白 ${rangeMidpoint(log.protein_g_range)}g` : null,
    rangeMidpoint(log.carbs_g_range) !== undefined ? `碳水 ${rangeMidpoint(log.carbs_g_range)}g` : null,
    rangeMidpoint(log.fat_g_range) !== undefined ? `脂肪 ${rangeMidpoint(log.fat_g_range)}g` : null,
  ].filter(Boolean).join(' · ');
}

function formatProtein(value: unknown) {
  const protein = numberValue(value);
  return protein === undefined ? undefined : `${protein}g`;
}

function formatHunger(value: unknown) {
  const hunger = numberValue(value);
  return hunger === undefined ? undefined : `${hunger}/10`;
}

function formatCalorieRange(value: unknown) {
  if (!Array.isArray(value) || value.length !== 2) {
    return 'estimated calories';
  }
  return `${value[0]}-${value[1]} kcal`;
}

function formatPlainRange(value: unknown) {
  if (!Array.isArray(value) || value.length !== 2) {
    return undefined;
  }
  return `${value[0]}-${value[1]}`;
}

function rangeMidpoint(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) {
    return undefined;
  }
  const numbers = value.filter((item): item is number => typeof item === 'number' && Number.isFinite(item));
  if (numbers.length === 0) {
    return undefined;
  }
  const sum = numbers.reduce((total, item) => total + item, 0);
  return Math.round(sum / numbers.length);
}

function summaryValue(value: unknown) {
  if (typeof value === 'string') {
    return value;
  }
  if (value && typeof value === 'object' && 'summary' in value) {
    return stringValue((value as { summary?: unknown }).summary);
  }
  return undefined;
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function numberValue(value: unknown) {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}
