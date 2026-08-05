import type {
  DateStr,
  Goal,
  Macros,
  MealSlot,
  PantryItem,
  PlannedMeal,
  RecipeDef,
} from "@/lib/types";
import { seededShuffle } from "@/lib/date";
import { FOOD_BY_ID } from "./foods";
import { RECIPES, RECIPE_BY_ID, cachedRecipeMacros } from "./recipes";
import { ZERO_MACROS, addMacros, roundMacros, scaleMacros } from "./bmr";

/**
 * 献立の組み立て。
 *
 * 在庫を優先しつつ目標PFCに寄せる。完全な最適化（全組み合わせ探索）は
 * 組合せ爆発するので、スロット順の貪欲法で十分な解を得る方針。
 * 目標との乖離は最後に間食の量で吸収する。
 */

/** スロットごとのカロリー配分 */
const SLOT_SHARES: Record<MealSlot, number> = {
  breakfast: 0.25,
  lunch: 0.35,
  dinner: 0.3,
  snack: 0.1,
};

const SLOT_ORDER: MealSlot[] = ["breakfast", "lunch", "dinner", "snack"];

/** 目標ごとに好むレシピタグ */
const PREFERRED_TAGS: Record<Goal, string[]> = {
  bulk: ["高たんぱく"],
  cut: ["高たんぱく", "低脂質"],
  maintain: ["高たんぱく"],
};

/** スコアの重み */
const WEIGHT_COVERAGE = 0.5;
const WEIGHT_MACRO_FIT = 0.4;
const WEIGHT_TAG = 0.1;
/** 同点時に日替わりで散らすための微小な揺らぎ */
const JITTER = 0.03;

export interface PantryStock {
  /** foodId -> グラム数 */
  grams: Map<string, number>;
}

export function buildStock(pantry: readonly PantryItem[]): PantryStock {
  const grams = new Map<string, number>();
  for (const item of pantry) {
    if (!item.foodId) continue;
    grams.set(item.foodId, (grams.get(item.foodId) ?? 0) + item.grams);
  }
  return { grams };
}

/**
 * 在庫カバー率 0〜1。
 *
 * 調味料は除外する。塩や醤油までレシートから拾えることは期待できず、
 * 含めるとどのレシピも一律に低スコアになって差がつかなくなるため。
 */
export function pantryCoverage(recipe: RecipeDef, stock: PantryStock, servings = 1): number {
  let needed = 0;
  let covered = 0;
  for (const ing of recipe.ingredients) {
    const food = FOOD_BY_ID.get(ing.foodId);
    if (!food || food.category === "seasoning") continue;
    const grams = ing.grams * servings;
    needed += grams;
    covered += Math.min(stock.grams.get(ing.foodId) ?? 0, grams);
  }
  if (needed === 0) return 1;
  return covered / needed;
}

/**
 * 残りの目標に対する適合度 0〜1。
 *
 * 「1kcal あたり何gのタンパク質か」を残り目標と比べる。筋トレアプリでは
 * タンパク質が最も効く制約なので、これを主軸に据えるのが実用的。
 */
export function macroFit(recipeMacro: Macros, remaining: Macros): number {
  if (recipeMacro.kcal <= 0) return 0;
  const targetDensity = remaining.kcal > 0 ? remaining.protein / remaining.kcal : 0;
  if (targetDensity <= 0) return 0.5;
  const recipeDensity = recipeMacro.protein / recipeMacro.kcal;
  const diff = Math.abs(recipeDensity - targetDensity) / targetDensity;
  return Math.max(1 - diff, 0);
}

function tagScore(recipe: RecipeDef, preferred: readonly string[]): number {
  if (preferred.length === 0) return 0;
  const matched = preferred.filter((t) => recipe.tags.includes(t)).length;
  return matched / preferred.length;
}

/** アレルギー・苦手食材を含むレシピを除外する */
export function isAllowed(recipe: RecipeDef, dietaryNg: readonly string[]): boolean {
  if (dietaryNg.length === 0) return true;
  const ng = new Set(dietaryNg);
  for (const ing of recipe.ingredients) {
    if (ng.has(ing.foodId)) return false;
    const food = FOOD_BY_ID.get(ing.foodId);
    if (food && ng.has(food.name)) return false;
  }
  return recipe.tags.every((t) => !ng.has(t));
}

/** カロリー予算に合わせた人前（0.5刻み、0.5〜3.0） */
export function fitServings(recipeKcal: number, budgetKcal: number): number {
  if (recipeKcal <= 0) return 1;
  const raw = budgetKcal / recipeKcal;
  const stepped = Math.round(raw * 2) / 2;
  return Math.min(Math.max(stepped, 0.5), 3);
}

export interface MealPlanResult {
  meals: PlannedMeal[];
  total: Macros;
  target: Macros;
  /** 不足している食材（買い物リスト） */
  shoppingList: { foodId: string; name: string; grams: number }[];
  /** 目標カロリーとの差（正なら超過） */
  kcalDiff: number;
}

