import type { AppData, DateStr, MuscleGroup } from "@/lib/types";
import { MUSCLE_LABEL } from "@/lib/types";
import { daysBetween, isWithinDays, todayStr } from "@/lib/date";
import { EXERCISE_BY_ID } from "@/lib/workout/exercises";
import type { GameState } from "@/lib/selectors";
import { FOOD_BY_ID } from "./foods";
import { RECIPES, cachedRecipeMacros } from "./recipes";

/**
 * ルールベースの提案。
 *
 * AIキーが無くても必ず動く助言の土台。保持しているデータから確実に言えることだけを
 * 出す方針で、推測にもとづく健康アドバイスはしない。
 */

export type AdviceKind = "nutrition" | "training" | "pantry" | "habit";

export interface Advice {
  kind: AdviceKind;
  text: string;
  /** 高いほど優先して表示する */
  priority: number;
}

const KIND_LABEL: Record<AdviceKind, string> = {
  nutrition: "食事",
  training: "トレーニング",
  pantry: "在庫",
  habit: "習慣",
};

export function adviceKindLabel(kind: AdviceKind): string {
  return KIND_LABEL[kind];
}

export function buildAdvice(data: AppData, state: GameState, today: DateStr = todayStr()): Advice[] {
  const advice: Advice[] = [];

  // --- 栄養 ---------------------------------------------------------------
  if (state.target) {
    const { target, consumed } = state;
    const proteinLeft = target.protein - consumed.protein;

    if (proteinLeft > 20) {
      const suggestion = highProteinSuggestion(proteinLeft);
      advice.push({
        kind: "nutrition",
        priority: 90,
        text: suggestion
          ? `タンパク質があと ${Math.round(proteinLeft)}g 足りません。${suggestion} を足すと近づきます。`
          : `タンパク質があと ${Math.round(proteinLeft)}g 足りません。`,
      });
    }

    const kcalLeft = target.kcal - consumed.kcal;
    if (kcalLeft < -200) {
      advice.push({
        kind: "nutrition",
        priority: 70,
        text: `目標より ${Math.abs(Math.round(kcalLeft))} kcal 多く摂っています。明日は間食を減らすと帳尻が合います。`,
      });
    } else if (kcalLeft > 500 && consumed.kcal > 0) {
      advice.push({
        kind: "nutrition",
        priority: 60,
        text: `あと ${Math.round(kcalLeft)} kcal 余裕があります。増量中は不足のほうが伸びを止めます。`,
      });
    }
  }

  // --- 在庫 ---------------------------------------------------------------
  const expiring = data.pantry
    .filter((item) => item.expiresAt)
    .map((item) => ({ item, daysLeft: daysBetween(today, item.expiresAt!) }))
    .filter(({ daysLeft }) => daysLeft <= 2)
    .sort((a, b) => a.daysLeft - b.daysLeft);

  if (expiring.length > 0) {
    const names = expiring
      .slice(0, 3)
      .map(({ item }) => (item.foodId ? FOOD_BY_ID.get(item.foodId)?.name : null) ?? item.rawName)
      .join("、");
    advice.push({
      kind: "pantry",
      priority: 95,
      text: `${names} の期限が近づいています。今日の献立に組み込みましょう。`,
    });
  }

  const stale = data.pantry.filter((item) => !item.foodId);
  if (stale.length > 0) {
    advice.push({
      kind: "pantry",
      priority: 40,
      text: `在庫に未分類の品が ${stale.length} 件あります。食材を選び直すと献立に反映されます。`,
    });
  }

  // --- トレーニング -------------------------------------------------------
  const neglected = neglectedMuscles(data, today);
  if (neglected.length > 0) {
    advice.push({
      kind: "training",
      priority: 80,
      text: `直近2週間で ${neglected.map((m) => MUSCLE_LABEL[m]).join("・")} を鍛えていません。次のメニューで意識してみてください。`,
    });
  }

  // --- 習慣 ---------------------------------------------------------------
  if (state.streak === 0 && data.sessions.length > 0) {
    advice.push({
      kind: "habit",
      priority: 85,
      text: "連続記録が途切れています。体重を1つ記録するだけでも再開できます。",
    });
  } else if (state.streak >= 3) {
    const multiplier = 1 + Math.min(state.streak, 30) / 60;
    advice.push({
      kind: "habit",
      priority: 30,
      text: `${state.streak}日連続で記録中。獲得XPが ×${multiplier.toFixed(2)} になっています。`,
    });
  }

  if (!data.weights.some((w) => w.date === today)) {
    advice.push({
      kind: "habit",
      priority: 75,
      text: "今日の体重がまだ未記録です。毎日同じ時間帯に測ると変化が読みやすくなります。",
    });
  }

  return advice.sort((a, b) => b.priority - a.priority);
}

/** 不足しているタンパク質を埋めやすい間食を探す */
function highProteinSuggestion(proteinNeeded: number): string | null {
  const candidates = RECIPES.filter((r) => r.slots.includes("snack")).map((recipe) => {
    const macros = cachedRecipeMacros(recipe);
    return { recipe, macros };
  });

  // 必要量に最も近く、かつタンパク質密度が高いものを選ぶ
  const best = candidates
    .filter((c) => c.macros.protein >= proteinNeeded * 0.4)
    .sort((a, b) => {
      const densityA = a.macros.protein / Math.max(a.macros.kcal, 1);
      const densityB = b.macros.protein / Math.max(b.macros.kcal, 1);
      return densityB - densityA;
    })[0];

  if (!best) return null;
  return `${best.recipe.name}（タンパク質 ${Math.round(best.macros.protein)}g）`;
}

/** 直近2週間で一度も刺激していない主要部位 */
function neglectedMuscles(data: AppData, today: DateStr): MuscleGroup[] {
  const major: MuscleGroup[] = ["chest", "back", "shoulders", "quads", "hamstrings"];
  const trained = new Set<MuscleGroup>();

  for (const session of data.sessions) {
    if (!session.completedAt || !isWithinDays(session.date, 14, today)) continue;
    for (const log of session.logs) {
      if (!log.done) continue;
      const def = EXERCISE_BY_ID.get(log.exerciseId);
      def?.muscles.forEach((m) => trained.add(m));
    }
  }

  // 一度もトレーニングしていない人に「鍛えていない」と言っても意味がない
  if (trained.size === 0) return [];
  return major.filter((m) => !trained.has(m));
}
