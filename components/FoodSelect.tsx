"use client";

import { useMemo } from "react";
import { FOODS } from "@/lib/nutrition/foods";
import { FOOD_CATEGORY_LABEL, type FoodCategory } from "@/lib/types";

/** 食材を選ぶプルダウン。カテゴリごとにまとめて探しやすくする。 */
export default function FoodSelect({
  value,
  onChange,
  allowEmpty = true,
  id,
}: {
  value: string | null;
  onChange: (foodId: string | null) => void;
  allowEmpty?: boolean;
  id?: string;
}) {
  const grouped = useMemo(() => {
    const map = new Map<FoodCategory, typeof FOODS>();
    for (const food of FOODS) {
      const list = map.get(food.category) ?? [];
      list.push(food);
      map.set(food.category, list);
    }
    return [...map.entries()];
  }, []);

  return (
    <select
      id={id}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      aria-label="食材"
    >
      {allowEmpty && <option value="">（未選択）</option>}
      {grouped.map(([category, foods]) => (
        <optgroup key={category} label={FOOD_CATEGORY_LABEL[category]}>
          {foods.map((food) => (
            <option key={food.id} value={food.id}>
              {food.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
