import type {
  AppData,
  DateStr,
  MealSlot,
  PantryItem,
  PlannedMeal,
  Macros,
  UserProfile,
  WorkoutSession,
  XpEvent,
  XpSource,
} from "@/lib/types";
import { todayStr } from "@/lib/date";
import { getAppData, updateAppData } from "@/lib/store/hooks";
import { EXERCISE_BY_ID } from "@/lib/workout/exercises";
import type { WorkoutPlan } from "@/lib/workout/generate";
import { countPersonalRecords } from "@/lib/rpg/stats";
import {
  MEAL_TARGET_XP,
  WEIGHT_LOG_XP,
  activeDatesFrom,
  computeStreak,
  computeWorkoutXp,
  type WorkoutXpBreakdown,
} from "@/lib/rpg/xp";
import { earnedTitleIds } from "@/lib/rpg/titles";
import { selectGameState } from "@/lib/selectors";

/**
 * 永続データへの書き込み操作。
 *
 * XP の付与は必ずここを通す。イベント id を「種別:日付」の決定的なキーに
 * することで、同じ行動を二重に加算してしまう事故を構造的に防いでいる。
 */

function xpEventId(source: XpSource, date: DateStr, suffix = ""): string {
  return suffix ? `${source}:${date}:${suffix}` : `${source}:${date}`;
}

/** 同じ id のイベントが既にあれば何もしない */
function withXpEvent(data: AppData, event: XpEvent): AppData {
  if (data.xpEvents.some((e) => e.id === event.id)) return data;
  return { ...data, xpEvents: [...data.xpEvents, event] };
}

// ---------------------------------------------------------------------------
// プロフィール
// ---------------------------------------------------------------------------

export function saveProfile(profile: UserProfile, initialWeightKg?: number): void {
  updateAppData((data) => {
    let next: AppData = { ...data, profile };

    // 初回登録時は体重を1件入れておく。カロリー計算もステータスも体重が
    // 起点になるので、未記録のまま先に進ませない。
    if (initialWeightKg && next.weights.length === 0) {
      const date = todayStr();
      next = {
        ...next,
        weights: [{ date, weightKg: initialWeightKg }],
      };
      next = withXpEvent(next, {
        id: xpEventId("weightLog", date),
        date,
        source: "weightLog",
        amount: WEIGHT_LOG_XP,
        note: "体重を記録",
      });
    }
    return next;
  });
}

// ---------------------------------------------------------------------------
// 体重
// ---------------------------------------------------------------------------

export function logWeight(params: {
  date?: DateStr;
  weightKg: number;
  bodyFatPct?: number;
  memo?: string;
}): void {
  const date = params.date ?? todayStr();
  updateAppData((data) => {
    const entry = {
      date,
      weightKg: params.weightKg,
      bodyFatPct: params.bodyFatPct,
      memo: params.memo,
    };
    const weights = data.weights.some((w) => w.date === date)
      ? data.weights.map((w) => (w.date === date ? entry : w))
      : [...data.weights, entry];

    const next = { ...data, weights: weights.sort((a, b) => a.date.localeCompare(b.date)) };
    return withXpEvent(next, {
      id: xpEventId("weightLog", date),
      date,
      source: "weightLog",
      amount: WEIGHT_LOG_XP,
      note: "体重を記録",
    });
  });
}

export function removeWeight(date: DateStr): void {
  updateAppData((data) => ({
    ...data,
    weights: data.weights.filter((w) => w.date !== date),
  }));
}

// ---------------------------------------------------------------------------
// トレーニング
// ---------------------------------------------------------------------------

/** プランからセッションの雛形を作る（既にあればそのまま返す） */
export function ensureSession(date: DateStr, plan: WorkoutPlan): void {
  updateAppData((data) => {
    if (data.sessions.some((s) => s.date === date)) return data;
    if (plan.exercises.length === 0) return data;

    const logs = plan.exercises.flatMap((planned) =>
      Array.from({ length: planned.sets }, (_, setIndex) => ({
        exerciseId: planned.exerciseId,
        setIndex,
        weightKg: planned.targetWeightKg ?? 0,
        reps: planned.reps,
        done: false,
      })),
    );

    const session: WorkoutSession = { date, split: plan.split, logs };
    return { ...data, sessions: [...data.sessions, session] };
  });
}

