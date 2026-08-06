import type { AppData, DateStr, Macros, WorkoutSession } from "@/lib/types";
import { todayStr } from "@/lib/date";
import { EXERCISE_BY_ID } from "@/lib/workout/exercises";
import { generatePlan, type WorkoutPlan } from "@/lib/workout/generate";
import { calcCalorieTarget, type CalorieTarget } from "@/lib/nutrition/bmr";
import { generateMealPlan, type MealPlanResult } from "@/lib/nutrition/plan";
import { RECIPE_BY_ID, cachedRecipeMacros } from "@/lib/nutrition/recipes";
import { FOOD_BY_ID, macrosForGrams } from "@/lib/nutrition/foods";
import {
  activeDatesFrom,
  computeStreak,
  levelProgress,
  sumXp,
  type LevelProgress,
} from "@/lib/rpg/xp";
import {
  bestOneRepMaxes,
  computeStats,
  statValues,
  type StatDetails,
} from "@/lib/rpg/stats";
import {
  classForLevel,
  earnedTitleIds,
  nextClass,
  type ClassBand,
  type TitleContext,
} from "@/lib/rpg/titles";

/**
 * AppData から画面表示に必要な派生状態を組み立てる。
 *
 * 各ページで同じ計算を書くと、レベルとステータスの算出条件がずれて
 * 画面間で数字が食い違う。導出はすべてここに集約する。
 */

/** 直近の体重。記録が無ければ null。 */
export function latestWeight(data: AppData, today: DateStr = todayStr()): number | null {
  const sorted = [...data.weights]
    .filter((w) => w.date <= today)
    .sort((a, b) => b.date.localeCompare(a.date));
  return sorted[0]?.weightKg ?? null;
}

export function weightOn(data: AppData, date: DateStr): number | undefined {
  return data.weights.find((w) => w.date === date)?.weightKg;
}

/** 過去最長の連続記録日数 */
export function bestStreak(data: AppData): number {
  const dates = [...activeDatesFrom({
    sessions: data.sessions,
    weightDates: data.weights.map((w) => w.date),
  })].sort();

  let best = 0;
  let run = 0;
  let previous: string | null = null;

  for (const date of dates) {
    if (previous && isNextDay(previous, date)) run += 1;
    else run = 1;
    best = Math.max(best, run);
    previous = date;
  }
  return best;
}

