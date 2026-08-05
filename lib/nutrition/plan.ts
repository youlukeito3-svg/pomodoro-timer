import type {
  DateStr,
  Goal,
  Macros,
  MealSlot,
  PantryItem,
  PlannedMeal,
  RecipeDef,
} from "@/lib/types";
import { seededRandom } from "@/lib/date";
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
const WEIGHT_COVERAGE = 0.4;
const WEIGHT_MACRO_FIT = 0.3;
const WEIGHT_PORTION = 0.2;
const WEIGHT_TAG = 0.1;

/**
 * 日替わりの候補プール。
 *
 * 常に最高スコアを採ると毎日まったく同じ献立になる。かといってスコアに
 * 乱数を混ぜると、在庫が揃っているレシピを取りこぼしてしまう。
 * そこで「最高スコアと僅差のものだけ」を候補にし、その中から日付で選ぶ。
 * 明確に優れた候補（＝在庫が揃っている）があるときは差が開くので必ず選ばれ、
 * 横並びのときだけ日替わりになる。
 */
const TOP_N = 3;
const SCORE_MARGIN = 0.05;

/**
 * 1食あたりの人前の上限。
 * 「しらすごはん 2.5人前」のような現実には作らない分量を出さないために要る。
 * 量で埋めるのではなく、そのスロットの必要量に合ったレシピを選ばせる。
 */
export const MAX_SERVINGS = 2;
/** 間食は「バナナ2本」程度なら自然なので、目標の微調整用に少し広く取る */
export const MAX_SNACK_SERVINGS = 3;

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

/** カロリー予算に合わせた人前（0.5刻み） */
export function fitServings(
  recipeKcal: number,
  budgetKcal: number,
  maxServings: number = MAX_SERVINGS,
): number {
  if (recipeKcal <= 0) return 1;
  const raw = budgetKcal / recipeKcal;
  const stepped = Math.round(raw * 2) / 2;
  return Math.min(Math.max(stepped, 0.5), maxServings);
}

/**
 * 分量の自然さ 0〜1。1人前に近いほど高い。
 * これが無いと、間食サイズのレシピを何倍にもして主食の枠を埋めてしまう。
 */
export function portionFit(servings: number): number {
  return Math.max(1 - Math.abs(servings - 1) / 1.5, 0);
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
  /** 「別の献立にする」で別の候補を出すための種。省略時は日付のみで決定的。 */
  seedSuffix?: string;
}): MealPlanResult {
  const { date, target, pantry, goal, dietaryNg, seedSuffix = "" } = params;
  const seedBase = seedSuffix ? `${date}#${seedSuffix}` : date;
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

    const maxServings = slot === "snack" ? MAX_SNACK_SERVINGS : MAX_SERVINGS;

    const scored = candidates
      .map((recipe) => {
        const macros = cachedRecipeMacros(recipe);
        const servings = fitServings(macros.kcal, budget, maxServings);
        const scaled = scaleMacros(macros, servings);

        const score =
          WEIGHT_COVERAGE * pantryCoverage(recipe, working, servings) +
          WEIGHT_MACRO_FIT * macroFit(scaled, remaining) +
          WEIGHT_PORTION * portionFit(budget / Math.max(macros.kcal, 1)) +
          WEIGHT_TAG * tagScore(recipe, preferred);

        return { recipe, servings, score };
      })
      // 同点は id 順で解決し、結果が配列の並び順に依存しないようにする
      .sort((a, b) => b.score - a.score || a.recipe.id.localeCompare(b.recipe.id));

    const bestScore = scored[0]?.score ?? 0;
    const pool = scored
      .filter((entry) => entry.score >= bestScore - SCORE_MARGIN)
      .slice(0, TOP_N);

    const pick = Math.floor(seededRandom(`${seedBase}:${slot}`)() * pool.length);
    const chosen = pool[Math.min(pick, pool.length - 1)];
    if (!chosen) continue;

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

  const servings = fitServings(perServing.kcal, needed, MAX_SNACK_SERVINGS);
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
