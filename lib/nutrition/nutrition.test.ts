import { describe, expect, it } from "vitest";
import type { ActivityLevel, Goal, PantryItem, UserProfile } from "@/lib/types";
import {
  ACTIVITY_FACTORS,
  calcBMR,
  calcCalorieTarget,
  calcTDEE,
  macrosToKcal,
} from "./bmr";
import { FOODS, FOOD_BY_ID, macrosForGrams } from "./foods";
import { RECIPES, cachedRecipeMacros, findBrokenIngredientRefs } from "./recipes";
import {
  buildStock,
  fitServings,
  generateMealPlan,
  isAllowed,
  pantryCoverage,
} from "./plan";

const profile: UserProfile = {
  name: "テスト",
  sex: "male",
  birthDate: "1996-08-05",
  heightCm: 172,
  goal: "bulk",
  activityLevel: 3,
  equipment: ["bodyweight", "dumbbell", "barbell"],
  daysPerWeek: 3,
  dietaryNg: [],
  startedAt: "2026-08-03",
};

describe("BMR / TDEE", () => {
  it("Mifflin-St Jeor 式の既知の値と一致する", () => {
    // 男性 70kg / 175cm / 30歳 = 10*70 + 6.25*175 - 5*30 + 5 = 1648.75
    expect(calcBMR({ sex: "male", weightKg: 70, heightCm: 175, age: 30 })).toBeCloseTo(1648.75, 2);
    // 女性 55kg / 160cm / 30歳 = 10*55 + 6.25*160 - 5*30 - 161 = 1239
    expect(calcBMR({ sex: "female", weightKg: 55, heightCm: 160, age: 30 })).toBeCloseTo(1239, 2);
  });

  it("同条件なら女性の方が低く出る", () => {
    const male = calcBMR({ sex: "male", weightKg: 60, heightCm: 165, age: 25 });
    const female = calcBMR({ sex: "female", weightKg: 60, heightCm: 165, age: 25 });
    expect(female).toBeLessThan(male);
  });

  it("活動係数が段階的に上がる", () => {
    const levels: ActivityLevel[] = [1, 2, 3, 4, 5];
    for (let i = 1; i < levels.length; i++) {
      expect(ACTIVITY_FACTORS[levels[i]]).toBeGreaterThan(ACTIVITY_FACTORS[levels[i - 1]]);
    }
    expect(calcTDEE(1600, 3)).toBeCloseTo(1600 * 1.55, 5);
  });
});

describe("カロリー目標", () => {
  it("増量では維持より多く、減量では少なくなる", () => {
    const forGoal = (goal: Goal) =>
      calcCalorieTarget({ profile: { ...profile, goal }, weightKg: 70, today: "2026-08-05" }).kcal;
    expect(forGoal("bulk")).toBeGreaterThan(forGoal("maintain"));
    expect(forGoal("cut")).toBeLessThan(forGoal("maintain"));
  });

  it("PFCのカロリー合計が目標カロリーと一致する", () => {
    const t = calcCalorieTarget({ profile, weightKg: 70, today: "2026-08-05" });
    // 各値は整数に丸めているので数kcalの誤差は許容する
    expect(Math.abs(macrosToKcal(t) - t.kcal)).toBeLessThanOrEqual(6);
  });

  it("減量でも基礎代謝の1.1倍を下回らない", () => {
    // 活動量が最低かつ減量目標という、最も低くなる条件
    const t = calcCalorieTarget({
      profile: { ...profile, goal: "cut", activityLevel: 1 },
      weightKg: 50,
      today: "2026-08-05",
    });
    expect(t.kcal).toBeGreaterThanOrEqual(Math.round(t.bmr * 1.1) - 1);
  });

  it("トレーニング日は消費分が上乗せされる", () => {
    const rest = calcCalorieTarget({ profile, weightKg: 70, today: "2026-08-05" });
    const train = calcCalorieTarget({
      profile, weightKg: 70, workoutKcal: 300, today: "2026-08-05",
    });
    expect(train.kcal - rest.kcal).toBe(300);
  });

  it("減量では体重あたりのタンパク質が最も多い", () => {
    const p = (goal: Goal) =>
      calcCalorieTarget({ profile: { ...profile, goal }, weightKg: 70, today: "2026-08-05" }).protein;
    expect(p("cut")).toBeGreaterThan(p("bulk"));
    expect(p("bulk")).toBeGreaterThan(p("maintain"));
  });
});

