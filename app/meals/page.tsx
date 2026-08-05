"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  Button,
  Card,
  Empty,
  Loading,
  Page,
  PageHeader,
  SectionTitle,
} from "@/components/ui";
import AiCoach from "@/components/AiCoach";
import { replaceMealPlan, saveMealPlan, toggleMealEaten } from "@/lib/actions";
import { formatJa, todayStr } from "@/lib/date";
import { adviceKindLabel, buildAdvice } from "@/lib/nutrition/advice";
import { FOOD_BY_ID } from "@/lib/nutrition/foods";
import { buildShoppingList, buildStock, generateMealPlan } from "@/lib/nutrition/plan";
import { RECIPE_BY_ID, cachedRecipeMacros } from "@/lib/nutrition/recipes";
import { MEAL_SLOT_LABEL, type MealSlot, type PlannedMeal } from "@/lib/types";
import { useGame } from "@/lib/useGame";

export default function MealsPage() {
  const { data, hydrated, state } = useGame();
  const today = todayStr();
  const [variant, setVariant] = useState(0);

  const stored = data.mealPlans.find((p) => p.date === today);

  // その日の献立は一度決めたら固定する。開くたびに変わると
  // 「食べた」の記録と対応が取れなくなるため。
  useEffect(() => {
    if (!stored && state.meals && state.target) {
      saveMealPlan(today, state.meals.meals, state.target);
    }
  }, [stored, state.meals, state.target, today]);

  const regenerate = () => {
    if (!data.profile || !state.target) return;
    const next = variant + 1;
    setVariant(next);
    const fresh = generateMealPlan({
      date: today,
      target: state.target,
      pantry: data.pantry,
      goal: data.profile.goal,
      dietaryNg: data.profile.dietaryNg,
      seedSuffix: String(next),
    });
    replaceMealPlan(today, fresh.meals, state.target);
  };

  // 保存済みがあればそれを、無ければ生成結果を使う。参照が毎回変わると
  // 下の useMemo が毎描画で走ってしまうので、ここでも参照を固定する。
  const meals = useMemo(
    () => stored?.meals ?? state.meals?.meals ?? [],
    [stored, state.meals],
  );

  const shoppingList = useMemo(
    () => buildShoppingList(meals, buildStock(data.pantry)),
    [meals, data.pantry],
  );

  const advice = useMemo(
    () => (state.ready ? buildAdvice(data, state, today) : []),
    [data, state, today],
  );

  if (!hydrated) return <Loading />;

  if (!state.ready || !state.target) {
    return (
      <Page>
        <PageHeader title="食事" />
        <Empty
          title="先に設定を済ませてください"
          hint="身長・体重・目標から必要なカロリーを計算します。"
          action={
            <Link href="/profile">
              <Button>設定へ</Button>
            </Link>
          }
        />
      </Page>
    );
  }

  const { target, consumed } = state;
  const eaten = new Set(stored?.eaten ?? []);

  return (
    <Page>
      <PageHeader title="今日の食事" subtitle={formatJa(today)} />

      <Card>
        <SectionTitle>目標</SectionTitle>
        <div className="flex items-baseline justify-between">
          <span className="numeric text-3xl font-bold text-gold">
            {target.kcal.toLocaleString("ja-JP")}
          </span>
          <span className="text-sm text-fg-muted">kcal / 日</span>
        </div>
        <div className="mt-2">
          <Bar ratio={consumed.kcal / target.kcal} color="var(--color-gold)" />
        </div>
        <p className="mt-1 text-xs text-fg-dim">
          摂取 {consumed.kcal.toLocaleString("ja-JP")} kcal・残り{" "}
          {(target.kcal - consumed.kcal).toLocaleString("ja-JP")} kcal
        </p>

        <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-border pt-3 text-sm">
          <MacroCell label="P タンパク質" value={target.protein} current={consumed.protein} color="var(--color-str)" />
          <MacroCell label="F 脂質" value={target.fat} current={consumed.fat} color="var(--color-end)" />
          <MacroCell label="C 炭水化物" value={target.carb} current={consumed.carb} color="var(--color-agi)" />
        </dl>

        <p className="mt-3 text-[11px] text-fg-dim">
          基礎代謝 {target.bmr} kcal・活動込み {target.tdee} kcal
          {target.workoutKcal > 0 && `・運動 +${target.workoutKcal} kcal`}
        </p>
      </Card>

      <div className="mt-4">
        <SectionTitle
          right={
            <button onClick={regenerate} className="text-xs text-xp hover:underline">
              別の献立にする
            </button>
          }
        >
          献立
        </SectionTitle>

        <div className="space-y-3">
          {meals.map((meal) => (
            <MealCard
              key={meal.slot}
              meal={meal}
              eaten={eaten.has(meal.slot)}
              onToggle={() => toggleMealEaten(today, meal.slot)}
            />
          ))}
        </div>
      </div>

      {shoppingList.length > 0 && (
        <div className="mt-4">
          <Card>
            <SectionTitle right={<span className="text-xs text-fg-dim">{shoppingList.length}品</span>}>
              買い物リスト
            </SectionTitle>
            <p className="mb-2 text-xs text-fg-dim">
              在庫から足りないぶんです（調味料は常備前提として省いています）。
            </p>
            <ul className="space-y-1 text-sm">
              {shoppingList.map((item) => (
                <li key={item.foodId} className="flex justify-between">
                  <span>{item.name}</span>
                  <span className="numeric text-fg-muted">{item.grams} g</span>
                </li>
              ))}
            </ul>
            <Link href="/pantry">
              <Button variant="ghost" className="mt-3 w-full">
                在庫を更新する
              </Button>
            </Link>
          </Card>
        </div>
      )}

      {advice.length > 0 && (
        <div className="mt-4">
          <Card>
            <SectionTitle>今日のアドバイス</SectionTitle>
            <ul className="space-y-2">
              {advice.slice(0, 4).map((item, i) => (
                <li key={i} className="flex gap-2 text-sm">
                  <span className="mt-0.5 shrink-0 rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-fg-muted">
                    {adviceKindLabel(item.kind)}
                  </span>
                  <span className="text-fg-muted">{item.text}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      <div className="mt-4">
        <AiCoach />
      </div>
    </Page>
  );
}

// ---------------------------------------------------------------------------

function MacroCell({
  label,
  value,
  current,
  color,
}: {
  label: string;
  value: number;
  current: number;
  color: string;
}) {
  return (
    <div>
      <dt className="text-xs text-fg-dim">{label}</dt>
      <dd className="numeric font-bold">
        {Math.round(current)}
        <span className="text-xs font-normal text-fg-muted"> / {Math.round(value)}g</span>
      </dd>
      <div className="mt-1">
        <Bar ratio={value > 0 ? current / value : 0} color={color} height={4} />
      </div>
    </div>
  );
}

function MealCard({
  meal,
  eaten,
  onToggle,
}: {
  meal: PlannedMeal;
  eaten: boolean;
  onToggle: () => void;
}) {
  const [open, setOpen] = useState(false);
  const recipe = RECIPE_BY_ID.get(meal.recipeId);
  if (!recipe) return null;

  const macros = cachedRecipeMacros(recipe);
  const scale = meal.servings;

  return (
    <Card className={eaten ? "border-ok/40" : ""}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs text-fg-dim">
            {MEAL_SLOT_LABEL[meal.slot as MealSlot]}
            {scale !== 1 && ` ・ ${scale}人前`}
          </div>
          <h3 className="mt-0.5 font-bold">{recipe.name}</h3>
          <p className="numeric mt-1 text-xs text-fg-muted">
            {Math.round(macros.kcal * scale)} kcal ・ P{Math.round(macros.protein * scale)} F
            {Math.round(macros.fat * scale)} C{Math.round(macros.carb * scale)}
            <span className="ml-2 text-fg-dim">約{recipe.minutes}分</span>
          </p>
        </div>

        <button
          type="button"
          onClick={onToggle}
          aria-pressed={eaten}
          className={`shrink-0 rounded-lg border px-3 py-2 text-xs transition ${
            eaten ? "border-ok bg-ok/15 text-ok" : "border-border bg-surface-2 text-fg-muted"
          }`}
        >
          {eaten ? "食べた" : "食べる"}
        </button>
      </div>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mt-2 text-xs text-xp hover:underline"
      >
        {open ? "材料と作り方を閉じる" : "材料と作り方を見る"}
      </button>

      {open && (
        <div className="mt-3 space-y-3 border-t border-border pt-3">
          <div>
            <h4 className="mb-1 text-xs font-semibold text-fg-muted">材料</h4>
            <ul className="space-y-0.5 text-sm">
              {recipe.ingredients.map((ing) => {
                const food = FOOD_BY_ID.get(ing.foodId);
                if (!food) return null;
                return (
                  <li key={ing.foodId} className="flex justify-between">
                    <span>{food.name}</span>
                    <span className="numeric text-fg-muted">{Math.round(ing.grams * scale)} g</span>
                  </li>
                );
              })}
            </ul>
          </div>
          <div>
            <h4 className="mb-1 text-xs font-semibold text-fg-muted">作り方</h4>
            <ol className="list-inside list-decimal space-y-1 text-sm text-fg-muted">
              {recipe.steps.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </Card>
  );
}
