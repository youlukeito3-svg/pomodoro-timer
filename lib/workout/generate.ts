import type {
  DateStr,
  ExerciseDef,
  MuscleGroup,
  PlannedExercise,
  SplitKey,
  UserProfile,
  WorkoutSession,
} from "@/lib/types";
import { daysBetween, seededShuffle } from "@/lib/date";
import { EXERCISES, EXERCISE_BY_ID } from "./exercises";

/**
 * 日次トレーニングプランの生成。
 *
 * 「同じ入力なら必ず同じプラン」になるよう、乱数は日付を種にした
 * 決定的シャッフルだけを使う。こうしないとページを開き直すたびに
 * メニューが変わってしまい、記録との対応が取れなくなる。
 */

export interface WorkoutPlan {
  date: DateStr;
  split: SplitKey;
  exercises: PlannedExercise[];
  /** 消費カロリーの目安 */
  estimatedKcal: number;
  estimatedMinutes: number;
}

/** 週あたりの日数ごとの7日周期ローテーション */
const ROTATIONS: Record<number, SplitKey[]> = {
  2: ["fullA", "rest", "rest", "fullB", "rest", "rest", "rest"],
  3: ["push", "rest", "pull", "rest", "legs", "rest", "rest"],
  4: ["upper", "lower", "rest", "upper", "lower", "rest", "rest"],
  5: ["push", "pull", "legs", "upper", "lower", "rest", "rest"],
  6: ["push", "pull", "legs", "push", "pull", "legs", "rest"],
};

/** 分割ごとの対象部位（優先度順） */
const SPLIT_MUSCLES: Record<Exclude<SplitKey, "rest">, MuscleGroup[]> = {
  fullA: ["chest", "back", "quads", "abs"],
  fullB: ["shoulders", "back", "hamstrings", "glutes", "abs"],
  push: ["chest", "shoulders", "triceps"],
  pull: ["back", "biceps"],
  legs: ["quads", "hamstrings", "glutes", "calves"],
  upper: ["chest", "back", "shoulders", "biceps", "triceps"],
  lower: ["quads", "hamstrings", "glutes", "calves", "abs"],
};

/** その日の分割を決める。開始日からの経過日数で7日周期を回す。 */
export function splitForDate(profile: UserProfile, date: DateStr): SplitKey {
  const rotation = ROTATIONS[profile.daysPerWeek] ?? ROTATIONS[3];
  const dayIndex = daysBetween(profile.startedAt, date);
  // 開始日より前の日付を見たときに負のインデックスにならないようにする
  const index = ((dayIndex % 7) + 7) % 7;
  return rotation[index];
}

/**
 * レベルに応じた種目難易度の解禁。
 *
 * 序盤から選択肢が枯れないよう早めに開く。Lv.100（約1週間）で3、
 * Lv.400 で4、Lv.1000（数ヶ月）で全開放。
 */
export function maxDifficultyForLevel(level: number): number {
  if (level >= 1000) return 5;
  if (level >= 400) return 4;
  if (level >= 100) return 3;
  return 2;
}

/** 1日に組む種目数 */
const EXERCISE_COUNT = 5;
/** 同じ部位を詰め込みすぎないための上限 */
const MAX_PER_MUSCLE = 2;
/** 最低限入れるコンパウンド種目数 */
const MIN_COMPOUND = 2;

export function availableExercises(profile: UserProfile, level: number): ExerciseDef[] {
  const maxDifficulty = maxDifficultyForLevel(level);
  const owned = new Set(profile.equipment);
  return EXERCISES.filter((e) => owned.has(e.equipment) && e.difficulty <= maxDifficulty);
}

/** ある種目の直近の実施内容（完了セットのみ） */
export function lastPerformance(
  exerciseId: string,
  sessions: readonly WorkoutSession[],
): { weightKg: number; reps: number; allHitTop: boolean } | null {
  const relevant = sessions
    .filter((s) => s.completedAt && s.logs.some((l) => l.exerciseId === exerciseId && l.done))
    .sort((a, b) => b.date.localeCompare(a.date));

  const latest = relevant[0];
  if (!latest) return null;

  const logs = latest.logs.filter((l) => l.exerciseId === exerciseId && l.done);
  const def = EXERCISE_BY_ID.get(exerciseId);
  const topRep = def?.repRange[1] ?? Infinity;

  const weightKg = Math.max(...logs.map((l) => l.weightKg));
  const reps = Math.max(...logs.map((l) => l.reps));
  const allHitTop = logs.length > 0 && logs.every((l) => l.reps >= topRep);

  return { weightKg, reps, allHitTop };
}

/** 下半身・背中の大きな種目は刻みを大きくする */
function weightIncrement(def: ExerciseDef): number {
  const heavy: MuscleGroup[] = ["quads", "hamstrings", "glutes", "back"];
  return def.muscles.some((m) => heavy.includes(m)) ? 5 : 2.5;
}

