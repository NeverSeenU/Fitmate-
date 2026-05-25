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

export type DynamicCalibrationInput = {
  profile: UserProfile;
  records: DailyRecord[];
  now?: Date;
};

export type DynamicCalibration = {
  status: 'insufficient_data' | 'keep_target' | 'lower_target' | 'raise_target';
  title: string;
  message: string;
  adjustmentCalories: number;
  confidence: number;
  foodDays: number;
  weightDays: number;
  actualWeeklyWeightChangeKg?: number;
  expectedWeeklyWeightChangeKg?: number;
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

export function calculateDynamicCalibration({
  profile,
  records,
  now = new Date(),
}: DynamicCalibrationInput): DynamicCalibration {
  const cutoff = new Date(now.getTime() - (21 * DAY_MS));
  const weights = records
    .filter((record) => (record.kind === 'weight' || record.weightKg !== undefined) && record.weightKg !== undefined)
    .map((record) => ({ value: record.weightKg ?? 0, time: recordTime(record) }))
    .filter((item): item is { value: number; time: Date } => (
      item.time instanceof Date && item.time >= cutoff && item.time <= now
    ))
    .sort((a, b) => a.time.getTime() - b.time.getTime());
  const foodByDay = new Map<string, number>();
  records
    .filter((record) => record.kind === 'food' && record.done && record.caloriesKcal !== undefined)
    .forEach((record) => {
      const time = recordTime(record);
      if (!time || time < cutoff || time > now) return;
      const key = time.toISOString().slice(0, 10);
      foodByDay.set(key, (foodByDay.get(key) ?? 0) + (record.caloriesKcal ?? 0));
    });
  const first = weights[0];
  const last = weights[weights.length - 1];
  const weightDays = first && last ? Math.round((last.time.getTime() - first.time.getTime()) / DAY_MS) : 0;
  const foodDays = foodByDay.size;
  if (!first || !last || weightDays < 10 || foodDays < 7) {
    return {
      status: 'insufficient_data',
      title: '动态校准准备中',
      message: '需要至少 10 天体重趋势和 7 天饮食记录，FitMate 才会调整每日目标。',
      adjustmentCalories: 0,
      confidence: 0.35,
      foodDays,
      weightDays,
    };
  }
  const baseEnergy = calculateEnergyTarget({ profile, foodCaloriesKcal: 0 });
  const averageFoodCalories = [...foodByDay.values()].reduce((total, value) => total + value, 0) / foodDays;
  const actualWeeklyWeightChangeKg = ((last.value - first.value) / weightDays) * 7;
  const expectedWeeklyWeightChangeKg = ((averageFoodCalories - baseEnergy.tdeeCalories) * 7) / 7700;
  const gap = actualWeeklyWeightChangeKg - expectedWeeklyWeightChangeKg;
  if (baseEnergy.goalMode === 'fat_loss' && gap > 0.18) {
    return {
      status: 'lower_target',
      title: '建议下调目标',
      message: '过去趋势比预期下降慢。先把每日目标下调 150 kcal，继续观察 7 天。',
      adjustmentCalories: -150,
      confidence: 0.72,
      foodDays,
      weightDays,
      actualWeeklyWeightChangeKg,
      expectedWeeklyWeightChangeKg,
    };
  }
  if (baseEnergy.goalMode === 'fat_loss' && gap < -0.45) {
    return {
      status: 'raise_target',
      title: '建议略微加餐',
      message: '体重下降快于预期。为保护训练表现和情绪稳定，可把每日目标上调 100 kcal。',
      adjustmentCalories: 100,
      confidence: 0.68,
      foodDays,
      weightDays,
      actualWeeklyWeightChangeKg,
      expectedWeeklyWeightChangeKg,
    };
  }
  return {
    status: 'keep_target',
    title: '目标暂时保持',
    message: '体重趋势和记录摄入基本匹配。继续保持当前目标，数据更多后再校准。',
    adjustmentCalories: 0,
    confidence: 0.7,
    foodDays,
    weightDays,
    actualWeeklyWeightChangeKg,
    expectedWeeklyWeightChangeKg,
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

function recordTime(record: DailyRecord) {
  if (!record.recordedAt) {
    return null;
  }
  const time = new Date(record.recordedAt);
  return Number.isFinite(time.getTime()) ? time : null;
}
