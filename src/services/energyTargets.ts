import type { DailyRecord, UserProfile } from '../domain/models';

export type GoalMode = 'fat_loss' | 'maintenance' | 'muscle_gain';

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
  return {
    bmrCalories,
    activityFactor,
    tdeeCalories,
    dailyTargetCalories,
    exerciseCreditCalories,
    caloriesLeft,
    proteinTargetG,
    progress: dailyTargetCalories > 0 ? Math.max(0, foodCaloriesKcal) / dailyTargetCalories : 0,
    goalMode,
  };
}

export function summarizeFoodIntake(records: DailyRecord[]) {
  return records
    .filter((record) => record.kind === 'food' && record.done)
    .reduce((summary, record) => ({
      count: summary.count + 1,
      caloriesKcal: summary.caloriesKcal + (record.caloriesKcal ?? 0),
      proteinG: summary.proteinG + (record.proteinG ?? 0),
      carbsG: summary.carbsG + (record.carbsG ?? 0),
      fatG: summary.fatG + (record.fatG ?? 0),
    }), { count: 0, caloriesKcal: 0, proteinG: 0, carbsG: 0, fatG: 0 });
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
