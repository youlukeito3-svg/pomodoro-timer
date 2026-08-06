import { z } from "zod";

/**
 * アプリ全体の永続データのスキーマ。
 *
 * zod スキーマを単一の真実源とし、TypeScript の型は z.infer で導出する。
 * こうしないと「型は通るが localStorage の中身が壊れている」状態を検出できない。
 */

/** 'YYYY-MM-DD' 形式の日付 */
export const DateStr = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 形式で指定してください");
export type DateStr = z.infer<typeof DateStr>;

// ---------------------------------------------------------------------------
// 部位（プロフィールの除外指定とトレーニングの双方から参照するので先に置く）
// ---------------------------------------------------------------------------

export const MuscleGroup = z.enum([
  "chest", // 胸
  "back", // 背中
  "shoulders", // 肩
  "biceps", // 二頭
  "triceps", // 三頭
  "quads", // 大腿四頭
  "hamstrings", // ハム
  "glutes", // 臀部
  "calves", // ふくらはぎ
  "abs", // 腹
  "cardio", // 有酸素
]);
export type MuscleGroup = z.infer<typeof MuscleGroup>;

export const MUSCLE_LABEL: Record<MuscleGroup, string> = {
  chest: "胸",
  back: "背中",
  shoulders: "肩",
  biceps: "上腕二頭",
  triceps: "上腕三頭",
  quads: "大腿四頭",
  hamstrings: "ハムストリング",
  glutes: "臀部",
  calves: "ふくらはぎ",
  abs: "腹筋",
  cardio: "有酸素",
};


// ---------------------------------------------------------------------------
// プロフィール
// ---------------------------------------------------------------------------

export const Sex = z.enum(["male", "female"]);
export type Sex = z.infer<typeof Sex>;

/** 増量 / 減量 / 維持 */
export const Goal = z.enum(["bulk", "cut", "maintain"]);
export type Goal = z.infer<typeof Goal>;

export const GOAL_LABEL: Record<Goal, string> = {
  bulk: "増量",
  cut: "減量",
  maintain: "維持",
};

export const Equipment = z.enum([
  "bodyweight", // 自重
  "dumbbell", // ダンベル
  "barbell", // バーベル
  "machine", // マシン
  "cable", // ケーブル
  "band", // チューブ
]);
export type Equipment = z.infer<typeof Equipment>;

export const EQUIPMENT_LABEL: Record<Equipment, string> = {
  bodyweight: "自重",
  dumbbell: "ダンベル",
  barbell: "バーベル",
  machine: "マシン",
  cable: "ケーブル",
  band: "チューブ",
};

/** 1=ほぼ座位 … 5=非常に活発。Mifflin-St Jeor の活動係数に対応する。 */
export const ActivityLevel = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);
export type ActivityLevel = z.infer<typeof ActivityLevel>;

export const ACTIVITY_LABEL: Record<ActivityLevel, string> = {
  1: "ほぼ座りっぱなし",
  2: "軽い活動（週1〜2運動）",
  3: "中程度（週3〜5運動）",
  4: "活発（週6〜7運動）",
  5: "非常に活発（肉体労働・二部練）",
};

export const UserProfile = z.object({
  name: z.string().min(1).max(20),
  sex: Sex,
  birthDate: DateStr,
  heightCm: z.number().min(100).max(250),
  goal: Goal,
  activityLevel: ActivityLevel,
  /** 使える器具。プラン生成の種目フィルタに使う。 */
  equipment: z.array(Equipment).min(1),
  /** 週あたりのトレーニング日数。分割法の決定に使う。 */
  daysPerWeek: z.number().int().min(2).max(6),
  /** アレルギー・苦手な食材（FoodDef.id またはタグ） */
  dietaryNg: z.array(z.string()).default([]),
  /**
   * 鍛えたくない部位。怪我や痛みで避けたい箇所を想定している。
   * ここに入れた部位が関与する種目はプランに一切出さない。
   */
  excludedMuscles: z.array(MuscleGroup).default([]),
  /** 開始日。分割ローテーションの基準になる。 */
  startedAt: DateStr,
});
export type UserProfile = z.infer<typeof UserProfile>;

// ---------------------------------------------------------------------------
// 体重
// ---------------------------------------------------------------------------

export const WeightEntry = z.object({
  date: DateStr,
  weightKg: z.number().min(20).max(300),
  bodyFatPct: z.number().min(1).max(70).optional(),
  memo: z.string().max(200).optional(),
});
export type WeightEntry = z.infer<typeof WeightEntry>;

// ---------------------------------------------------------------------------
// トレーニング
// ---------------------------------------------------------------------------


