import { calculateEnergyTarget, summarizeFoodIntake } from '../services/energyTargets';
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

  const records: DailyRecord[] = [
    { id: 'food-1', kind: 'food', title: 'Meal', status: 'done', text: '', done: true, caloriesKcal: 500, proteinG: 30, carbsG: 50, fatG: 18 },
    { id: 'food-2', kind: 'food', title: 'Draft', status: 'draft', text: '', done: false, caloriesKcal: 999, proteinG: 99 },
    { id: 'workout', kind: 'workout', title: 'Run', status: 'done', text: '', done: true, caloriesKcal: 250 },
  ];
  const intake = summarizeFoodIntake(records);
  assert(intake.caloriesKcal === 500, 'food intake must only include confirmed food records');
  assert(intake.proteinG === 30, 'food intake must aggregate confirmed protein');
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}
