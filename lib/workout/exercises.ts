import type { Equipment, ExerciseDef, MuscleGroup } from "@/lib/types";

/**
 * 種目マスタ。
 *
 * difficulty はレベルに応じた解禁に使う（1=誰でも / 5=上級）。
 * met は消費カロリー推定に使う。
 * isBig3 は STR ステータスの算出対象。
 */

function ex(
  id: string,
  name: string,
  muscles: MuscleGroup[],
  equipment: Equipment,
  opts: Partial<Omit<ExerciseDef, "id" | "name" | "muscles" | "equipment">> = {},
): ExerciseDef {
  return {
    id,
    name,
    muscles,
    equipment,
    met: opts.met ?? 5,
    difficulty: opts.difficulty ?? 2,
    defaultSets: opts.defaultSets ?? 3,
    repRange: opts.repRange ?? [8, 12],
    repUnit: opts.repUnit,
    isCompound: opts.isCompound ?? false,
    isBodyweight: opts.isBodyweight ?? equipment === "bodyweight",
    isBig3: opts.isBig3,
  };
}

export const EXERCISES: ExerciseDef[] = [
  // --- 胸 ------------------------------------------------------------------
  ex("bench_press", "ベンチプレス", ["chest", "triceps", "shoulders"], "barbell", {
    met: 5, difficulty: 2, isCompound: true, isBig3: true, repRange: [6, 10],
  }),
  ex("incline_bench_press", "インクラインベンチプレス", ["chest", "shoulders"], "barbell", {
    met: 5, difficulty: 3, isCompound: true, repRange: [8, 12],
  }),
  ex("dumbbell_press", "ダンベルプレス", ["chest", "triceps"], "dumbbell", {
    met: 5, difficulty: 2, isCompound: true,
  }),
  ex("incline_dumbbell_press", "インクラインダンベルプレス", ["chest", "shoulders"], "dumbbell", {
    met: 5, difficulty: 3, isCompound: true,
  }),
  ex("dumbbell_fly", "ダンベルフライ", ["chest"], "dumbbell", {
    met: 4, difficulty: 2, repRange: [10, 15],
  }),
  ex("pushup", "腕立て伏せ", ["chest", "triceps"], "bodyweight", {
    met: 6, difficulty: 1, isCompound: true, repRange: [10, 25],
  }),
  ex("diamond_pushup", "ダイヤモンドプッシュアップ", ["triceps", "chest"], "bodyweight", {
    met: 6, difficulty: 3, isCompound: true, repRange: [8, 20],
  }),
  ex("decline_pushup", "デクラインプッシュアップ", ["chest", "shoulders"], "bodyweight", {
    met: 6, difficulty: 3, isCompound: true, repRange: [8, 20],
  }),
  ex("chest_press_machine", "チェストプレス", ["chest", "triceps"], "machine", {
    met: 4, difficulty: 1, isCompound: true,
  }),
  ex("pec_deck", "ペックデック", ["chest"], "machine", {
    met: 4, difficulty: 1, repRange: [10, 15],
  }),
  ex("cable_crossover", "ケーブルクロスオーバー", ["chest"], "cable", {
    met: 4, difficulty: 2, repRange: [10, 15],
  }),

  // --- 背中 ----------------------------------------------------------------
  ex("deadlift", "デッドリフト", ["back", "hamstrings", "glutes"], "barbell", {
    met: 6, difficulty: 4, isCompound: true, isBig3: true, repRange: [5, 8], defaultSets: 3,
  }),
  ex("bent_over_row", "ベントオーバーロウ", ["back", "biceps"], "barbell", {
    met: 5, difficulty: 3, isCompound: true,
  }),
  ex("pullup", "懸垂", ["back", "biceps"], "bodyweight", {
    met: 8, difficulty: 4, isCompound: true, repRange: [4, 12],
  }),
  ex("chinup", "チンニング（逆手）", ["back", "biceps"], "bodyweight", {
    met: 8, difficulty: 4, isCompound: true, repRange: [4, 12],
  }),
  ex("inverted_row", "斜め懸垂", ["back", "biceps"], "bodyweight", {
    met: 5, difficulty: 2, isCompound: true, repRange: [8, 20],
  }),
  ex("one_arm_dumbbell_row", "ワンハンドロウ", ["back", "biceps"], "dumbbell", {
    met: 5, difficulty: 2, isCompound: true,
  }),
  ex("lat_pulldown", "ラットプルダウン", ["back", "biceps"], "cable", {
    met: 4, difficulty: 1, isCompound: true,
  }),
  ex("seated_row", "シーテッドロウ", ["back", "biceps"], "cable", {
    met: 4, difficulty: 1, isCompound: true,
  }),
  ex("t_bar_row", "Tバーロウ", ["back"], "barbell", {
    met: 5, difficulty: 3, isCompound: true,
  }),
  ex("back_extension", "バックエクステンション", ["back", "glutes"], "bodyweight", {
    met: 4, difficulty: 1, repRange: [12, 20],
  }),
  ex("band_pulldown", "バンドプルダウン", ["back"], "band", {
    met: 4, difficulty: 1, repRange: [12, 20],
  }),

  // --- 肩 ------------------------------------------------------------------
  ex("overhead_press", "オーバーヘッドプレス", ["shoulders", "triceps"], "barbell", {
    met: 5, difficulty: 3, isCompound: true, repRange: [6, 10],
  }),
  ex("dumbbell_shoulder_press", "ダンベルショルダープレス", ["shoulders", "triceps"], "dumbbell", {
    met: 5, difficulty: 2, isCompound: true,
  }),
  ex("lateral_raise", "サイドレイズ", ["shoulders"], "dumbbell", {
    met: 4, difficulty: 1, repRange: [12, 20],
  }),
  ex("front_raise", "フロントレイズ", ["shoulders"], "dumbbell", {
    met: 4, difficulty: 1, repRange: [12, 15],
  }),
  ex("rear_delt_fly", "リアレイズ", ["shoulders", "back"], "dumbbell", {
    met: 4, difficulty: 2, repRange: [12, 20],
  }),
  ex("upright_row", "アップライトロウ", ["shoulders", "back"], "barbell", {
    met: 4, difficulty: 3, repRange: [10, 15],
  }),
  ex("pike_pushup", "パイクプッシュアップ", ["shoulders", "triceps"], "bodyweight", {
    met: 6, difficulty: 3, isCompound: true, repRange: [6, 15],
  }),
  ex("shoulder_press_machine", "ショルダープレス（マシン）", ["shoulders"], "machine", {
    met: 4, difficulty: 1, isCompound: true,
  }),
  ex("face_pull", "フェイスプル", ["shoulders", "back"], "cable", {
    met: 4, difficulty: 2, repRange: [12, 20],
  }),

  // --- 二頭 ----------------------------------------------------------------
  ex("barbell_curl", "バーベルカール", ["biceps"], "barbell", {
    met: 4, difficulty: 2, repRange: [8, 12],
  }),
  ex("dumbbell_curl", "ダンベルカール", ["biceps"], "dumbbell", {
    met: 4, difficulty: 1, repRange: [10, 15],
  }),
  ex("hammer_curl", "ハンマーカール", ["biceps"], "dumbbell", {
    met: 4, difficulty: 1, repRange: [10, 15],
  }),
  ex("incline_curl", "インクラインカール", ["biceps"], "dumbbell", {
    met: 4, difficulty: 3, repRange: [10, 15],
  }),
  ex("concentration_curl", "コンセントレーションカール", ["biceps"], "dumbbell", {
    met: 4, difficulty: 2, repRange: [10, 15],
  }),
  ex("cable_curl", "ケーブルカール", ["biceps"], "cable", {
    met: 4, difficulty: 1, repRange: [10, 15],
  }),
  ex("band_curl", "バンドカール", ["biceps"], "band", {
    met: 3, difficulty: 1, repRange: [15, 25],
  }),

  // --- 三頭 ----------------------------------------------------------------
  ex("close_grip_bench", "ナローベンチプレス", ["triceps", "chest"], "barbell", {
    met: 5, difficulty: 3, isCompound: true,
  }),
  ex("skull_crusher", "スカルクラッシャー", ["triceps"], "barbell", {
    met: 4, difficulty: 3, repRange: [10, 12],
  }),
  ex("dumbbell_kickback", "キックバック", ["triceps"], "dumbbell", {
    met: 4, difficulty: 1, repRange: [12, 15],
  }),
  ex("overhead_extension", "オーバーヘッドエクステンション", ["triceps"], "dumbbell", {
    met: 4, difficulty: 2, repRange: [10, 15],
  }),
  ex("triceps_pushdown", "トライセプスプレスダウン", ["triceps"], "cable", {
    met: 4, difficulty: 1, repRange: [10, 15],
  }),
  ex("dips", "ディップス", ["triceps", "chest"], "bodyweight", {
    met: 8, difficulty: 4, isCompound: true, repRange: [5, 15],
  }),
  ex("bench_dips", "ベンチディップス", ["triceps"], "bodyweight", {
    met: 5, difficulty: 1, repRange: [10, 20],
  }),

  // --- 脚（前面） ----------------------------------------------------------
  ex("back_squat", "バーベルスクワット", ["quads", "glutes"], "barbell", {
    met: 6, difficulty: 3, isCompound: true, isBig3: true, repRange: [6, 10],
  }),
  ex("front_squat", "フロントスクワット", ["quads"], "barbell", {
    met: 6, difficulty: 4, isCompound: true, repRange: [6, 10],
  }),
  ex("leg_press", "レッグプレス", ["quads", "glutes"], "machine", {
    met: 5, difficulty: 1, isCompound: true, repRange: [10, 15],
  }),
  ex("goblet_squat", "ゴブレットスクワット", ["quads", "glutes"], "dumbbell", {
    met: 5, difficulty: 2, isCompound: true, repRange: [10, 15],
  }),
  ex("bulgarian_split_squat", "ブルガリアンスクワット", ["quads", "glutes"], "dumbbell", {
    met: 6, difficulty: 4, isCompound: true, repRange: [8, 12],
  }),
  ex("lunge", "ランジ", ["quads", "glutes"], "dumbbell", {
    met: 5, difficulty: 2, isCompound: true, repRange: [10, 15],
  }),
  ex("leg_extension", "レッグエクステンション", ["quads"], "machine", {
    met: 4, difficulty: 1, repRange: [12, 15],
  }),
  ex("bodyweight_squat", "自重スクワット", ["quads", "glutes"], "bodyweight", {
    met: 5, difficulty: 1, isCompound: true, repRange: [15, 30],
  }),
  ex("jump_squat", "ジャンプスクワット", ["quads", "glutes", "cardio"], "bodyweight", {
    met: 8, difficulty: 3, isCompound: true, repRange: [10, 20],
  }),

  // --- 脚（後面・臀部） ----------------------------------------------------
  ex("romanian_deadlift", "ルーマニアンデッドリフト", ["hamstrings", "glutes"], "barbell", {
    met: 5, difficulty: 3, isCompound: true, repRange: [8, 12],
  }),
  ex("leg_curl", "レッグカール", ["hamstrings"], "machine", {
    met: 4, difficulty: 1, repRange: [10, 15],
  }),
  ex("hip_thrust", "ヒップスラスト", ["glutes", "hamstrings"], "barbell", {
    met: 5, difficulty: 2, isCompound: true, repRange: [8, 15],
  }),
  ex("glute_bridge", "ヒップリフト", ["glutes"], "bodyweight", {
    met: 4, difficulty: 1, repRange: [15, 25],
  }),
  ex("good_morning", "グッドモーニング", ["hamstrings", "back"], "barbell", {
    met: 5, difficulty: 4, repRange: [10, 12],
  }),

  // --- ふくらはぎ ----------------------------------------------------------
  ex("standing_calf_raise", "スタンディングカーフレイズ", ["calves"], "dumbbell", {
    met: 4, difficulty: 1, repRange: [15, 20],
  }),
  ex("seated_calf_raise", "シーテッドカーフレイズ", ["calves"], "machine", {
    met: 4, difficulty: 1, repRange: [15, 20],
  }),
  ex("calf_raise_bodyweight", "カーフレイズ（自重）", ["calves"], "bodyweight", {
    met: 4, difficulty: 1, repRange: [20, 30],
  }),

  // --- 腹 ------------------------------------------------------------------
  ex("crunch", "クランチ", ["abs"], "bodyweight", {
    met: 4, difficulty: 1, repRange: [15, 30],
  }),
  ex("plank", "プランク", ["abs"], "bodyweight", {
    met: 4, difficulty: 1, repRange: [30, 90], repUnit: "sec", defaultSets: 3,
  }),
  ex("leg_raise", "レッグレイズ", ["abs"], "bodyweight", {
    met: 4, difficulty: 2, repRange: [12, 20],
  }),
  ex("russian_twist", "ロシアンツイスト", ["abs"], "bodyweight", {
    met: 4, difficulty: 2, repRange: [20, 40],
  }),
  ex("hanging_leg_raise", "ハンギングレッグレイズ", ["abs"], "bodyweight", {
    met: 5, difficulty: 4, repRange: [8, 15],
  }),
  ex("ab_rollout", "アブローラー", ["abs"], "bodyweight", {
    met: 5, difficulty: 4, repRange: [8, 15],
  }),
  ex("mountain_climber", "マウンテンクライマー", ["abs", "cardio"], "bodyweight", {
    met: 8, difficulty: 2, repRange: [20, 40],
  }),

  // --- 有酸素 --------------------------------------------------------------
  ex("running", "ランニング", ["cardio"], "bodyweight", {
    met: 9.8, difficulty: 2, defaultSets: 1, repRange: [900, 1800], repUnit: "sec",
  }),
  ex("cycling", "サイクリング", ["cardio", "quads"], "bodyweight", {
    met: 7, difficulty: 1, defaultSets: 1, repRange: [900, 2400], repUnit: "sec",
  }),
  ex("jump_rope", "縄跳び", ["cardio", "calves"], "bodyweight", {
    met: 11, difficulty: 2, defaultSets: 3, repRange: [60, 180], repUnit: "sec",
  }),
  ex("burpee", "バーピー", ["cardio", "chest", "quads"], "bodyweight", {
    met: 8, difficulty: 3, isCompound: true, repRange: [10, 20],
  }),
];

export const EXERCISE_BY_ID = new Map(EXERCISES.map((e) => [e.id, e]));

export function getExercise(id: string): ExerciseDef | undefined {
  return EXERCISE_BY_ID.get(id);
}

/** 表示用の単位ラベル */
export function repUnitLabel(def: ExerciseDef): string {
  return def.repUnit === "sec" ? "秒" : "回";
}