/** 種目マスタ（コード内の定数。ユーザーデータではない） */
export interface ExerciseDef {
  id: string;
  name: string;
  /** 主働筋が先頭 */
  muscles: MuscleGroup[];
  equipment: Equipment;
  /** METs。消費カロリー推定に使う。 */
  met: number;
  /** 1(易) 〜 5(難)。レベルに応じて解禁する。 */
  difficulty: 1 | 2 | 3 | 4 | 5;
  defaultSets: number;
  /** [下限, 上限] レップ。上限到達で漸進性過負荷が発動する。 */
  repRange: [number, number];
  /** プランクなど時間で測る種目は "sec"。既定は "reps"。 */
  repUnit?: "reps" | "sec";
  /** コンパウンド種目か（プラン生成で優先される） */
  isCompound: boolean;
  /** 自重種目か。XP と重量入力の扱いが変わる。 */
  isBodyweight: boolean;
}

export const PlannedExercise = z.object({
  exerciseId: z.string(),
  sets: z.number().int().min(1).max(10),
  reps: z.number().int().min(1).max(100),
  /** 推奨重量。自重種目や初回は undefined。 */
  targetWeightKg: z.number().min(0).max(500).optional(),
});
export type PlannedExercise = z.infer<typeof PlannedExercise>;

export const SplitKey = z.enum([
  "fullA",
  "fullB",
  "push",
  "pull",
  "legs",
  "upper",
  "lower",
  "rest",
]);
export type SplitKey = z.infer<typeof SplitKey>;

export const SPLIT_LABEL: Record<SplitKey, string> = {
  fullA: "全身 A",
  fullB: "全身 B",
  push: "プッシュ（胸・肩・三頭）",
  pull: "プル（背中・二頭）",
  legs: "レッグ（脚）",
  upper: "上半身",
  lower: "下半身",
  rest: "休養日",
};

/** 画面の狭いところ用の短い分割名（SPLIT_LABEL は説明込みで長い） */
export const SPLIT_SHORT_LABEL: Record<SplitKey, string> = {
  fullA: "全身A",
  fullB: "全身B",
  push: "プッシュ",
  pull: "プル",
  legs: "レッグ",
  upper: "上半身",
  lower: "下半身",
  rest: "休養",
};

export const SetLog = z.object({
  exerciseId: z.string(),
  setIndex: z.number().int().min(0),
  weightKg: z.number().min(0).max(500),
  reps: z.number().int().min(0).max(200),
  done: z.boolean(),
});
export type SetLog = z.infer<typeof SetLog>;

export const WorkoutSession = z.object({
  date: DateStr,
  split: SplitKey,
  logs: z.array(SetLog),
  /** 完了した瞬間の ISO 文字列。未完了なら undefined。 */
  completedAt: z.string().optional(),
  durationMin: z.number().min(0).max(600).optional(),
});
export type WorkoutSession = z.infer<typeof WorkoutSession>;

// ---------------------------------------------------------------------------
// 食材・在庫
// ---------------------------------------------------------------------------

export const FoodCategory = z.enum([
  "meat", // 肉
  "fish", // 魚介
  "egg_dairy", // 卵・乳製品
  "soy", // 大豆製品
  "grain", // 主食
  "vegetable", // 野菜
  "fruit", // 果物
  "seasoning", // 調味料
  "other",
]);
export type FoodCategory = z.infer<typeof FoodCategory>;

export const FOOD_CATEGORY_LABEL: Record<FoodCategory, string> = {
  meat: "肉",
  fish: "魚介",
  egg_dairy: "卵・乳製品",
  soy: "大豆製品",
  grain: "主食",
  vegetable: "野菜",
  fruit: "果物",
  seasoning: "調味料",
  other: "その他",
};

/** 食材マスタ（コード内の定数） */
export interface FoodDef {
  id: string;
  name: string;
  /** レシート照合用の別名・略記。「豚ﾊﾞﾗ」「ﾌﾞﾀﾊﾞﾗ」など。 */
  aliases: string[];
  category: FoodCategory;
  kcalPer100g: number;
  proteinPer100g: number;
  fatPer100g: number;
  carbPer100g: number;
  /** 「個」「本」など数量単位で扱う食材の 1単位あたりグラム数 */
  gramsPerUnit?: number;
  unitLabel?: string;
  /** 冷蔵での目安日数。期限管理に使う。 */
  shelfLifeDays?: number;
}

export const PantryItem = z.object({
  id: z.string(),
  /** 食材マスタに紐づいた場合の id。未解決なら null。 */
  foodId: z.string().nullable(),
  /** レシートに書かれていた生の文字列（未解決時の表示に使う） */
  rawName: z.string(),
  /** グラム数に正規化した在庫量 */
  grams: z.number().min(0),
  addedAt: z.string(),
  expiresAt: DateStr.optional(),
  source: z.enum(["ocr", "ai", "manual"]),
});
export type PantryItem = z.infer<typeof PantryItem>;

// ---------------------------------------------------------------------------
// レシピ・献立
// ---------------------------------------------------------------------------

export const MealSlot = z.enum(["breakfast", "lunch", "dinner", "snack"]);
export type MealSlot = z.infer<typeof MealSlot>;

