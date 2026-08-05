import { describe, expect, it } from "vitest";
import {
  ALL_DONE_BONUS,
  BASE_WORKOUT_XP,
  MAX_LEVEL,
  computeStreak,
  computeWorkoutXp,
  levelFromXp,
  levelProgress,
  sessionVolume,
  streakMultiplier,
  totalXpForLevel,
} from "./xp";
import type { ExerciseDef, WorkoutSession } from "@/lib/types";

describe("XPカーブ", () => {
  it("Lv.1 は 0XP から始まる", () => {
    expect(totalXpForLevel(1)).toBe(0);
    expect(levelFromXp(0)).toBe(1);
    expect(levelFromXp(-100)).toBe(1);
  });

  it("必要XPはレベルに対して単調増加する", () => {
    let prev = -1;
    for (let lv = 1; lv <= MAX_LEVEL; lv += 7) {
      const xp = totalXpForLevel(lv);
      expect(xp).toBeGreaterThan(prev);
      prev = xp;
    }
  });

  it("levelFromXp は totalXpForLevel の逆関数になっている", () => {
    // 全レベルで往復させ、丸め誤差でレベルがずれないことを確認する
    for (let lv = 2; lv <= MAX_LEVEL; lv++) {
      expect(levelFromXp(totalXpForLevel(lv))).toBe(lv);
    }
  });

  it("レベル到達直前のXPでは1つ下のレベルに留まる", () => {
    for (const lv of [2, 10, 100, 1000, 5000, 9999]) {
      expect(levelFromXp(totalXpForLevel(lv) - 1)).toBe(lv - 1);
    }
  });

  it("Lv.9999 で頭打ちになる", () => {
    const maxXp = totalXpForLevel(MAX_LEVEL);
    expect(levelFromXp(maxXp)).toBe(MAX_LEVEL);
    expect(levelFromXp(maxXp * 100)).toBe(MAX_LEVEL);
    expect(totalXpForLevel(20000)).toBe(maxXp);
  });

  it("目標 Lv.9999 は 250万XP 前後の重みを持つ", () => {
    const goal = totalXpForLevel(MAX_LEVEL);
    expect(goal).toBeGreaterThan(2_000_000);
    expect(goal).toBeLessThan(3_000_000);
  });

  it("序盤は速く伸びる（初回トレーニング相当の400XPで Lv.10 以上）", () => {
    expect(levelFromXp(400)).toBeGreaterThanOrEqual(10);
  });
});

describe("levelProgress", () => {
  it("レベル内進捗とLv.9999への全体進捗を返す", () => {
    const at100 = totalXpForLevel(100);
    const p = levelProgress(at100);
    expect(p.level).toBe(100);
    expect(p.xpIntoLevel).toBe(0);
    expect(p.ratio).toBe(0);
    expect(p.isMax).toBe(false);
    expect(p.xpToNext).toBe(totalXpForLevel(101) - at100);
  });

  it("レベルのちょうど中間で ratio が 0.5 前後になる", () => {
    const floor = totalXpForLevel(50);
    const ceil = totalXpForLevel(51);
    const p = levelProgress(Math.round((floor + ceil) / 2));
    expect(p.level).toBe(50);
    expect(p.ratio).toBeGreaterThan(0.3);
    expect(p.ratio).toBeLessThan(0.7);
  });

  it("最大レベルでは ratio と overallRatio が 1 になる", () => {
    const p = levelProgress(totalXpForLevel(MAX_LEVEL));
    expect(p.isMax).toBe(true);
    expect(p.ratio).toBe(1);
    expect(p.overallRatio).toBe(1);
    expect(p.xpToNext).toBe(0);
  });
});

describe("ストリーク", () => {
  it("記録が無ければ 0", () => {
    expect(computeStreak([], "2026-08-05")).toBe(0);
  });

  it("今日から連続している日数を数える", () => {
    const dates = ["2026-08-05", "2026-08-04", "2026-08-03"];
    expect(computeStreak(dates, "2026-08-05")).toBe(3);
  });

  it("今日未記録でも昨日まで続いていれば維持中とみなす", () => {
    const dates = ["2026-08-04", "2026-08-03"];
    expect(computeStreak(dates, "2026-08-05")).toBe(2);
  });

  it("一昨日で途切れていれば 0", () => {
    const dates = ["2026-08-03", "2026-08-02"];
    expect(computeStreak(dates, "2026-08-05")).toBe(0);
  });

  it("月をまたいでも数えられる", () => {
    const dates = ["2026-08-01", "2026-07-31", "2026-07-30"];
    expect(computeStreak(dates, "2026-08-01")).toBe(3);
  });

  it("倍率は30日で1.5倍に頭打ちする", () => {
    expect(streakMultiplier(0)).toBe(1);
    expect(streakMultiplier(30)).toBe(1.5);
    expect(streakMultiplier(365)).toBe(1.5);
  });
});