export function generateMealPlan(params: {
  date: DateStr;
  target: Macros;
  pantry: readonly PantryItem[];
  goal: Goal;
  dietaryNg: readonly string[];
}): MealPlanResult {
  const { date, target, pantry, goal, dietaryNg } = params;
  const stock = buildStock(pantry);
  const preferred = PREFERRED_TAGS[goal];

  // 在庫は選ぶたびに減らしていく（同じ食材を複数レシピで二重計上しないため）
  const working: PantryStock = { grams: new Map(stock.grams) };

  const meals: PlannedMeal[] = [];
  const used = new Set<string>();
  let remaining: Macros = { ...target };
  let total: Macros = ZERO_MACROS;

  for (const slot of SLOT_ORDER) {
    const budget = target.kcal * SLOT_SHARES[slot];

    const candidates = RECIPES.filter(
      (r) => r.slots.includes(slot) && !used.has(r.id) && isAllowed(r, dietaryNg),
    );
    if (candidates.length === 0) continue;

    // 同点のときに日替わりで別のものが選ばれるよう、先に決定的シャッフルする
    const shuffled = seededShuffle(candidates, `${date}:${slot}`);

    let best: { recipe: RecipeDef; servings: number; score: number } | null = null;
    shuffled.forEach((recipe, index) => {
      const macros = cachedRecipeMacros(recipe);
      const servings = fitServings(macros.kcal, budget);
      const scaled = scaleMacros(macros, servings);

      const score =
        WEIGHT_COVERAGE * pantryCoverage(recipe, working, servings) +
        WEIGHT_MACRO_FIT * macroFit(scaled, remaining) +
        WEIGHT_TAG * tagScore(recipe, preferred) +
        JITTER * (1 - index / shuffled.length);

      if (!best || score > best.score) best = { recipe, servings, score };
    });

    if (!best) continue;
    const chosen: { recipe: RecipeDef; servings: number; score: number } = best;

    meals.push({ slot, recipeId: chosen.recipe.id, servings: chosen.servings });
    used.add(chosen.recipe.id);

    const contribution = scaleMacros(cachedRecipeMacros(chosen.recipe), chosen.servings);
    total = addMacros(total, contribution);
    remaining = {
      kcal: Math.max(remaining.kcal - contribution.kcal, 0),
      protein: Math.max(remaining.protein - contribution.protein, 0),
      fat: Math.max(remaining.fat - contribution.fat, 0),
      carb: Math.max(remaining.carb - contribution.carb, 0),
    };

    consumeStock(working, chosen.recipe, chosen.servings);
  }

  // 目標から10%以上ずれていれば間食の量で寄せる
  const adjusted = adjustSnack(meals, total, target);

  return {
    meals: adjusted.meals,
    total: roundMacros(adjusted.total),
    target,
    shoppingList: buildShoppingList(adjusted.meals, stock),
    kcalDiff: Math.round(adjusted.total.kcal - target.kcal),
  };
}

function consumeStock(stock: PantryStock, recipe: RecipeDef, servings: number): void {
  for (const ing of recipe.ingredients) {
    const have = stock.grams.get(ing.foodId);
    if (have === undefined) continue;
    stock.grams.set(ing.foodId, Math.max(have - ing.grams * servings, 0));
  }
}

/** 間食の人前を増減させて総カロリーを目標に寄せる */
function adjustSnack(
  meals: PlannedMeal[],
  total: Macros,
  target: Macros,
): { meals: PlannedMeal[]; total: Macros } {
  const index = meals.findIndex((m) => m.slot === "snack");
  if (index === -1) return { meals, total };

  const snack = meals[index];
  const recipe = RECIPE_BY_ID.get(snack.recipeId);
  if (!recipe) return { meals, total };

  const perServing = cachedRecipeMacros(recipe);
  if (perServing.kcal <= 0) return { meals, total };

  const withoutSnack: Macros = {
    kcal: total.kcal - perServing.kcal * snack.servings,
    protein: total.protein - perServing.protein * snack.servings,
    fat: total.fat - perServing.fat * snack.servings,
    carb: total.carb - perServing.carb * snack.servings,
  };

  const needed = target.kcal - withoutSnack.kcal;

  // 三食だけで目標をほぼ満たしているなら間食を丸ごと落とす。
  // fitServings の下限は0.5人前なので、ここで抜かないと低カロリー目標の人が
  // 必ず超過してしまう。
  const nextMeals = [...meals];
  if (needed < perServing.kcal * 0.25) {
    nextMeals.splice(index, 1);
    return { meals: nextMeals, total: withoutSnack };
  }

  const servings = fitServings(perServing.kcal, needed);
  nextMeals[index] = { ...snack, servings };

  return {
    meals: nextMeals,
    total: addMacros(withoutSnack, scaleMacros(perServing, servings)),
  };
}

/** 献立に必要な量から在庫を引いた不足分 */
export function buildShoppingList(
  meals: readonly PlannedMeal[],
  stock: PantryStock,
): { foodId: string; name: string; grams: number }[] {
  const needed = new Map<string, number>();

  for (const meal of meals) {
    const recipe = RECIPE_BY_ID.get(meal.recipeId);
    if (!recipe) continue;
    for (const ing of recipe.ingredients) {
      needed.set(ing.foodId, (needed.get(ing.foodId) ?? 0) + ing.grams * meal.servings);
    }
  }

  const list: { foodId: string; name: string; grams: number }[] = [];
  for (const [foodId, grams] of needed) {
    const food = FOOD_BY_ID.get(foodId);
    if (!food) continue;
    // 調味料は常備前提として買い物リストには出さない
    if (food.category === "seasoning") continue;
    const shortfall = grams - (stock.grams.get(foodId) ?? 0);
    if (shortfall > 0) {
      list.push({ foodId, name: food.name, grams: Math.ceil(shortfall) });
    }
  }

  return list.sort((a, b) => b.grams - a.grams);
}

/** 献立の合計栄養価 */
export function mealsMacros(meals: readonly PlannedMeal[]): Macros {
  let total = ZERO_MACROS;
  for (const meal of meals) {
    const recipe = RECIPE_BY_ID.get(meal.recipeId);
    if (!recipe) continue;
    total = addMacros(total, scaleMacros(cachedRecipeMacros(recipe), meal.servings));
  }
  return roundMacros(total);
}