export const MEAL_SLOT_LABEL: Record<MealSlot, string> = {
  breakfast: "朝食",
  lunch: "昼食",
  dinner: "夕食",
  snack: "間食",
};

/** レシピマスタ（コード内の定数） */
export interface RecipeDef {
  id: string;
  name: string;
  /** 適したスロット（複数可） */
  slots: MealSlot[];
  ingredients: { foodId: string; grams: number }[];
  steps: string[];
  minutes: number;
  tags: string[];
}

export const PlannedMeal = z.object({
  slot: MealSlot,
  recipeId: z.string(),
  /** 0.5 刻みの人前 */
  servings: z.number().min(0.5).max(4),
});
export type PlannedMeal = z.infer<typeof PlannedMeal>;

export const Macros = z.object({
  kcal: z.number(),
  protein: z.number(),
  fat: z.number(),
  carb: z.number(),
});
export type Macros = z.infer<typeof Macros>;

/**
 * 献立に無いのに食べたもの。
 * 提案どおりに食べる日ばかりではないので、これが無いと摂取量が常に実態とずれる。
 */
export const ExtraFood = z.object({
  id: z.string(),
  foodId: z.string(),
  grams: z.number().min(0).max(5000),
  slot: MealSlot,
});
export type ExtraFood = z.infer<typeof ExtraFood>;

export const MealPlan = z.object({
  date: DateStr,
  target: Macros,
  meals: z.array(PlannedMeal),
  /** 実際に食べたスロット。カロリー目標達成 XP の判定に使う。 */
  eaten: z.array(MealSlot).default([]),
  /**
   * 献立以外に食べたもの。
   * default があるので、このフィールドを持たない既存の保存データも
   * そのまま読み込める（SCHEMA_VERSION を上げる必要がない）。
   */
  extras: z.array(ExtraFood).default([]),
});
export type MealPlan = z.infer<typeof MealPlan>;

// ---------------------------------------------------------------------------
// RPG
// ---------------------------------------------------------------------------

export const XpSource = z.enum([
  "workout", // トレーニング完了・ボリューム
  "weightLog", // 体重記録
  "mealTarget", // カロリー目標達成
  "record", // 自己ベスト更新
]);
export type XpSource = z.infer<typeof XpSource>;

export const XP_SOURCE_LABEL: Record<XpSource, string> = {
  workout: "トレーニング",
  weightLog: "体重記録",
  mealTarget: "食事目標",
  record: "自己ベスト",
};

export const XpEvent = z.object({
  id: z.string(),
  date: DateStr,
  source: XpSource,
  amount: z.number().min(0),
  note: z.string().optional(),
});
export type XpEvent = z.infer<typeof XpEvent>;

export const StatKey = z.enum(["str", "end", "vit", "agi", "dex", "mnd"]);
export type StatKey = z.infer<typeof StatKey>;

export const STAT_LABEL: Record<StatKey, { short: string; name: string }> = {
  str: { short: "STR", name: "筋力" },
  end: { short: "END", name: "持久力" },
  vit: { short: "VIT", name: "体力" },
  agi: { short: "AGI", name: "敏捷" },
  dex: { short: "DEX", name: "技巧" },
  mnd: { short: "MND", name: "精神" },
};

export type Stats = Record<StatKey, number>;

export const RpgState = z.object({
  /** ユーザーが最後に見たレベル。差分でレベルアップ演出を出す。 */
  lastSeenLevel: z.number().int().min(1).max(9999).default(1),
  /** 解禁済みの称号 id */
  unlockedTitles: z.array(z.string()).default([]),
});
export type RpgState = z.infer<typeof RpgState>;

// ---------------------------------------------------------------------------
// 設定（APIキーを含むので本体データとは別キーに保存する）
// ---------------------------------------------------------------------------

export const Settings = z.object({
  /** Gemini の APIキー（BYOK）。未設定なら AI 機能は出ない。 */
  geminiApiKey: z.string().default(""),
  /** 無料枠のデータ利用ポリシーに同意したか。同意なしでは送信しない。 */
  aiConsent: z.boolean().default(false),
});
export type Settings = z.infer<typeof Settings>;

// ---------------------------------------------------------------------------
// ルート
// ---------------------------------------------------------------------------

export const AppData = z.object({
  profile: UserProfile.nullable().default(null),
  weights: z.array(WeightEntry).default([]),
  sessions: z.array(WorkoutSession).default([]),
  pantry: z.array(PantryItem).default([]),
  mealPlans: z.array(MealPlan).default([]),
  xpEvents: z.array(XpEvent).default([]),
  rpg: RpgState.default({ lastSeenLevel: 1, unlockedTitles: [] }),
});
export type AppData = z.infer<typeof AppData>;

export const EMPTY_APP_DATA: AppData = {
  profile: null,
  weights: [],
  sessions: [],
  pantry: [],
  mealPlans: [],
  xpEvents: [],
  rpg: { lastSeenLevel: 1, unlockedTitles: [] },
};
