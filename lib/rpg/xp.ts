import type { DateStr, ExerciseDef, WorkoutSession, XpEvent } from "@/lib/types";
import { daysBetween, todayStr } from "@/lib/date";

/**
 * XPカーブ。
 *
 *   累積XP(L) = A * (L - 1)^P
 *   レベル(xp) = 1 + floor( (xp / A)^(1/P) )
 *
 * 冪乗則なので逆関数が閉じた形で書け、レベル判定が O(1) で済む
 * （毎レベルの必要量をループで足し上げる必要がない）。
 *
 * A=10, P=1.35 での到達点:
 *   Lv.10      194 XP        Lv.1,000   112,000 XP
 *   Lv.50    1,912 XP        Lv.3,000   460,000 XP
 *   Lv.100   4,944 XP        Lv.5,000   986,000 XP
 *   Lv.500  43,900 XP        Lv.9,999 2,500,000 XP
 *
 * 初回トレーニング（約400XP）で Lv.16 前後まで一気に上がり、
 * 1ヶ月で Lv.190、1年で Lv.900、5年で Lv.3,000 前後。
 * Lv.9999 は一生をかけた目標として機能する重みになっている。
 */
export const XP_CURVE_A = 10;
export const XP_CURVE_P = 1.35;
export const MAX_LEVEL = 9999;

/** 浮動小数の丸め誤差でレベルが 1 下がるのを防ぐための許容値 */
const EPSILON = 1e-9;

/**
 * そのレベルに到達するのに必要な累積XP。Lv.1 は 0。
 *
 * 切り上げなのは意図的。round にすると閾値が実際の曲線より下に丸められ、
 * その XP をちょうど持っていても levelFromXp が 1 つ下のレベルを返してしまう
 * （＝「必要XPを満たしたのに上がらない」状態になる）。
 * ceil にすることで levelFromXp(totalXpForLevel(L)) === L が全レベルで成り立つ。
 */
export function totalXpForLevel(level: number): number {
  const clamped = Math.min(Math.max(Math.floor(level), 1), MAX_LEVEL);
  return Math.ceil(XP_CURVE_A * Math.pow(clamped - 1, XP_CURVE_P));
}

/** 累積XPから現在レベルを求める */
export function levelFromXp(totalXp: number): number {
  if (!Number.isFinite(totalXp) || totalXp <= 0) return 1;
  const raw = Math.pow(totalXp / XP_CURVE_A, 1 / XP_CURVE_P);
  const level = 1 + Math.floor(raw + EPSILON);
  return Math.min(Math.max(level, 1), MAX_LEVEL);
}

export interface LevelProgress {
  level: number;
  /** 累積XP */
  totalXp: number;
  /** 現レベルに入ってから稼いだXP */
  xpIntoLevel: number;
  /** 次のレベルまでに必要なXPの総量 */
  xpForThisLevel: number;
  /** 次のレベルまであと何XPか */
  xpToNext: number;
  /** 0..1 のレベル内進捗 */
  ratio: number;
  /** Lv.9999 までの全体進捗 0..1 */
  overallRatio: number;
  isMax: boolean;
}

export function levelProgress(totalXp: number): LevelProgress {
  const level = levelFromXp(totalXp);
  const isMax = level >= MAX_LEVEL;
  const floor = totalXpForLevel(level);
  const ceil = isMax ? floor : totalXpForLevel(level + 1);
  const xpForThisLevel = Math.max(ceil - floor, 1);
  const xpIntoLevel = Math.max(totalXp - floor, 0);

  return {
    level,
    totalXp,
    xpIntoLevel,
    xpForThisLevel,
    xpToNext: isMax ? 0 : Math.max(ceil - totalXp, 0),
    ratio: isMax ? 1 : Math.min(xpIntoLevel / xpForThisLevel, 1),
    overallRatio: Math.min(totalXp / totalXpForLevel(MAX_LEVEL), 1),
    isMax,
  };
}

export function sumXp(events: readonly XpEvent[]): number {
  return events.reduce((acc, e) => acc + e.amount, 0);
}

// ---------------------------------------------------------------------------
// XPの獲得量
// ---------------------------------------------------------------------------

/** トレーニングを完了しただけで入る基礎XP */
export const BASE_WORKOUT_XP = 100;
/** 挙上ボリューム(kg) をこの値で割った分がXPになる */
export const VOLUME_XP_DIVISOR = 50;
/** 全メニュー完遂ボーナス */
export const ALL_DONE_BONUS = 50;
/** 推定1RM自己ベスト更新ボーナス */
export const PR_BONUS = 200;
/** 体重を記録した日のXP */
export const WEIGHT_LOG_XP = 20;
/** カロリー目標を達成した日のXP */
export const MEAL_TARGET_XP = 50;

