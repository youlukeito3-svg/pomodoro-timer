import type {
  AppData,
  DateStr,
  ExerciseDef,
  MealPlan,
  Stats,
  WorkoutSession,
} from "@/lib/types";
import { isWithinDays, todayStr } from "@/lib/date";
import { activeDatesFrom, computeStreak } from "./xp";

/**
 * RPGステータス。すべて実際の記録から導出する（飾りの数値を持たない）。
 *
 * 各ステータスは漸近関数で 0〜999 に写す:
 *
 *   stat(x) = 999 * (1 - exp(-x / k))
 *
 * 上限に到達しないので「カンストして伸びなくなる」ことがなく、
 * 一方で序盤は急に伸びるので初期の手応えが出る。k は「その値で
 * だいたい半分（≒500）になる量」を基準に決めてある。
 */

export const STAT_MAX = 999;

/** x=k のとき約632、x=0.693k のとき約500 になる */
function asymptotic(x: number, k: number): number {
  if (!Number.isFinite(x) || x <= 0) return 0;
  return Math.round(STAT_MAX * (1 - Math.exp(-x / k)));
}

/**
 * 各ステータスのスケール定数。
 * 「この程度やっている人が 500 前後」という基準で置いている。
 */
export const STAT_SCALE = {
  /** BIG3合計挙上が体重の5倍 → 約500 */
  str: 7.2,
  /** 直近28日の総ボリューム 180,000kg → 約600 */
  end: 200_000,
  /** 目標トレ日数を100%こなす → 約600 */
  vit: 1.1,
  /** 直近28日で自重・有酸素100セット → 約500 */
  agi: 150,
  /** 生涯30種目を経験 → 約500 */
  dex: 45,
  /** ストリーク＋食事達成で30ポイント → 約500 */
  mnd: 45,
} as const;

/** Epley 式による推定1RM */
export function estimate1RM(weightKg: number, reps: number): number {
  if (weightKg <= 0 || reps <= 0) return 0;
  if (reps === 1) return weightKg;
  return weightKg * (1 + reps / 30);
}

/** 種目ごとの自己ベスト推定1RM（全期間） */
export function bestOneRepMaxes(sessions: readonly WorkoutSession[]): Map<string, number> {
  const best = new Map<string, number>();
  for (const session of sessions) {
    for (const log of session.logs) {
      if (!log.done) continue;
      const est = estimate1RM(log.weightKg, log.reps);
      if (est > (best.get(log.exerciseId) ?? 0)) best.set(log.exerciseId, est);
    }
  }
  return best;
}

/**
 * このセッションで自己ベストを更新した種目数。
 * 「このセッションを除いた過去の最高」と比較する必要があるので、
 * 対象セッションは past に含めないこと。
 */
export function countPersonalRecords(
  session: WorkoutSession,
  past: readonly WorkoutSession[],
  minReps = 1,
): number {
  const previous = bestOneRepMaxes(past);
  const updated = new Set<string>();
  for (const log of session.logs) {
    if (!log.done || log.reps < minReps || log.weightKg <= 0) continue;
    const est = estimate1RM(log.weightKg, log.reps);
    if (est > (previous.get(log.exerciseId) ?? 0)) updated.add(log.exerciseId);
  }
  return updated.size;
}

const WINDOW_DAYS = 28;

export interface StatInputs {
  sessions: readonly WorkoutSession[];
  weights: AppData["weights"];
  mealPlans: readonly MealPlan[];
  exercises: Map<string, ExerciseDef>;
  bodyWeightKg: number;
  /** 週あたりの目標トレーニング日数 */
  daysPerWeek: number;
  today?: DateStr;
}

/** ステータス計算の途中経過。UIで「何が効いているか」を見せるために返す。 */
export interface StatDetail {
  /** 正規化前の生の値 */
  raw: number;
  value: number;
  /** 表示用の説明 */
  description: string;
}

export type StatDetails = Record<keyof Stats, StatDetail>;