function isNextDay(a: DateStr, b: DateStr): boolean {
  const [ay, am, ad] = a.split("-").map(Number);
  const next = new Date(ay, am - 1, ad + 1);
  const key = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(
    next.getDate(),
  ).padStart(2, "0")}`;
  return key === b;
}

/** 生涯の総挙上量(kg) */
export function lifetimeVolume(data: AppData, bodyWeightKg: number): number {
  let total = 0;
  for (const session of data.sessions) {
    if (!session.completedAt) continue;
    for (const log of session.logs) {
      if (!log.done) continue;
      const def = EXERCISE_BY_ID.get(log.exerciseId);
      const load = def?.isBodyweight ? bodyWeightKg * 0.4 + log.weightKg : log.weightKg;
      total += load * log.reps;
    }
  }
  return total;
}

export function sessionOn(data: AppData, date: DateStr): WorkoutSession | undefined {
  return data.sessions.find((s) => s.date === date);
}

export interface GameState {
  /** プロフィール未登録ならセットアップが必要 */
  ready: boolean;
  bodyWeightKg: number;
  totalXp: number;
  progress: LevelProgress;
  level: number;
  classBand: ClassBand;
  next: { band: ClassBand; levelsLeft: number } | null;
  statDetails: StatDetails;
  stats: ReturnType<typeof statValues>;
  streak: number;
  bestStreak: number;
  earnedTitles: string[];
  titleContext: TitleContext;
  /** 今日のトレーニングプラン。プロフィール未設定なら null。 */
  plan: WorkoutPlan | null;
  session: WorkoutSession | undefined;
  target: CalorieTarget | null;
  meals: MealPlanResult | null;
  /** 今日食べた分の栄養（実績） */
  consumed: Macros;
}

/** 体重が未記録のときの暫定値。プロフィール登録時に必ず1件入るので通常は使われない。 */
const FALLBACK_WEIGHT = 60;

export function selectGameState(data: AppData, today: DateStr = todayStr()): GameState {
  const totalXp = sumXp(data.xpEvents);
  const progress = levelProgress(totalXp);
  const level = progress.level;

  const bodyWeightKg = latestWeight(data, today) ?? FALLBACK_WEIGHT;
  const completed = data.sessions.filter((s) => s.completedAt);

  const statDetails = computeStats({
    sessions: data.sessions,
    weights: data.weights,
    mealPlans: data.mealPlans,
    exercises: EXERCISE_BY_ID,
    bodyWeightKg,
    daysPerWeek: data.profile?.daysPerWeek ?? 3,
    today,
  });
  const stats = statValues(statDetails);

  const streak = computeStreak(
    activeDatesFrom({ sessions: data.sessions, weightDates: data.weights.map((w) => w.date) }),
    today,
  );

  const titleContext: TitleContext = {
    level,
    stats,
    sessionCount: completed.length,
    streak,
    bestStreak: bestStreak(data),
    lifetimeVolume: lifetimeVolume(data, bodyWeightKg),
    weightLogCount: data.weights.length,
    uniqueExerciseCount: statDetails.dex.raw,
    best1RM: bestOneRepMaxes(completed),
  };

  // その日のプランは「その日より前の記録」だけから決める。今日のセッションを
  // 含めると、完了した瞬間に推奨重量が次回向けの値に書き換わってしまう。
  const priorSessions = data.sessions.filter((s) => s.date < today);

  const plan = data.profile
    ? generatePlan({
        profile: data.profile,
        date: today,
        level,
        sessions: priorSessions,
        bodyWeightKg,
      })
    : null;

  const target = data.profile
    ? calcCalorieTarget({
        profile: data.profile,
        weightKg: bodyWeightKg,
        workoutKcal: plan?.estimatedKcal ?? 0,
        today,
      })
    : null;

  const meals =
    data.profile && target
      ? generateMealPlan({
          date: today,
          target,
          pantry: data.pantry,
          goal: data.profile.goal,
          dietaryNg: data.profile.dietaryNg,
        })
      : null;

  return {
    ready: data.profile !== null,
    bodyWeightKg,
    totalXp,
    progress,
    level,
    classBand: classForLevel(level),
    next: nextClass(level),
    statDetails,
    stats,
    streak,
    bestStreak: titleContext.bestStreak,
    earnedTitles: earnedTitleIds(titleContext),
    titleContext,
    plan,
    session: sessionOn(data, today),
    target,
    meals,
    consumed: consumedMacros(data, today),
  };
}

/**
 * その日に実際に食べた分の栄養。
 * 「食べた」に印を付けた献立と、献立以外に食べたもの（extras）の合計。
 */
export function consumedMacros(data: AppData, date: DateStr): Macros {
  const stored = data.mealPlans.find((p) => p.date === date);
  if (!stored) return { kcal: 0, protein: 0, fat: 0, carb: 0 };

  let kcal = 0, protein = 0, fat = 0, carb = 0;

  // 保存済みの献立から、食べたスロットの分
  const eaten = new Set(stored.eaten);
  for (const meal of stored.meals) {
    if (!eaten.has(meal.slot)) continue;
    const recipe = RECIPE_BY_ID.get(meal.recipeId);
    if (!recipe) continue;
    const m = cachedRecipeMacros(recipe);
    kcal += m.kcal * meal.servings;
    protein += m.protein * meal.servings;
    fat += m.fat * meal.servings;
    carb += m.carb * meal.servings;
  }

  // 献立以外に食べた分
  for (const extra of stored.extras) {
    const food = FOOD_BY_ID.get(extra.foodId);
    if (!food) continue;
    const m = macrosForGrams(food, extra.grams);
    kcal += m.kcal;
    protein += m.protein;
    fat += m.fat;
    carb += m.carb;
  }

  return {
    kcal: Math.round(kcal),
    protein: Math.round(protein),
    fat: Math.round(fat),
    carb: Math.round(carb),
  };
}