export function updateSet(params: {
  date: DateStr;
  exerciseId: string;
  setIndex: number;
  patch: Partial<{ weightKg: number; reps: number; done: boolean }>;
}): void {
  const { date, exerciseId, setIndex, patch } = params;
  updateAppData((data) => ({
    ...data,
    sessions: data.sessions.map((session) => {
      if (session.date !== date) return session;
      return {
        ...session,
        logs: session.logs.map((log) =>
          log.exerciseId === exerciseId && log.setIndex === setIndex
            ? { ...log, ...patch }
            : log,
        ),
      };
    }),
  }));
}

/** セットを1つ追加する（予定より多くこなしたとき用） */
export function addSet(date: DateStr, exerciseId: string): void {
  updateAppData((data) => ({
    ...data,
    sessions: data.sessions.map((session) => {
      if (session.date !== date) return session;
      const existing = session.logs.filter((l) => l.exerciseId === exerciseId);
      const last = existing[existing.length - 1];
      return {
        ...session,
        logs: [
          ...session.logs,
          {
            exerciseId,
            setIndex: existing.length,
            weightKg: last?.weightKg ?? 0,
            reps: last?.reps ?? 10,
            done: false,
          },
        ],
      };
    }),
  }));
}

/**
 * トレーニングを完了してXPを付与する。
 * UIで内訳を見せるため、加算したXPの内訳を返す。
 */
export function completeWorkout(params: {
  date: DateStr;
  plannedSetCount: number;
  durationMin?: number;
}): WorkoutXpBreakdown | null {
  const { date, plannedSetCount, durationMin } = params;
  let breakdown: WorkoutXpBreakdown | null = null;

  updateAppData((data) => {
    const session = data.sessions.find((s) => s.date === date);
    if (!session) return data;
    if (session.completedAt) return data; // 二重完了を防ぐ

    const state = selectGameState(data, date);
    const past = data.sessions.filter((s) => s.date !== date && s.completedAt);

    const xp = computeWorkoutXp({
      session,
      exercises: EXERCISE_BY_ID,
      bodyWeightKg: state.bodyWeightKg,
      plannedSetCount,
      personalRecordCount: countPersonalRecords(session, past),
      // 完了前の時点のストリークを使う（今日の分を二重に数えないため）
      streakDays: computeStreak(
        activeDatesFrom({ sessions: past, weightDates: data.weights.map((w) => w.date) }),
        date,
      ),
    });
    breakdown = xp;

    const completed: WorkoutSession = {
      ...session,
      completedAt: new Date().toISOString(),
      durationMin,
    };

    let next: AppData = {
      ...data,
      sessions: data.sessions.map((s) => (s.date === date ? completed : s)),
    };

    next = withXpEvent(next, {
      id: xpEventId("workout", date),
      date,
      source: "workout",
      amount: xp.total,
      note: `トレーニング完了（ボリューム ${xp.volume}XP）`,
    });

    return next;
  });

  return breakdown;
}

// ---------------------------------------------------------------------------
// 食事
// ---------------------------------------------------------------------------

/** その日の献立を保存する（生成結果を固定して、後から変わらないようにする） */
export function saveMealPlan(date: DateStr, meals: PlannedMeal[], target: Macros): void {
  updateAppData((data) => {
    if (data.mealPlans.some((p) => p.date === date)) return data;
    return {
      ...data,
      mealPlans: [...data.mealPlans, { date, target, meals, eaten: [] }],
    };
  });
}

/** 献立を作り直す（在庫が変わったとき用） */
export function replaceMealPlan(date: DateStr, meals: PlannedMeal[], target: Macros): void {
  updateAppData((data) => {
    const existing = data.mealPlans.find((p) => p.date === date);
    const entry = { date, target, meals, eaten: existing?.eaten ?? [] };
    return {
      ...data,
      mealPlans: data.mealPlans.some((p) => p.date === date)
        ? data.mealPlans.map((p) => (p.date === date ? entry : p))
        : [...data.mealPlans, entry],
    };
  });
}

