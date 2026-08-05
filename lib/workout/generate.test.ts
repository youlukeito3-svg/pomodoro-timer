import { describe, expect, it } from "vitest";
import type { UserProfile, WorkoutSession } from "@/lib/types";
import { EXERCISE_BY_ID } from "./exercises";
import {
  availableExercises,
  generatePlan,
  lastPerformance,
  maxDifficultyForLevel,
  progressiveTarget,
  splitForDate,
} from "./generate";

const profile: UserProfile = {
  name: "テスト",
  sex: "male",
  birthDate: "1995-01-01",
  heightCm: 172,
  goal: "bulk",
  activityLevel: 3,
  equipment: ["bodyweight", "dumbbell", "barbell", "machine", "cable"],
  daysPerWeek: 3,
  dietaryNg: [],
  startedAt: "2026-08-03",
};

const gen = (date: string, over: Partial<Parameters<typeof generatePlan>[0]> = {}) =>
  generatePlan({
    profile,
    date,
    level: 1000,
    sessions: [],
    bodyWeightKg: 70,
    ...over,
  });

describe("分割のローテーション", () => {
  it("週3日は Push / Pull / Legs を回す", () => {
    expect(splitForDate(profile, "2026-08-03")).toBe("push");
    expect(splitForDate(profile, "2026-08-04")).toBe("rest");
    expect(splitForDate(profile, "2026-08-05")).toBe("pull");
    expect(splitForDate(profile, "2026-08-07")).toBe("legs");
  });

  it("7日で一周する", () => {
    expect(splitForDate(profile, "2026-08-10")).toBe(splitForDate(profile, "2026-08-03"));
  });

  it("開始日より前の日付でも例外にならない", () => {
    expect(() => splitForDate(profile, "2026-07-01")).not.toThrow();
    expect(splitForDate(profile, "2026-07-27")).toBe("push");
  });

  it("週あたりの日数ごとに休養日の数が変わる", () => {
    const countRest = (daysPerWeek: number) => {
      const p = { ...profile, daysPerWeek };
      let rest = 0;
      for (let i = 0; i < 7; i++) {
        const date = `2026-08-${String(3 + i).padStart(2, "0")}`;
        if (splitForDate(p, date) === "rest") rest++;
      }
      return 7 - rest;
    };
    expect(countRest(2)).toBe(2);
    expect(countRest(3)).toBe(3);
    expect(countRest(4)).toBe(4);
    expect(countRest(6)).toBe(6);
  });
});

describe("難易度の解禁", () => {
  it("レベルとともに段階的に開放される", () => {
    expect(maxDifficultyForLevel(1)).toBe(2);
    expect(maxDifficultyForLevel(100)).toBe(3);
    expect(maxDifficultyForLevel(400)).toBe(4);
    expect(maxDifficultyForLevel(1000)).toBe(5);
    expect(maxDifficultyForLevel(9999)).toBe(5);
  });

  it("低レベルでは高難度種目が候補に入らない", () => {
    const pool = availableExercises(profile, 1);
    expect(pool.every((e) => e.difficulty <= 2)).toBe(true);
    expect(pool.some((e) => e.id === "deadlift")).toBe(false);
  });

  it("初心者でも十分な種目数が残る", () => {
    expect(availableExercises(profile, 1).length).toBeGreaterThanOrEqual(20);
  });
});

describe("器具フィルタ", () => {
  it("持っていない器具の種目は選ばれない", () => {
    const homeOnly: UserProfile = { ...profile, equipment: ["bodyweight"] };
    const pool = availableExercises(homeOnly, 9999);
    expect(pool.every((e) => e.equipment === "bodyweight")).toBe(true);

    const plan = generatePlan({
      profile: homeOnly,
      date: "2026-08-03",
      level: 9999,
      sessions: [],
      bodyWeightKg: 70,
    });
    for (const planned of plan.exercises) {
      expect(EXERCISE_BY_ID.get(planned.exerciseId)?.equipment).toBe("bodyweight");
    }
  });

  it("自重のみでも各分割でメニューが組める", () => {
    const homeOnly: UserProfile = { ...profile, equipment: ["bodyweight"], daysPerWeek: 6 };
    for (let i = 0; i < 7; i++) {
      const date = `2026-08-${String(3 + i).padStart(2, "0")}`;
      const plan = generatePlan({
        profile: homeOnly,
        date,
        level: 500,
        sessions: [],
        bodyWeightKg: 70,
      });
      if (plan.split === "rest") continue;
      expect(plan.exercises.length).toBeGreaterThan(0);
    }
  });
});

