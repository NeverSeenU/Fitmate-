import { calculateDynamicCalibration, calculateEnergyTarget, summarizeFoodIntake } from '../services/energyTargets';
import type { DailyRecord, UserProfile } from '../domain/models';

export function runEnergyTargetTests() {
  const profile: UserProfile = {
    displayName: 'Test',
    email: 'test@example.com',
    phone: '',
    avatarInitial: 'T',
    heightCm: 175,
    weightKg: 75,
    age: 23,
    gender: 'male',
    goalLabel: 'fat loss',
    trainingFrequency: 'light 1-3 days',
    dietPreference: '',
    healthRiskNote: '',
  };
  const energy = calculateEnergyTarget({
    profile,
    foodCaloriesKcal: 1200,
    exerciseCaloriesKcal: 300,
    exerciseReturnRate: 0.5,
  });
  assert(energy.bmrCalories === 1734, 'BMR must use Mifflin-St Jeor for male profiles');
  assert(energy.activityFactor === 1.375, 'activity factor must map light training to 1.375');
  assert(energy.tdeeCalories === 2384, 'TDEE must equal rounded BMR times activity factor');
  assert(energy.dailyTargetCalories === 1884, 'fat loss target must use TDEE minus 500 kcal');
  assert(energy.exerciseCreditCalories === 150, 'exercise credit must support conservative 50 percent return');
  assert(energy.caloriesLeft === 834, 'calories left must include partial exercise credit');
  assert(energy.proteinTargetG === 135, 'fat loss protein target should be weight-based');
  assert(energy.fatTargetG === 52, 'fat target should reserve roughly 25 percent of daily calories');
  assert(energy.carbsTargetG === 219, 'carb target should use remaining calories after protein and fat');

  const records: DailyRecord[] = [
    { id: 'food-1', kind: 'food', title: 'Meal', status: 'done', text: '', done: true, caloriesKcal: 500, proteinG: 30, carbsG: 50, fatG: 18 },
    { id: 'food-2', kind: 'food', title: 'Draft', status: 'draft', text: '', done: false, caloriesKcal: 999, proteinG: 99 },
    { id: 'workout', kind: 'workout', title: 'Run', status: 'done', text: '', done: true, caloriesKcal: 250 },
  ];
  const intake = summarizeFoodIntake(records);
  assert(intake.caloriesKcal === 500, 'food intake must only include confirmed food records');
  assert(intake.proteinG === 30, 'food intake must aggregate confirmed protein');

  const rollingRecords: DailyRecord[] = [
    { id: 'old-food', kind: 'food', title: 'Old', status: 'done', text: '', done: true, caloriesKcal: 400, recordedAt: '2026-05-20T08:00:00.000Z' },
    { id: 'new-food', kind: 'food', title: 'New', status: 'done', text: '', done: true, caloriesKcal: 600, recordedAt: '2026-05-21T09:00:00.000Z' },
  ];
  const rolling = summarizeFoodIntake(rollingRecords, new Date('2026-05-21T12:00:00.000Z'));
  assert(rolling.caloriesKcal === 600, 'daily intake must refresh from the first food record after the previous 24-hour window');
  const expired = summarizeFoodIntake(rollingRecords, new Date('2026-05-22T10:00:00.000Z'));
  assert(expired.caloriesKcal === 0, 'daily intake must reset after 24 hours if no new food starts a new window');

  const insufficient = calculateDynamicCalibration({
    profile,
    records: rollingRecords,
    now: new Date('2026-05-24T12:00:00.000Z'),
  });
  assert(insufficient.status === 'insufficient_data', 'calibration must wait for enough weight and food history');

  const calibrationRecords: DailyRecord[] = [
    ...Array.from({ length: 14 }).map((_, index) => ({
      id: `food-${index}`,
      kind: 'food' as const,
      title: 'Logged food',
      status: 'done',
      text: '',
      done: true,
      caloriesKcal: 1880,
      recordedAt: new Date(Date.UTC(2026, 4, 1 + index, 18)).toISOString(),
    })),
    { id: 'weight-start', kind: 'weight', title: 'Weight', status: 'done', text: '', done: true, weightKg: 75, recordedAt: '2026-05-01T08:00:00.000Z' },
    { id: 'weight-end', kind: 'weight', title: 'Weight', status: 'done', text: '', done: true, weightKg: 74.8, recordedAt: '2026-05-15T08:00:00.000Z' },
  ];
  const calibration = calculateDynamicCalibration({
    profile,
    records: calibrationRecords,
    now: new Date('2026-05-16T12:00:00.000Z'),
  });
  assert(calibration.status === 'lower_target', 'slow fat-loss trend should recommend a lower target');
  assert(calibration.adjustmentCalories === -150, 'slow trend should use a conservative 150 kcal decrease');
  assert(calibration.foodDays === 14, 'calibration should count logged food days');
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}
