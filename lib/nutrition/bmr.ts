import type { ActivityLevel, Goal, Macros, Sex, UserProfile } from "@/lib/types";
import { ageFrom, todayStr } from "@/lib/date";

/**
 * 基礎代謝・消費カロリー・PFC目標の計算。
 *
 * BMR は Mifflin-St Jeor 式（現在もっとも広く使われ、Harris-Benedict より
 * 実測との誤差が小さいとされる）を使う。
 */

/** 活動係数。ActivityLevel 1〜5 に対応。 */
export const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  1: 1.2,
  2: 1.375,
  3: 1.55,
  4: 1.725,
  5: 1.9,
};

/** 目標ごとのカロリー調整幅(kcal) */
export const GOAL_ADJUSTMENT: Record<Goal, number> = {
  bulk: 300,
  cut: -400,
  maintain: 0,
};

/** 目標ごとの体重1kgあたりタンパク質(g) */
export const PROTEIN_PER_KG: Record<Goal, number> = {
  bulk: 2.0,
  cut: 2.2,
  maintain: 1.6,
};

/** 脂質は総カロリーのこの割合 */
export const FAT_RATIO = 0.25;

/** Mifflin-St Jeor 式による基礎代謝(kcal/日) */
export function calcBMR(params: {
  sex: Sex;
  weightKg: number;
  heightCm: number;
  age: number;
}): number {
  const { sex, weightKg, heightCm, age } = params;
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return sex === "male" ? base + 5 : base - 161;
}

/** 活動量を加味した1日の総消費カロリー */
export function calcTDEE(bmr: number, activityLevel: ActivityLevel): number {
  return bmr * ACTIVITY_FACTORS[activityLevel];
}

export interface CalorieTarget extends Macros {
  bmr: number;
  tdee: number;
  /** トレーニングによる上乗せ分 */
  workoutKcal: number;
}

/**
 * その日の目標カロリーと PFC。
 *
 * 減量時に下がりすぎないよう、基礎代謝の 1.1 倍を下限とする
 * （これを下回る設定は筋量の維持という目的と矛盾する）。
 */
export function calcCalorieTarget(params: {
  profile: UserProfile;
  weightKg: number;
  /** その日のトレーニングによる推定消費 */
  workoutKcal?: number;
  today?: string;
}): CalorieTarget {
  const { profile, weightKg, workoutKcal = 0 } = params;
  const age = ageFrom(profile.birthDate, params.today ?? todayStr());

  const bmr = calcBMR({
    sex: profile.sex,
    weightKg,
    heightCm: profile.heightCm,
    age,
  });
  const tdee = calcTDEE(bmr, profile.activityLevel);

  const floor = bmr * 1.1;
  const kcal = Math.max(tdee + GOAL_ADJUSTMENT[profile.goal] + workoutKcal, floor);

  const protein = weightKg * PROTEIN_PER_KG[profile.goal];
  const fat = (kcal * FAT_RATIO) / 9;
  // 残りを炭水化物に充てる。負にならないよう 0 で止める。
  const carb = Math.max((kcal - protein * 4 - fat * 9) / 4, 0);

  return {
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    workoutKcal: Math.round(workoutKcal),
    kcal: Math.round(kcal),
    protein: Math.round(protein),
    fat: Math.round(fat),
    carb: Math.round(carb),
  };
}

/** PFC からカロリーを逆算する（レシピの合計値チェックなどに使う） */
export function macrosToKcal(m: Pick<Macros, "protein" | "fat" | "carb">): number {
  return m.protein * 4 + m.fat * 9 + m.carb * 4;
}

export function addMacros(a: Macros, b: Macros): Macros {
  return {
    kcal: a.kcal + b.kcal,
    protein: a.protein + b.protein,
    fat: a.fat + b.fat,
    carb: a.carb + b.carb,
  };
}

export function scaleMacros(m: Macros, factor: number): Macros {
  return {
    kcal: m.kcal * factor,
    protein: m.protein * factor,
    fat: m.fat * factor,
    carb: m.carb * factor,
  };
}

export const ZERO_MACROS: Macros = { kcal: 0, protein: 0, fat: 0, carb: 0 };

export function roundMacros(m: Macros): Macros {
  return {
    kcal: Math.round(m.kcal),
    protein: Math.round(m.protein),
    fat: Math.round(m.fat),
    carb: Math.round(m.carb),
  };
}