describe("プラン生成", () => {
  it("同じ入力からは必ず同じプランが出る", () => {
    const a = gen("2026-08-05");
    const b = gen("2026-08-05");
    expect(a).toEqual(b);
  });

  it("日が変わればメニューも変わる（同じ分割でも）", () => {
    // 8/3 と 8/10 はどちらも push
    const a = gen("2026-08-03");
    const b = gen("2026-08-10");
    expect(a.split).toBe(b.split);
    const idsA = a.exercises.map((e) => e.exerciseId).join(",");
    const idsB = b.exercises.map((e) => e.exerciseId).join(",");
    expect(idsA).not.toBe(idsB);
  });

  it("休養日は空のプランになる", () => {
    const plan = gen("2026-08-04");
    expect(plan.split).toBe("rest");
    expect(plan.exercises).toHaveLength(0);
    expect(plan.estimatedKcal).toBe(0);
  });

  it("コンパウンド種目が先頭に来る", () => {
    const plan = gen("2026-08-03");
    const compoundFlags = plan.exercises.map(
      (e) => EXERCISE_BY_ID.get(e.exerciseId)!.isCompound,
    );
    const firstFalse = compoundFlags.indexOf(false);
    if (firstFalse !== -1) {
      expect(compoundFlags.slice(firstFalse).every((f) => !f)).toBe(true);
    }
  });

  it("同じ部位に偏りすぎない", () => {
    const plan = gen("2026-08-03");
    const counts = new Map<string, number>();
    for (const e of plan.exercises) {
      const primary = EXERCISE_BY_ID.get(e.exerciseId)!.muscles[0];
      counts.set(primary, (counts.get(primary) ?? 0) + 1);
    }
    for (const count of counts.values()) expect(count).toBeLessThanOrEqual(2);
  });

  it("同じ種目が重複しない", () => {
    const plan = gen("2026-08-03");
    const ids = plan.exercises.map((e) => e.exerciseId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("消費カロリーと所要時間が正の値で出る", () => {
    const plan = gen("2026-08-03");
    expect(plan.estimatedKcal).toBeGreaterThan(0);
    expect(plan.estimatedMinutes).toBeGreaterThan(0);
  });
});

describe("漸進性過負荷", () => {
  const bench = EXERCISE_BY_ID.get("bench_press")!; // repRange [6,10]

  const sessionWith = (weightKg: number, reps: number[]): WorkoutSession => ({
    date: "2026-08-01",
    split: "push",
    completedAt: "2026-08-01T10:00:00.000Z",
    logs: reps.map((r, i) => ({
      exerciseId: "bench_press",
      setIndex: i,
      weightKg,
      reps: r,
      done: true,
    })),
  });

  it("初回は重量を提示せずレップ下限から始める", () => {
    const t = progressiveTarget(bench, []);
    expect(t.targetWeightKg).toBeUndefined();
    expect(t.reps).toBe(bench.repRange[0]);
  });

  it("全セットでレップ上限に達したら重量を上げる", () => {
    const sessions = [sessionWith(60, [10, 10, 10])];
    const t = progressiveTarget(bench, sessions);
    // 胸種目なので +2.5kg
    expect(t.targetWeightKg).toBe(62.5);
    expect(t.reps).toBe(bench.repRange[0]);
  });

  it("下半身の大きな種目は刻みが大きい", () => {
    const squat = EXERCISE_BY_ID.get("back_squat")!; // repRange [6,10]
    const sessions: WorkoutSession[] = [
      {
        date: "2026-08-01",
        split: "legs",
        completedAt: "2026-08-01T10:00:00.000Z",
        logs: [0, 1, 2].map((i) => ({
          exerciseId: "back_squat",
          setIndex: i,
          weightKg: 80,
          reps: 10,
          done: true,
        })),
      },
    ];
    expect(progressiveTarget(squat, sessions).targetWeightKg).toBe(85);
  });

  it("レップ上限に届かなければ重量据え置きでレップを伸ばす", () => {
    const sessions = [sessionWith(60, [10, 9, 8])];
    const t = progressiveTarget(bench, sessions);
    expect(t.targetWeightKg).toBe(60);
    expect(t.reps).toBe(10); // 最高9回 +1、ただし上限10でクランプ
  });

  it("自重種目は重量ではなくレップを伸ばす", () => {
    const pushup = EXERCISE_BY_ID.get("pushup")!; // repRange [10,25]
    const sessions: WorkoutSession[] = [
      {
        date: "2026-08-01",
        split: "push",
        completedAt: "2026-08-01T10:00:00.000Z",
        logs: [{ exerciseId: "pushup", setIndex: 0, weightKg: 0, reps: 15, done: true }],
      },
    ];
    const t = progressiveTarget(pushup, sessions);
    expect(t.targetWeightKg).toBeUndefined();
    expect(t.reps).toBe(16);
  });

  it("未完了セットしかないセッションは参照しない", () => {
    const sessions: WorkoutSession[] = [
      {
        date: "2026-08-01",
        split: "push",
        completedAt: "2026-08-01T10:00:00.000Z",
        logs: [{ exerciseId: "bench_press", setIndex: 0, weightKg: 60, reps: 10, done: false }],
      },
    ];
    expect(lastPerformance("bench_press", sessions)).toBeNull();
  });

  it("最新のセッションを参照する", () => {
    const sessions: WorkoutSession[] = [
      sessionWith(60, [10, 10, 10]),
      { ...sessionWith(70, [8, 8, 8]), date: "2026-08-04" },
    ];
    const last = lastPerformance("bench_press", sessions);
    expect(last?.weightKg).toBe(70);
    expect(last?.allHitTop).toBe(false);
  });
});