describe("トレーニングXP", () => {
  const bench: ExerciseDef = {
    id: "bench",
    name: "ベンチプレス",
    muscles: ["chest"],
    equipment: "barbell",
    met: 5,
    difficulty: 2,
    defaultSets: 3,
    repRange: [8, 12],
    isCompound: true,
    isBodyweight: false,
  };
  const pushup: ExerciseDef = {
    ...bench,
    id: "pushup",
    name: "腕立て伏せ",
    equipment: "bodyweight",
    isBodyweight: true,
  };
  const exercises = new Map([bench, pushup].map((e) => [e.id, e]));

  const session = (logs: WorkoutSession["logs"]): WorkoutSession => ({
    date: "2026-08-05",
    split: "push",
    logs,
  });

  it("完了していないセットはボリュームに数えない", () => {
    const s = session([
      { exerciseId: "bench", setIndex: 0, weightKg: 60, reps: 10, done: true },
      { exerciseId: "bench", setIndex: 1, weightKg: 60, reps: 10, done: false },
    ]);
    expect(sessionVolume(s, exercises, 70)).toBe(600);
  });

  it("自重種目は体重の40%を負荷として換算する", () => {
    const s = session([
      { exerciseId: "pushup", setIndex: 0, weightKg: 0, reps: 20, done: true },
    ]);
    // 70kg * 0.4 = 28kg 相当 × 20回
    expect(sessionVolume(s, exercises, 70)).toBe(560);
  });

  it("基礎XPとボリュームXPと完遂ボーナスが加算される", () => {
    const s = session([
      { exerciseId: "bench", setIndex: 0, weightKg: 60, reps: 10, done: true },
    ]);
    const xp = computeWorkoutXp({
      session: s,
      exercises,
      bodyWeightKg: 70,
      plannedSetCount: 1,
      personalRecordCount: 0,
      streakDays: 0,
    });
    expect(xp.base).toBe(BASE_WORKOUT_XP);
    expect(xp.volume).toBe(12); // 600kg / 50
    expect(xp.allDone).toBe(ALL_DONE_BONUS);
    expect(xp.total).toBe(BASE_WORKOUT_XP + 12 + ALL_DONE_BONUS);
  });

  it("予定セットを消化していなければ完遂ボーナスは付かない", () => {
    const s = session([
      { exerciseId: "bench", setIndex: 0, weightKg: 60, reps: 10, done: true },
    ]);
    const xp = computeWorkoutXp({
      session: s,
      exercises,
      bodyWeightKg: 70,
      plannedSetCount: 3,
      personalRecordCount: 0,
      streakDays: 0,
    });
    expect(xp.allDone).toBe(0);
  });

  it("ストリーク倍率が全体に掛かる", () => {
    const s = session([
      { exerciseId: "bench", setIndex: 0, weightKg: 60, reps: 10, done: true },
    ]);
    const plain = computeWorkoutXp({
      session: s,
      exercises,
      bodyWeightKg: 70,
      plannedSetCount: 1,
      personalRecordCount: 0,
      streakDays: 0,
    });
    const streaked = computeWorkoutXp({
      session: s,
      exercises,
      bodyWeightKg: 70,
      plannedSetCount: 1,
      personalRecordCount: 0,
      streakDays: 30,
    });
    expect(streaked.total).toBe(Math.round(plain.total * 1.5));
  });

  /** weightKg×reps を sets セット分並べる */
  const buildLogs = (specs: [weight: number, reps: number, sets: number][]) => {
    const logs: WorkoutSession["logs"] = [];
    let i = 0;
    for (const [weightKg, reps, sets] of specs) {
      for (let s = 0; s < sets; s++) {
        logs.push({ exerciseId: "bench", setIndex: i++, weightKg, reps, done: true });
      }
    }
    return logs;
  };

  it("軽めの6セットで200〜350XP程度に収まる", () => {
    // 60kg×10×3 + 80kg×8×3 = 3,720kg
    const logs = buildLogs([
      [60, 10, 3],
      [80, 8, 3],
    ]);
    const xp = computeWorkoutXp({
      session: session(logs),
      exercises,
      bodyWeightKg: 70,
      plannedSetCount: logs.length,
      personalRecordCount: 0,
      streakDays: 7,
    });
    expect(xp.total).toBeGreaterThanOrEqual(200);
    expect(xp.total).toBeLessThanOrEqual(350);
  });

  it("しっかりやった18セットで300〜700XP程度に収まる", () => {
    // 標準的な1回のジムセッション相当のボリューム
    const logs = buildLogs([
      [60, 10, 4],
      [80, 8, 4],
      [40, 12, 5],
      [50, 10, 5],
    ]);
    const xp = computeWorkoutXp({
      session: session(logs),
      exercises,
      bodyWeightKg: 70,
      plannedSetCount: logs.length,
      personalRecordCount: 0,
      streakDays: 7,
    });
    expect(xp.total).toBeGreaterThanOrEqual(300);
    expect(xp.total).toBeLessThanOrEqual(700);
  });

  it("初日（ストリーク0・自己ベスト更新あり）でも二桁レベルに届く", () => {
    const logs = buildLogs([
      [40, 10, 3],
      [50, 8, 3],
    ]);
    const xp = computeWorkoutXp({
      session: session(logs),
      exercises,
      bodyWeightKg: 70,
      plannedSetCount: logs.length,
      personalRecordCount: 2,
      streakDays: 0,
    });
    expect(levelFromXp(xp.total)).toBeGreaterThanOrEqual(10);
  });
});