/**
 * 漸進性過負荷。
 * 前回すべてのセットでレップ上限に達していれば重量を上げ、
 * そうでなければ据え置いて同じ重量でレップを伸ばす。
 */
export function progressiveTarget(
  def: ExerciseDef,
  sessions: readonly WorkoutSession[],
): { targetWeightKg?: number; reps: number } {
  const last = lastPerformance(def.id, sessions);

  if (!last) {
    // 初回はレップ下限から。重量はユーザーに委ねる（推奨値を出すと危険）。
    return { reps: def.repRange[0], targetWeightKg: undefined };
  }

  if (def.isBodyweight && last.weightKg === 0) {
    // 自重種目は重量ではなくレップを伸ばす
    const reps = Math.min(last.reps + 1, def.repRange[1]);
    return { reps, targetWeightKg: undefined };
  }

  if (last.allHitTop) {
    return {
      targetWeightKg: last.weightKg + weightIncrement(def),
      reps: def.repRange[0],
    };
  }

  return {
    targetWeightKg: last.weightKg,
    reps: Math.min(last.reps + 1, def.repRange[1]),
  };
}

/** 分割に合う種目を、部位の偏りとコンパウンド比率を見ながら選ぶ */
export function selectExercises(
  split: Exclude<SplitKey, "rest">,
  pool: readonly ExerciseDef[],
  seed: string,
): ExerciseDef[] {
  const targets = SPLIT_MUSCLES[split];
  const targetSet = new Set(targets);

  // 主働筋（muscles[0]）が対象部位に入るものだけを候補にする
  const candidates = pool.filter((e) => targetSet.has(e.muscles[0]));
  if (candidates.length === 0) return [];

  const shuffled = seededShuffle(candidates, `${seed}:${split}`);

  const selected: ExerciseDef[] = [];
  const perMuscle = new Map<MuscleGroup, number>();

  const canTake = (e: ExerciseDef) => {
    const primary = e.muscles[0];
    return (perMuscle.get(primary) ?? 0) < MAX_PER_MUSCLE;
  };
  const take = (e: ExerciseDef) => {
    selected.push(e);
    const primary = e.muscles[0];
    perMuscle.set(primary, (perMuscle.get(primary) ?? 0) + 1);
  };

  // 1. コンパウンドを先に確保する（優先部位の順で拾う）
  for (const muscle of targets) {
    if (selected.filter((e) => e.isCompound).length >= MIN_COMPOUND) break;
    const found = shuffled.find(
      (e) => e.isCompound && e.muscles[0] === muscle && !selected.includes(e) && canTake(e),
    );
    if (found) take(found);
  }

  // 2. 残りを埋める。まだ触れていない部位を優先して満遍なく散らす。
  for (const muscle of targets) {
    if (selected.length >= EXERCISE_COUNT) break;
    if ((perMuscle.get(muscle) ?? 0) > 0) continue;
    const found = shuffled.find((e) => e.muscles[0] === muscle && !selected.includes(e));
    if (found) take(found);
  }

  // 3. それでも足りなければ候補から順に詰める
  for (const e of shuffled) {
    if (selected.length >= EXERCISE_COUNT) break;
    if (selected.includes(e) || !canTake(e)) continue;
    take(e);
  }

  // コンパウンドが先に来るよう並べ替える（重い種目を疲れる前にやるため）
  return selected.sort((a, b) => Number(b.isCompound) - Number(a.isCompound));
}

export function generatePlan(params: {
  profile: UserProfile;
  date: DateStr;
  level: number;
  sessions: readonly WorkoutSession[];
  bodyWeightKg: number;
}): WorkoutPlan {
  const { profile, date, level, sessions, bodyWeightKg } = params;
  const split = splitForDate(profile, date);

  if (split === "rest") {
    return { date, split, exercises: [], estimatedKcal: 0, estimatedMinutes: 0 };
  }

  const pool = availableExercises(profile, level);
  const chosen = selectExercises(split, pool, date);

  const exercises: PlannedExercise[] = chosen.map((def) => {
    const { targetWeightKg, reps } = progressiveTarget(def, sessions);
    return { exerciseId: def.id, sets: def.defaultSets, reps, targetWeightKg };
  });

  // 1セット＝インターバル込みで約2分として所要時間を見積もる
  const totalSets = exercises.reduce((acc, e) => acc + e.sets, 0);
  const estimatedMinutes = totalSets * 2;

  // 消費カロリー = MET × 体重kg × 時間h（種目ごとの時間で加重平均）
  let kcal = 0;
  for (const planned of exercises) {
    const def = EXERCISE_BY_ID.get(planned.exerciseId);
    if (!def) continue;
    const hours = (planned.sets * 2) / 60;
    kcal += def.met * bodyWeightKg * hours;
  }

  return {
    date,
    split,
    exercises,
    estimatedKcal: Math.round(kcal),
    estimatedMinutes,
  };
}
