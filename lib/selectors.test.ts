import { describe, expect, it } from "vitest";
import { AppData, EMPTY_APP_DATA, type MealPlan } from "@/lib/types";
import { FOOD_BY_ID } from "@/lib/nutrition/foods";
import { consumedMacros } from "./selectors";

const DATE = "2026-08-05";
const TARGET = { kcal: 2500, protein: 150, fat: 70, carb: 300 };

const withMealPlan = (plan: Partial<MealPlan>): AppData => ({
  ...EMPTY_APP_DATA,
  mealPlans: [{ date: DATE, target: TARGET, meals: [], eaten: [], extras: [], ...plan }],
});

describe("摂取量の集計", () => {
  it("その日の記録が無ければ0", () => {
    expect(consumedMacros(EMPTY_APP_DATA, DATE)).toEqual({
      kcal: 0, protein: 0, fat: 0, carb: 0,
    });
  });

  it("「食べた」印を付けた献立だけが加算される", () => {
    const data = withMealPlan({
      meals: [
        { slot: "breakfast", recipeId: "boiled_eggs", servings: 1 },
        { slot: "lunch", recipeId: "chicken_broccoli", servings: 1 },
      ],
      eaten: ["breakfast"],
    });
    const egg = FOOD_BY_ID.get("egg")!;
    // ゆで卵は卵100g + 塩1g なので、ほぼ卵100g分
    expect(consumedMacros(data, DATE).kcal).toBe(Math.round(egg.kcalPer100g));
  });

  it("献立以外に食べたものが加算される", () => {
    const data = withMealPlan({
      extras: [{ id: "x1", foodId: "banana", grams: 90, slot: "snack" }],
    });
    const banana = FOOD_BY_ID.get("banana")!;
    const m = consumedMacros(data, DATE);
    expect(m.kcal).toBe(Math.round((banana.kcalPer100g * 90) / 100));
    expect(m.protein).toBe(Math.round((banana.proteinPer100g * 90) / 100));
  });

  it("献立を食べていない日でも、献立以外の記録だけで積み上がる", () => {
    // 提案された献立を無視して外食した日でも摂取量が実態に追随すること
    const data = withMealPlan({
      meals: [{ slot: "lunch", recipeId: "chicken_broccoli", servings: 1 }],
      eaten: [],
      extras: [
        { id: "x1", foodId: "rice_cooked", grams: 200, slot: "lunch" },
        { id: "x2", foodId: "pork_belly", grams: 100, slot: "lunch" },
      ],
    });
    const rice = FOOD_BY_ID.get("rice_cooked")!;
    const pork = FOOD_BY_ID.get("pork_belly")!;
    const expected = Math.round((rice.kcalPer100g * 200) / 100 + pork.kcalPer100g);
    expect(consumedMacros(data, DATE).kcal).toBe(expected);
  });

  it("献立と献立以外の両方が合算される", () => {
    const base = withMealPlan({
      meals: [{ slot: "breakfast", recipeId: "boiled_eggs", servings: 1 }],
      eaten: ["breakfast"],
    });
    const withExtra = withMealPlan({
      meals: [{ slot: "breakfast", recipeId: "boiled_eggs", servings: 1 }],
      eaten: ["breakfast"],
      extras: [{ id: "x1", foodId: "banana", grams: 90, slot: "snack" }],
    });
    const banana = FOOD_BY_ID.get("banana")!;
    expect(consumedMacros(withExtra, DATE).kcal - consumedMacros(base, DATE).kcal)
      .toBe(Math.round((banana.kcalPer100g * 90) / 100));
  });

  it("存在しない食材IDが混ざっても壊れない", () => {
    const data = withMealPlan({
      extras: [{ id: "x1", foodId: "does_not_exist", grams: 100, slot: "snack" }],
    });
    expect(consumedMacros(data, DATE).kcal).toBe(0);
  });
});

describe("既存データとの互換性", () => {
  it("extras を持たない保存データがそのまま読める", () => {
    // 旧バージョンで保存された形。default があるので移行処理なしで通る。
    const legacy = {
      profile: null,
      weights: [],
      sessions: [],
      pantry: [],
      mealPlans: [{ date: DATE, target: TARGET, meals: [], eaten: ["breakfast"] }],
      xpEvents: [],
      rpg: { lastSeenLevel: 1, unlockedTitles: [] },
    };
    const parsed = AppData.safeParse(legacy);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.mealPlans[0].extras).toEqual([]);
  });

  it("excludedMuscles を持たないプロフィールがそのまま読める", () => {
    const legacy = {
      ...EMPTY_APP_DATA,
      profile: {
        name: "旧ユーザー",
        sex: "male",
        birthDate: "1995-01-01",
        heightCm: 172,
        goal: "bulk",
        activityLevel: 3,
        equipment: ["bodyweight"],
        daysPerWeek: 3,
        dietaryNg: [],
        startedAt: "2026-01-01",
      },
    };
    const parsed = AppData.safeParse(legacy);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.profile?.excludedMuscles).toEqual([]);
  });
});
