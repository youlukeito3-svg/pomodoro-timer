import { describe, expect, it } from "vitest";
import type { UserProfile, WorkoutSession } from "@/lib/types";
import { EXERCISE_BY_ID } from "@/lib/workout/exercises";
import { STAT_MAX, computeStats, countPersonalRecords, estimate1RM, statValues } from "./stats";

const session = (
  date: string,
  logs: [exerciseId: string, weightKg: number, reps: number][],
): WorkoutSession => ({
  date,
  split: "push",
  completedAt: `${date}T10:00:00.000Z`,
  logs: logs.map(([exerciseId, weightKg, reps], setIndex) => ({
    exerciseId,
    setIndex,
    weightKg,
    reps,
    done: true,
  })),
});

const baseInput = {
  exercises: EXERCISE_BY_ID,
  bodyWeightKg: 70,
  daysPerWeek: 3,
  today: "2026-08-05",
  weights: [] as UserProfile[] & [],
  mealPlans: [],
};

const compute = (sessions: WorkoutSession[], over: Partial<typeof baseInput> = {}) =>
  computeStats({
    ...baseInput,
    weights: [],
    mealPlans: [],
    sessions,
    ...over,
  });

describe("推定1RM", () => {
  it("1回なら重量そのもの", () => {
    expect(estimate1RM(100, 1)).toBe(100);
  });

  it("Epley式でレップ数に応じて増える", () => {
    // 100kg × 10回 = 100 * (1 + 10/30) ≒ 133.3
    expect(estimate1RM(100, 10)).toBeCloseTo(133.33, 1);
  });

  it("重量か回数が0なら0", () => {
    expect(estimate1RM(0, 10)).toBe(0);
    expect(estimate1RM(100, 0)).toBe(0);
  });
});

describe("ステータスの範囲", () => {
  it("記録が無ければすべて0", () => {
    const stats = statValues(compute([]));
    for (const value of Object.values(stats)) expect(value).toBe(0);
  });

  it("どれだけ積んでも上限999を超えない", () => {
    // 非現実的な量を入れても飽和するだけで破綻しないこと
    const heavy = Array.from({ length: 200 }, (_, i) =>
      session(`2026-0${(i % 8) + 1}-0${(i % 9) + 1}`, [
        ["bench_press", 300, 20],
        ["back_squat", 400, 20],
        ["deadlift", 500, 20],
      ]),
    );
    const stats = statValues(compute(heavy));
    for (const value of Object.values(stats)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(STAT_MAX);
    }
  });
});

describe("STR（筋力）", () => {
  it("挙上重量が増えると上がる", () => {
    const light = compute([session("2026-08-04", [["bench_press", 40, 8]])]).str.value;
    const heavy = compute([session("2026-08-04", [["bench_press", 120, 8]])]).str.value;
    expect(heavy).toBeGreaterThan(light);
  });

  it("同じ挙上重量でも体重が重いほど相対的に下がる", () => {
    const logs = [session("2026-08-04", [["bench_press", 100, 5]])];
    const lighter = compute(logs, { bodyWeightKg: 60 }).str.value;
    const heavier = compute(logs, { bodyWeightKg: 100 }).str.value;
    expect(lighter).toBeGreaterThan(heavier);
  });

  it("マシンしか使わない人でもSTRが伸びる", () => {
    // BIG3限定にすると、この人のSTRは永久に0のままになってしまう
    const stats = compute([
      session("2026-08-04", [
        ["chest_press_machine", 60, 10],
        ["shoulder_press_machine", 40, 10],
        ["leg_press", 120, 10],
      ]),
    ]);
    expect(stats.str.value).toBeGreaterThan(0);
  });

  it("上位3種目までしか数えない", () => {
    const three = compute([
      session("2026-08-04", [
        ["bench_press", 100, 5],
        ["back_squat", 100, 5],
        ["deadlift", 100, 5],
      ]),
    ]).str.value;
    const five = compute([
      session("2026-08-04", [
        ["bench_press", 100, 5],
        ["back_squat", 100, 5],
        ["deadlift", 100, 5],
        ["bent_over_row", 100, 5],
        ["overhead_press", 100, 5],
      ]),
    ]).str.value;
    expect(five).toBe(three);
  });

  it("未完了のセッションは数えない", () => {
    const incomplete: WorkoutSession = {
      ...session("2026-08-04", [["bench_press", 200, 5]]),
      completedAt: undefined,
    };
    expect(compute([incomplete]).str.value).toBe(0);
  });
});

describe("VIT（体力）", () => {
  it("目標日数に対する実施率で決まる", () => {
    const dates = ["2026-08-01", "2026-08-02", "2026-08-03", "2026-08-04"];
    const sessions = dates.map((d) => session(d, [["bench_press", 60, 8]]));

    const often = compute(sessions, { daysPerWeek: 2 }).vit.value;
    const rarely = compute(sessions, { daysPerWeek: 6 }).vit.value;
    // 同じ実施回数でも、目標が高いほど達成率は下がる
    expect(often).toBeGreaterThan(rarely);
  });

  it("28日より前の記録は数えない", () => {
    const old = compute([session("2026-01-01", [["bench_press", 60, 8]])]).vit.value;
    expect(old).toBe(0);
  });
});

describe("DEX（技巧）", () => {
  it("経験した種目数が増えると上がる", () => {
    const few = compute([session("2026-08-04", [["bench_press", 60, 8]])]).dex.value;
    const many = compute([
      session("2026-08-04", [
        ["bench_press", 60, 8],
        ["back_squat", 60, 8],
        ["deadlift", 60, 8],
        ["pullup", 0, 8],
        ["plank", 0, 60],
      ]),
    ]).dex.value;
    expect(many).toBeGreaterThan(few);
  });

  it("同じ種目を繰り返しても種目数は増えない", () => {
    const once = compute([session("2026-08-04", [["bench_press", 60, 8]])]).dex.raw;
    const repeated = compute([
      session("2026-08-03", [["bench_press", 60, 8]]),
      session("2026-08-04", [["bench_press", 60, 8]]),
    ]).dex.raw;
    expect(repeated).toBe(once);
  });
});

describe("自己ベストの判定", () => {
  it("過去の最高を上回った種目を数える", () => {
    const past = [session("2026-08-01", [["bench_press", 60, 10]])];
    const current = session("2026-08-04", [
      ["bench_press", 80, 10], // 更新
      ["back_squat", 100, 5], // 初挑戦なので更新扱い
    ]);
    expect(countPersonalRecords(current, past)).toBe(2);
  });

  it("下回っていれば数えない", () => {
    const past = [session("2026-08-01", [["bench_press", 100, 10]])];
    const current = session("2026-08-04", [["bench_press", 60, 10]]);
    expect(countPersonalRecords(current, past)).toBe(0);
  });

  it("同じ種目で複数セット更新しても1件として数える", () => {
    const past = [session("2026-08-01", [["bench_press", 60, 10]])];
    const current = session("2026-08-04", [
      ["bench_press", 70, 10],
      ["bench_press", 80, 10],
    ]);
    expect(countPersonalRecords(current, past)).toBe(1);
  });
});