describe("食材・レシピのデータ整合性", () => {
  it("レシピが参照する食材IDがすべて存在する", () => {
    expect(findBrokenIngredientRefs()).toEqual([]);
  });

  it("食材IDが重複していない", () => {
    expect(new Set(FOODS.map((f) => f.id)).size).toBe(FOODS.length);
  });

  it("レシピIDが重複していない", () => {
    expect(new Set(RECIPES.map((r) => r.id)).size).toBe(RECIPES.length);
  });

  it("食材のPFCから計算したカロリーが表示値と大きくずれない", () => {
    // みりん・料理酒はアルコール(7kcal/g)がカロリーの大半を占め、PFCには
    // 現れない。4/9/4 の検算が原理的に成り立たないので対象外にする。
    const alcoholic = new Set(["mirin", "cooking_sake"]);

    // 4/9/4 の単純計算は食物繊維を実際より高く見積もる（繊維は約2kcal/g以下）。
    // 野菜・果物は炭水化物の大半が繊維なので、そこだけ許容幅を広く取る。
    for (const food of FOODS) {
      if (alcoholic.has(food.id)) continue;
      const computed =
        food.proteinPer100g * 4 + food.fatPer100g * 9 + food.carbPer100g * 4;
      const fiberRich = food.category === "vegetable" || food.category === "fruit";
      const tolerance = Math.max(food.kcalPer100g * 0.2, fiberRich ? 25 : 15);

      const diff = Math.abs(computed - food.kcalPer100g);
      expect(diff, `${food.name}: 表示${food.kcalPer100g} / 計算${computed.toFixed(0)}`)
        .toBeLessThanOrEqual(tolerance);
    }
  });

  it("全スロットに十分な数のレシピがある", () => {
    for (const slot of ["breakfast", "lunch", "dinner", "snack"] as const) {
      const count = RECIPES.filter((r) => r.slots.includes(slot)).length;
      expect(count, slot).toBeGreaterThanOrEqual(5);
    }
  });

  it("グラム数から栄養価を按分できる", () => {
    const chicken = FOOD_BY_ID.get("chicken_breast")!;
    const m = macrosForGrams(chicken, 200);
    expect(m.kcal).toBeCloseTo(chicken.kcalPer100g * 2, 5);
    expect(m.protein).toBeCloseTo(chicken.proteinPer100g * 2, 5);
  });
});

describe("在庫カバー率", () => {
  const item = (foodId: string, grams: number): PantryItem => ({
    id: foodId,
    foodId,
    rawName: foodId,
    grams,
    addedAt: "2026-08-05T00:00:00.000Z",
    source: "manual",
  });

  it("在庫が無ければ0になる", () => {
    const recipe = RECIPES.find((r) => r.id === "chicken_broccoli")!;
    expect(pantryCoverage(recipe, buildStock([]))).toBe(0);
  });

  it("材料が揃っていれば1になる", () => {
    const recipe = RECIPES.find((r) => r.id === "chicken_broccoli")!;
    const stock = buildStock([item("chicken_breast", 500), item("broccoli", 500)]);
    // にんにくは調味料ではなく野菜なので必要
    expect(pantryCoverage(recipe, stock)).toBeLessThan(1);
    const full = buildStock([
      item("chicken_breast", 500), item("broccoli", 500), item("garlic", 50),
    ]);
    expect(pantryCoverage(recipe, full)).toBe(1);
  });

  it("調味料は在庫が無くてもカバー率を下げない", () => {
    const recipe = RECIPES.find((r) => r.id === "boiled_eggs")!; // 卵 + 塩
    const stock = buildStock([item("egg", 200)]);
    expect(pantryCoverage(recipe, stock)).toBe(1);
  });
});

describe("人前の決定", () => {
  it("予算に合わせて0.5刻みで決まる", () => {
    expect(fitServings(500, 500)).toBe(1);
    expect(fitServings(500, 750)).toBe(1.5);
    expect(fitServings(500, 600)).toBe(1);
  });

  it("0.5〜3.0の範囲に収まる", () => {
    expect(fitServings(500, 10)).toBe(0.5);
    expect(fitServings(100, 10000)).toBe(3);
  });
});

describe("NG食材の除外", () => {
  it("指定した食材IDを含むレシピは除外される", () => {
    const natto = RECIPES.find((r) => r.id === "natto_gohan")!;
    expect(isAllowed(natto, [])).toBe(true);
    expect(isAllowed(natto, ["natto"])).toBe(false);
  });

  it("食材名でも除外できる", () => {
    const natto = RECIPES.find((r) => r.id === "natto_gohan")!;
    expect(isAllowed(natto, ["納豆"])).toBe(false);
  });

  it("献立全体からもNG食材が消える", () => {
    const target = calcCalorieTarget({ profile, weightKg: 70, today: "2026-08-05" });
    const plan = generateMealPlan({
      date: "2026-08-05",
      target,
      pantry: [],
      goal: "bulk",
      dietaryNg: ["egg"],
    });
    for (const meal of plan.meals) {
      const recipe = RECIPES.find((r) => r.id === meal.recipeId)!;
      expect(recipe.ingredients.some((i) => i.foodId === "egg")).toBe(false);
    }
  });
});

