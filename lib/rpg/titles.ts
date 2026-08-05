import type { Stats } from "@/lib/types";
import { MAX_LEVEL } from "./xp";

/**
 * クラス（レベル帯で変化する肩書き）と称号（実績で解禁される肩書き）。
 */

export interface ClassBand {
  /** この帯の下限レベル */
  from: number;
  name: string;
  /** 帯ごとの色（Tailwind のクラスではなく CSS 変数名） */
  color: string;
}

/** レベル帯によるクラス。Lv.9999 の「筋肉神」が最終到達点。 */
export const CLASS_BANDS: ClassBand[] = [
  { from: 1, name: "見習い戦士", color: "#8b97b8" },
  { from: 100, name: "剣士", color: "#9fb4d8" },
  { from: 300, name: "重戦士", color: "#7fc8e8" },
  { from: 600, name: "戦士長", color: "#4dabf7" },
  { from: 1000, name: "バーサーカー", color: "#51cf66" },
  { from: 2000, name: "鋼の勇者", color: "#ffd43b" },
  { from: 3500, name: "竜殺し", color: "#ffa94d" },
  { from: 5000, name: "覇王", color: "#ff6b6b" },
  { from: 7000, name: "半神", color: "#cc5de8" },
  { from: 9000, name: "神話", color: "#f5c451" },
  { from: MAX_LEVEL, name: "筋肉神", color: "#fff3c4" },
];

export function classForLevel(level: number): ClassBand {
  let current = CLASS_BANDS[0];
  for (const band of CLASS_BANDS) {
    if (level >= band.from) current = band;
    else break;
  }
  return current;
}

/** 次のクラスと、そこまでの残りレベル。最終クラスなら null。 */
export function nextClass(level: number): { band: ClassBand; levelsLeft: number } | null {
  for (const band of CLASS_BANDS) {
    if (level < band.from) return { band, levelsLeft: band.from - level };
  }
  return null;
}

// ---------------------------------------------------------------------------
// 称号
// ---------------------------------------------------------------------------

export interface TitleContext {
  level: number;
  stats: Stats;
  /** 完了したセッション数 */
  sessionCount: number;
  /** 現在の連続記録日数 */
  streak: number;
  /** 過去最長の連続記録日数 */
  bestStreak: number;
  /** 生涯の総挙上量(kg) */
  lifetimeVolume: number;
  /** 体重を記録した日数 */
  weightLogCount: number;
  /** 経験した種目数 */
  uniqueExerciseCount: number;
  /** 種目ごとの自己ベスト推定1RM */
  best1RM: Map<string, number>;
}

export interface TitleDef {
  id: string;
  name: string;
  /** 解禁条件の説明（未解禁時にヒントとして見せる） */
  requirement: string;
  check: (ctx: TitleContext) => boolean;
}

const oneRm = (ctx: TitleContext, id: string) => ctx.best1RM.get(id) ?? 0;

export const TITLES: TitleDef[] = [
  {
    id: "first_step",
    name: "はじまりの一歩",
    requirement: "初めてトレーニングを完了する",
    check: (c) => c.sessionCount >= 1,
  },
  {
    id: "regular",
    name: "常連",
    requirement: "トレーニングを10回完了する",
    check: (c) => c.sessionCount >= 10,
  },
  {
    id: "centurion",
    name: "百戦錬磨",
    requirement: "トレーニングを100回完了する",
    check: (c) => c.sessionCount >= 100,
  },
  {
    id: "veteran_1000",
    name: "千の鍛錬",
    requirement: "トレーニングを1000回完了する",
    check: (c) => c.sessionCount >= 1000,
  },
  {
    id: "streak_7",
    name: "七日間の習慣",
    requirement: "7日連続で記録する",
    check: (c) => c.bestStreak >= 7,
  },
  {
    id: "streak_30",
    name: "鉄の意志",
    requirement: "30日連続で記録する",
    check: (c) => c.bestStreak >= 30,
  },
  {
    id: "streak_100",
    name: "求道者",
    requirement: "100日連続で記録する",
    check: (c) => c.bestStreak >= 100,
  },
  {
    id: "bench_100",
    name: "100kgクラブ",
    requirement: "ベンチプレスの推定1RMが100kgに到達する",
    check: (c) => oneRm(c, "bench_press") >= 100,
  },
  {
    id: "squat_150",
    name: "大地を踏む者",
    requirement: "スクワットの推定1RMが150kgに到達する",
    check: (c) => oneRm(c, "back_squat") >= 150,
  },
  {
    id: "deadlift_180",
    name: "重力への反逆",
    requirement: "デッドリフトの推定1RMが180kgに到達する",
    check: (c) => oneRm(c, "deadlift") >= 180,
  },
  {
    id: "volume_100t",
    name: "百トンの男",
    requirement: "生涯の総挙上量が100トンに到達する",
    check: (c) => c.lifetimeVolume >= 100_000,
  },
  {
    id: "volume_1000t",
    name: "千トンの伝説",
    requirement: "生涯の総挙上量が1000トンに到達する",
    check: (c) => c.lifetimeVolume >= 1_000_000,
  },
  {
    id: "recorder_30",
    name: "記録する者",
    requirement: "体重を30日記録する",
    check: (c) => c.weightLogCount >= 30,
  },
  {
    id: "variety_30",
    name: "万能の探究者",
    requirement: "30種目を経験する",
    check: (c) => c.uniqueExerciseCount >= 30,
  },
  {
    id: "balanced",
    name: "均整のとれた肉体",
    requirement: "全ステータスを500以上にする",
    check: (c) => Object.values(c.stats).every((v) => v >= 500),
  },
  {
    id: "level_100",
    name: "Lv.100 到達",
    requirement: "レベル100に到達する",
    check: (c) => c.level >= 100,
  },
  {
    id: "level_1000",
    name: "Lv.1000 到達",
    requirement: "レベル1000に到達する",
    check: (c) => c.level >= 1000,
  },
  {
    id: "level_5000",
    name: "Lv.5000 到達",
    requirement: "レベル5000に到達する",
    check: (c) => c.level >= 5000,
  },
  {
    id: "level_9999",
    name: "筋肉神",
    requirement: "レベル9999に到達する",
    check: (c) => c.level >= MAX_LEVEL,
  },
];

export const TITLE_BY_ID = new Map(TITLES.map((t) => [t.id, t]));

/** 条件を満たしている称号の id 一覧 */
export function earnedTitleIds(ctx: TitleContext): string[] {
  return TITLES.filter((t) => t.check(ctx)).map((t) => t.id);
}

/** すでに解禁済みのものを除いた、今回新たに獲得した称号 */
export function newlyEarnedTitles(ctx: TitleContext, unlocked: readonly string[]): TitleDef[] {
  const known = new Set(unlocked);
  return TITLES.filter((t) => !known.has(t.id) && t.check(ctx));
}