/**
 * 食事を「食べた」に切り替える。
 * 主要3食を食べた時点でカロリー目標達成としてXPを与える。
 */
export function toggleMealEaten(date: DateStr, slot: MealSlot): void {
  updateAppData((data) => {
    const plan = data.mealPlans.find((p) => p.date === date);
    if (!plan) return data;

    const eaten = plan.eaten.includes(slot)
      ? plan.eaten.filter((s) => s !== slot)
      : [...plan.eaten, slot];

    let next: AppData = {
      ...data,
      mealPlans: data.mealPlans.map((p) => (p.date === date ? { ...p, eaten } : p)),
    };

    const mainSlots: MealSlot[] = ["breakfast", "lunch", "dinner"];
    if (mainSlots.every((s) => eaten.includes(s))) {
      next = withXpEvent(next, {
        id: xpEventId("mealTarget", date),
        date,
        source: "mealTarget",
        amount: MEAL_TARGET_XP,
        note: "カロリー目標を達成",
      });
    }
    return next;
  });
}

// ---------------------------------------------------------------------------
// 在庫
// ---------------------------------------------------------------------------

export function addPantryItems(items: Omit<PantryItem, "id" | "addedAt">[]): void {
  updateAppData((data) => {
    const addedAt = new Date().toISOString();
    const created: PantryItem[] = items.map((item, i) => ({
      ...item,
      id: `${Date.now()}-${i}`,
      addedAt,
    }));

    // 同じ食材が既にあれば数量をまとめる（同じ品が並ぶと在庫が読みにくい）
    const merged = [...data.pantry];
    for (const item of created) {
      const index = item.foodId
        ? merged.findIndex((p) => p.foodId === item.foodId)
        : -1;
      if (index >= 0) {
        merged[index] = { ...merged[index], grams: merged[index].grams + item.grams };
      } else {
        merged.push(item);
      }
    }
    return { ...data, pantry: merged };
  });
}

export function updatePantryItem(id: string, patch: Partial<PantryItem>): void {
  updateAppData((data) => ({
    ...data,
    pantry: data.pantry.map((p) => (p.id === id ? { ...p, ...patch } : p)),
  }));
}

export function removePantryItem(id: string): void {
  updateAppData((data) => ({
    ...data,
    pantry: data.pantry.filter((p) => p.id !== id),
  }));
}

/** 献立を作ったぶんの食材を在庫から減らす */
export function consumePantryForMeal(consumed: { foodId: string; grams: number }[]): void {
  updateAppData((data) => {
    let pantry = [...data.pantry];
    for (const { foodId, grams } of consumed) {
      let remaining = grams;
      pantry = pantry
        .map((item) => {
          if (item.foodId !== foodId || remaining <= 0) return item;
          const take = Math.min(item.grams, remaining);
          remaining -= take;
          return { ...item, grams: item.grams - take };
        })
        .filter((item) => item.grams > 0.01);
    }
    return { ...data, pantry };
  });
}

// ---------------------------------------------------------------------------
// RPG
// ---------------------------------------------------------------------------

/** レベルアップ演出を見せたあとに呼ぶ */
export function acknowledgeLevel(level: number): void {
  updateAppData((data) => ({
    ...data,
    rpg: { ...data.rpg, lastSeenLevel: level },
  }));
}

/** 条件を満たした称号を解禁済みとして記録する */
export function syncTitles(): string[] {
  const data = getAppData();
  const state = selectGameState(data);
  const earned = earnedTitleIds(state.titleContext);
  const fresh = earned.filter((id) => !data.rpg.unlockedTitles.includes(id));

  if (fresh.length > 0) {
    updateAppData((current) => ({
      ...current,
      rpg: {
        ...current.rpg,
        unlockedTitles: [...new Set([...current.rpg.unlockedTitles, ...earned])],
      },
    }));
  }
  return fresh;
}