describe("献立生成", () => {
  const targetFor = (over: Partial<UserProfile>, weightKg: number) =>
    calcCalorieTarget({ profile: { ...profile, ...over }, weightKg, today: "2026-08-05" });

  it("同じ入力からは同じ献立が出る", () => {
    const target = targetFor({}, 70);
    const args = { date: "2026-08-05", target, pantry: [], goal: "bulk" as Goal, dietaryNg: [] };
    expect(generateMealPlan(args)).toEqual(generateMealPlan(args));
  });

  it("日が変われば献立も変わる", () => {
    const target = targetFor({}, 70);
    const a = generateMealPlan({ date: "2026-08-05", target, pantry: [], goal: "bulk", dietaryNg: [] });
    const b = generateMealPlan({ date: "2026-08-06", target, pantry: [], goal: "bulk", dietaryNg: [] });
    expect(a.meals.map((m) => m.recipeId)).not.toEqual(b.meals.map((m) => m.recipeId));
  });

  it("同じレシピが1日に重複しない", () => {
    const target = targetFor({}, 70);
    const plan = generateMealPlan({
      date: "2026-08-05", target, pantry: [], goal: "bulk", dietaryNg: [],
    });
    const ids = plan.meals.map((m) => m.recipeId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("さまざまな条件で目標カロリーの±10%に収まる", () => {
    const cases: { goal: Goal; sex: "male" | "female"; activity: ActivityLevel; weight: number }[] = [
      { goal: "bulk", sex: "male", activity: 3, weight: 70 },
      { goal: "cut", sex: "male", activity: 2, weight: 85 },
      { goal: "maintain", sex: "male", activity: 4, weight: 60 },
      { goal: "cut", sex: "female", activity: 1, weight: 52 },
      { goal: "bulk", sex: "female", activity: 3, weight: 58 },
      { goal: "maintain", sex: "female", activity: 5, weight: 65 },
    ];

    for (const c of cases) {
      for (const date of ["2026-08-05", "2026-08-06", "2026-08-07", "2026-08-08"]) {
        const target = targetFor({ goal: c.goal, sex: c.sex, activityLevel: c.activity }, c.weight);
        const plan = generateMealPlan({
          date, target, pantry: [], goal: c.goal, dietaryNg: [],
        });
        const ratio = plan.total.kcal / target.kcal;
        expect(ratio, `${c.sex}/${c.goal}/${c.weight}kg/${date} → ${plan.total.kcal} vs ${target.kcal}`)
          .toBeGreaterThan(0.9);
        expect(ratio, `${c.sex}/${c.goal}/${c.weight}kg/${date} → ${plan.total.kcal} vs ${target.kcal}`)
          .toBeLessThan(1.1);
      }
    }
  });

  it("在庫がある食材を使うレシピが優先される", () => {
    const target = targetFor({}, 70);
    const pantry: PantryItem[] = [
      {
        id: "1", foodId: "tofu_momen", rawName: "木綿豆腐", grams: 900,
        addedAt: "2026-08-05T00:00:00.000Z", source: "manual",
      },
      {
        id: "2", foodId: "pork_mince", rawName: "豚ひき肉", grams: 400,
        addedAt: "2026-08-05T00:00:00.000Z", source: "manual",
      },
      {
        id: "3", foodId: "green_onion", rawName: "長ねぎ", grams: 200,
        addedAt: "2026-08-05T00:00:00.000Z", source: "manual",
      },
    ];

    const withStock = generateMealPlan({
      date: "2026-08-05", target, pantry, goal: "bulk", dietaryNg: [],
    });
    const withoutStock = generateMealPlan({
      date: "2026-08-05", target, pantry: [], goal: "bulk", dietaryNg: [],
    });

    // 在庫を活かせる麻婆豆腐が選ばれ、在庫なしの献立とは変わるはず
    expect(withStock.meals.map((m) => m.recipeId)).not.toEqual(
      withoutStock.meals.map((m) => m.recipeId),
    );
    expect(withStock.meals.some((m) => m.recipeId === "mapo_tofu")).toBe(true);
  });

  it("不足食材が買い物リストに出る", () => {
    const target = targetFor({}, 70);
    const plan = generateMealPlan({
      date: "2026-08-05", target, pantry: [], goal: "bulk", dietaryNg: [],
    });
    expect(plan.shoppingList.length).toBeGreaterThan(0);
    // 調味料は常備前提なので出さない
    for (const item of plan.shoppingList) {
      expect(FOOD_BY_ID.get(item.foodId)?.category).not.toBe("seasoning");
    }
  });

  it("在庫が十分にあれば買い物リストが減る", () => {
    const target = targetFor({}, 70);
    const base = generateMealPlan({
      date: "2026-08-05", target, pantry: [], goal: "bulk", dietaryNg: [],
    });
    const pantry: PantryItem[] = base.shoppingList.map((s, i) => ({
      id: String(i), foodId: s.foodId, rawName: s.name, grams: s.grams * 2,
      addedAt: "2026-08-05T00:00:00.000Z", source: "manual" as const,
    }));
    const stocked = generateMealPlan({
      date: "2026-08-05", target, pantry, goal: "bulk", dietaryNg: [],
    });
    expect(stocked.shoppingList.length).toBeLessThan(base.shoppingList.length);
  });

  it("レシピの栄養価が材料から計算されている", () => {
    const recipe = RECIPES.find((r) => r.id === "boiled_eggs")!; // 卵100g + 塩1g
    const egg = FOOD_BY_ID.get("egg")!;
    expect(cachedRecipeMacros(recipe).kcal).toBeCloseTo(egg.kcalPer100g, 1);
  });
});
