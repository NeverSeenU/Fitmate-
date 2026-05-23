import type { DailyRecord, UserProfile } from '../domain/models';

export type GoalMode = 'fat_loss' | 'maintenance' | 'muscle_gain';

export const ACTIVITY_LEVELS = [
  { label: '久坐', value: 'sedentary', factor: 1.2 },
  { label: '轻动', value: 'lightly_active', factor: 1.375 },
  { label: '中等', value: 'moderately_active', factor: 1.55 },
  { label: '高强', value: 'very_active', factor: 1.725 },
  { label: '超高', value: 'extra_active', factor: 1.9 },
] as const;

export type EnergyTargetInput = {
  profile: UserProfile;
  foodCaloriesKcal: number;
  exerciseCaloriesKcal?: number;
  exerciseReturnRate?: number;
};

export type EnergyTarget = {
  bmrCalories: number;
  activityFactor: number;
  tdeeCalories: number;
  dailyTargetCalories: number;
  exerciseCreditCalories: number;
  caloriesLeft: number;
  proteinTargetG: number;
  carbsTargetG: number;
  fatTargetG: number;
  progress: number;
  goalMode: GoalMode;
};

export function calculateEnergyTarget({
  profile,
  foodCaloriesKcal,
  exerciseCaloriesKcal = 0,
  exerciseReturnRate = 0.6,
}: EnergyTargetInput): EnergyTarget {
  const bmrCalories = calculateBmr(profile);
  const activityFactor = inferActivityFactor(profile.trainingFrequency);
  const tdeeCalories = Math.round(bmrCalories * activityFactor);
  const goalMode = inferGoalMode(profile.goalLabel);
  const dailyTargetCalories = calculateDailyTarget(tdeeCalories, goalMode);
  const exerciseCreditCalories = Math.round(Math.max(0, exerciseCaloriesKcal) * clamp(exerciseReturnRate, 0.5, 0.7));
  const caloriesLeft = dailyTargetCalories - Math.max(0, foodCaloriesKcal) + exerciseCreditCalories;
  const proteinTargetG = calculateProteinTarget(profile.weightKg, goalMode);
  const fatTargetG = Math.round((dailyTargetCalories * 0.25) / 9);
  const proteinCalories = proteinTargetG * 4;
  const fatCalories = fatTargetG * 9;
  const carbsTargetG = Math.max(0, Math.round((dailyTargetCalories - proteinCalories - fatCalories) / 4));
  return {
    bmrCalories,
    activityFactor,
    tdeeCalories,
    dailyTargetCalories,
    exerciseCreditCalories,
    caloriesLeft,
    proteinTargetG,
    carbsTargetG,
    fatTargetG,
    progress: dailyTargetCalories > 0 ? Math.max(0, foodCaloriesKcal) / dailyTargetCalories : 0,
    goalMode,
  };
}

export function summarizeFoodIntake(records: DailyRecord[], now = new Date()) {
  return recordsInActiveFoodWindow(records, now)
    .filter((record) => record.kind === 'food' && record.done)
    .reduce((summary, record) => ({
      count: summary.count + 1,
      caloriesKcal: summary.caloriesKcal + (record.caloriesKcal ?? 0),
      proteinG: summary.proteinG + (record.proteinG ?? 0),
      carbsG: summary.carbsG + (record.carbsG ?? 0),
      fatG: summary.fatG + (record.fatG ?? 0),
    }), { count: 0, caloriesKcal: 0, proteinG: 0, carbsG: 0, fatG: 0 });
}

export function recordsInActiveFoodWindow(records: DailyRecord[], now = new Date()) {
  const doneFoodRecords = records
    .filter((record) => record.kind === 'food' && record.done)
    .map((record) => ({ record, time: recordTime(record) }))
    .filter((item): item is { record: DailyRecord; time: Date } => Boolean(item.time))
    .sort((a, b) => a.time.getTime() - b.time.getTime());

  if (doneFoodRecords.length === 0) {
    return records;
  }

  let anchor = doneFoodRecords[0].time;
  doneFoodRecords.forEach(({ time }) => {
    if (time.getTime() >= anchor.getTime() + DAY_MS) {
      anchor = time;
    }
  });

  const end = new Date(anchor.getTime() + DAY_MS);
  if (now.getTime() >= end.getTime()) {
    return records.filter((record) => record.kind !== 'food');
  }

  return records.filter((record) => {
    if (record.kind !== 'food') {
      return true;
    }
    const time = recordTime(record);
    if (!time) {
      return true;
    }
    return time.getTime() >= anchor.getTime() && time.getTime() < end.getTime();
  });
}

function calculateBmr(profile: UserProfile) {
  const base = (10 * profile.weightKg) + (6.25 * profile.heightCm) - (5 * profile.age);
  return Math.round(profile.gender === 'male' ? base + 5 : base - 161);
}

function calculateDailyTarget(tdeeCalories: number, goalMode: GoalMode) {
  if (goalMode === 'maintenance') {
    return tdeeCalories;
  }
  if (goalMode === 'muscle_gain') {
    return tdeeCalories + 200;
  }
  return Math.max(1100, tdeeCalories - 500);
}

function calculateProteinTarget(weightKg: number, goalMode: GoalMode) {
  const multiplier = goalMode === 'fat_loss' ? 1.8 : goalMode === 'muscle_gain' ? 1.7 : 1.4;
  return Math.round(Math.max(0, weightKg) * multiplier);
}

function inferActivityFactor(trainingFrequency: string) {
  const value = trainingFrequency.toLowerCase();
  const exact = ACTIVITY_LEVELS.find((level) => level.value === value);
  if (exact) return exact.factor;
  if (value.includes('体力') || value.includes('extra')) return 1.9;
  if (value.includes('每天') || value.includes('daily') || value.includes('6') || value.includes('7')) return 1.725;
  if (value.includes('4') || value.includes('5') || value.includes('中等') || value.includes('moderate')) return 1.55;
  if (value.includes('1') || value.includes('2') || value.includes('3') || value.includes('轻') || value.includes('light')) return 1.375;
  if (value.includes('很少') || value.includes('久坐') || value.includes('sedentary')) return 1.2;
  return 1.375;
}

function inferGoalMode(goalLabel: string): GoalMode {
  const value = goalLabel.toLowerCase();
  if (value.includes('增肌') || value.includes('bulk') || value.includes('muscle')) return 'muscle_gain';
  if (value.includes('维持') || value.includes('maintenance')) return 'maintenance';
  return 'fat_loss';
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

const DAY_MS = 24 * 60 * 60 * 1000;

function recordTime(record: DailyRecord) {
  if (!record.recordedAt) {
    return null;
  }
  const time = new Date(record.recordedAt);
  return Number.isFinite(time.getTime()) ? time : null;
}