export function computeStats(input: StatInputs): StatDetails {
  const today = input.today ?? todayStr();
  const completed = input.sessions.filter((s) => s.completedAt);
  const recent = completed.filter((s) => isWithinDays(s.date, WINDOW_DAYS, today));

  // --- STR: BIG3の推定1RM合計 ÷ 体重 -------------------------------------
  const best = bestOneRepMaxes(completed);
  let big3Total = 0;
  for (const [exerciseId, oneRm] of best) {
    if (input.exercises.get(exerciseId)?.isBig3) big3Total += oneRm;
  }
  const strRatio = input.bodyWeightKg > 0 ? big3Total / input.bodyWeightKg : 0;

  // --- END: 直近28日の総挙上ボリューム -----------------------------------
  let volume = 0;
  for (const session of recent) {
    for (const log of session.logs) {
      if (!log.done) continue;
      const def = input.exercises.get(log.exerciseId);
      const load = def?.isBodyweight ? input.bodyWeightKg * 0.4 + log.weightKg : log.weightKg;
      volume += load * log.reps;
    }
  }

  // --- VIT: 直近28日の実施日数 ÷ 目標日数 --------------------------------
  const trainedDays = new Set(recent.map((s) => s.date)).size;
  const targetDays = Math.max((input.daysPerWeek * WINDOW_DAYS) / 7, 1);
  const vitRatio = trainedDays / targetDays;

  // --- AGI: 直近28日の自重・有酸素セット数 -------------------------------
  let agileSets = 0;
  for (const session of recent) {
    for (const log of session.logs) {
      if (!log.done) continue;
      const def = input.exercises.get(log.exerciseId);
      if (def?.isBodyweight || def?.muscles.includes("cardio")) agileSets += 1;
    }
  }

  // --- DEX: 生涯のユニーク種目数 -----------------------------------------
  const uniqueExercises = new Set<string>();
  for (const session of completed) {
    for (const log of session.logs) {
      if (log.done) uniqueExercises.add(log.exerciseId);
    }
  }

  // --- MND: ストリーク ＋ 直近28日のカロリー目標達成日数 ------------------
  const streak = computeStreak(
    activeDatesFrom({ sessions: completed, weightDates: input.weights.map((w) => w.date) }),
    today,
  );
  const mealHitDays = input.mealPlans.filter(
    (p) => isWithinDays(p.date, WINDOW_DAYS, today) && p.eaten.length >= 3,
  ).length;
  const mndRaw = streak + mealHitDays;

  return {
    str: {
      raw: strRatio,
      value: asymptotic(strRatio, STAT_SCALE.str),
      description: `BIG3合計 ${Math.round(big3Total)}kg ÷ 体重 = 体重の${strRatio.toFixed(1)}倍`,
    },
    end: {
      raw: volume,
      value: asymptotic(volume, STAT_SCALE.end),
      description: `直近28日の総挙上量 ${Math.round(volume).toLocaleString("ja-JP")}kg`,
    },
    vit: {
      raw: vitRatio,
      value: asymptotic(vitRatio, STAT_SCALE.vit),
      description: `直近28日 ${trainedDays}日 / 目標 ${Math.round(targetDays)}日`,
    },
    agi: {
      raw: agileSets,
      value: asymptotic(agileSets, STAT_SCALE.agi),
      description: `直近28日の自重・有酸素 ${agileSets}セット`,
    },
    dex: {
      raw: uniqueExercises.size,
      value: asymptotic(uniqueExercises.size, STAT_SCALE.dex),
      description: `経験した種目 ${uniqueExercises.size}種`,
    },
    mnd: {
      raw: mndRaw,
      value: asymptotic(mndRaw, STAT_SCALE.mnd),
      description: `連続${streak}日 ＋ 食事目標達成${mealHitDays}日`,
    },
  };
}

export function statValues(details: StatDetails): Stats {
  return {
    str: details.str.value,
    end: details.end.value,
    vit: details.vit.value,
    agi: details.agi.value,
    dex: details.dex.value,
    mnd: details.mnd.value,
  };
}

/** ステータス合計。称号判定などに使う。 */
export function statTotal(stats: Stats): number {
  return stats.str + stats.end + stats.vit + stats.agi + stats.dex + stats.mnd;
}