/**
 * 連続記録日数による倍率。30日で頭打ちの 1.5倍。
 * 青天井にすると復帰勢が永久に追いつけなくなるので上限を設ける。
 */
export function streakMultiplier(streakDays: number): number {
  return 1 + Math.min(Math.max(streakDays, 0), 30) / 60;
}

/**
 * セッションの総挙上ボリューム(kg)。
 * 自重種目は体重の 40% を負荷とみなして換算する
 * （腕立てなどは体重の全部が乗るわけではないため）。
 */
export function sessionVolume(
  session: WorkoutSession,
  exercises: Map<string, ExerciseDef>,
  bodyWeightKg: number,
): number {
  let volume = 0;
  for (const log of session.logs) {
    if (!log.done) continue;
    const def = exercises.get(log.exerciseId);
    const load = def?.isBodyweight ? bodyWeightKg * 0.4 + log.weightKg : log.weightKg;
    volume += load * log.reps;
  }
  return volume;
}

export interface WorkoutXpBreakdown {
  base: number;
  volume: number;
  allDone: number;
  personalRecords: number;
  multiplier: number;
  total: number;
}

/** トレーニング完了時のXPを内訳付きで計算する（UIで内訳を見せるため） */
export function computeWorkoutXp(params: {
  session: WorkoutSession;
  exercises: Map<string, ExerciseDef>;
  bodyWeightKg: number;
  /** 予定されていた総セット数。全部 done なら完遂ボーナス。 */
  plannedSetCount: number;
  /** 自己ベストを更新した種目数 */
  personalRecordCount: number;
  streakDays: number;
}): WorkoutXpBreakdown {
  const { session, exercises, bodyWeightKg, plannedSetCount, personalRecordCount, streakDays } =
    params;

  const doneCount = session.logs.filter((l) => l.done).length;
  const volume = sessionVolume(session, exercises, bodyWeightKg);

  const base = BASE_WORKOUT_XP;
  const volumeXp = Math.round(volume / VOLUME_XP_DIVISOR);
  const allDone = plannedSetCount > 0 && doneCount >= plannedSetCount ? ALL_DONE_BONUS : 0;
  const prXp = personalRecordCount * PR_BONUS;
  const multiplier = streakMultiplier(streakDays);

  const total = Math.round((base + volumeXp + allDone + prXp) * multiplier);

  return { base, volume: volumeXp, allDone, personalRecords: prXp, multiplier, total };
}

// ---------------------------------------------------------------------------
// ストリーク
// ---------------------------------------------------------------------------

/**
 * 連続記録日数。
 *
 * 「今日」または「昨日」から遡って途切れるまでを数える。今日まだ何も
 * 記録していない時点でストリークが 0 に見えると萎えるので、昨日までの
 * 連続を維持中として扱う。
 */
export function computeStreak(activeDates: Iterable<DateStr>, today: DateStr = todayStr()): number {
  const set = new Set(activeDates);
  if (set.size === 0) return 0;

  // 起点は今日、無ければ昨日。どちらも無ければ途切れている。
  let cursor: DateStr;
  if (set.has(today)) {
    cursor = today;
  } else {
    const yesterday = addDaysStr(today, -1);
    if (!set.has(yesterday)) return 0;
    cursor = yesterday;
  }

  let streak = 0;
  while (set.has(cursor)) {
    streak += 1;
    cursor = addDaysStr(cursor, -1);
  }
  return streak;
}

// date.ts の addDays と同じだが、循環 import を避けるため最小実装を持つ
function addDaysStr(s: DateStr, days: number): DateStr {
  const [y, m, d] = s.split("-").map(Number);
  const date = new Date(y, m - 1, d + days);
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/** 記録があった日付の集合（トレーニング完了 or 体重記録） */
export function activeDatesFrom(params: {
  sessions: readonly WorkoutSession[];
  weightDates: readonly DateStr[];
}): Set<DateStr> {
  const dates = new Set<DateStr>();
  for (const s of params.sessions) {
    if (s.completedAt) dates.add(s.date);
  }
  for (const d of params.weightDates) dates.add(d);
  return dates;
}

/** 直近 n 日以内のイベントに絞る */
export function recentEvents(events: readonly XpEvent[], days: number, today: DateStr = todayStr()) {
  return events.filter((e) => {
    const diff = daysBetween(e.date, today);
    return diff >= 0 && diff < days;
  });
}
