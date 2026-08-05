"use client";

import { useMemo, useState } from "react";
import FoodSelect from "@/components/FoodSelect";
import ReceiptScanner from "@/components/ReceiptScanner";
import {
  Button,
  Card,
  Empty,
  Field,
  Loading,
  Page,
  PageHeader,
  SectionTitle,
} from "@/components/ui";
import { addPantryItems, removePantryItem, updatePantryItem } from "@/lib/actions";
import { addDays, daysBetween, todayStr } from "@/lib/date";
import { FOOD_BY_ID } from "@/lib/nutrition/foods";
import { useAppData, useHydrated } from "@/lib/store/hooks";
import { FOOD_CATEGORY_LABEL, type FoodCategory, type PantryItem } from "@/lib/types";

export default function PantryPage() {
  const data = useAppData();
  const hydrated = useHydrated();
  const today = todayStr();

  const grouped = useMemo(() => {
    const map = new Map<FoodCategory | "unknown", PantryItem[]>();
    for (const item of data.pantry) {
      const category = item.foodId ? FOOD_BY_ID.get(item.foodId)?.category : undefined;
      const key = category ?? "unknown";
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
    }
    // 期限が近いものを上に
    for (const list of map.values()) {
      list.sort((a, b) => (a.expiresAt ?? "9999").localeCompare(b.expiresAt ?? "9999"));
    }
    return [...map.entries()];
  }, [data.pantry]);

  if (!hydrated) return <Loading />;

  return (
    <Page>
      <PageHeader
        title="家にある食材"
        subtitle={data.pantry.length > 0 ? `${data.pantry.length}品` : undefined}
      />

      <ReceiptScanner />

      <div className="mt-4">
        <ManualAdd />
      </div>

      <div className="mt-4">
        {data.pantry.length === 0 ? (
          <Empty
            title="まだ在庫がありません"
            hint="レシートを撮るか、上の手入力から追加してください。登録すると献立が在庫を優先して組まれます。"
          />
        ) : (
          <div className="space-y-4">
            {grouped.map(([category, items]) => (
              <Card key={category}>
                <SectionTitle>
                  {category === "unknown" ? "未分類" : FOOD_CATEGORY_LABEL[category]}
                </SectionTitle>
                <ul className="space-y-2">
                  {items.map((item) => (
                    <PantryRow key={item.id} item={item} today={today} />
                  ))}
                </ul>
              </Card>
            ))}
          </div>
        )}
      </div>
    </Page>
  );
}

// ---------------------------------------------------------------------------

function PantryRow({ item, today }: { item: PantryItem; today: string }) {
  const [editing, setEditing] = useState(false);
  const food = item.foodId ? FOOD_BY_ID.get(item.foodId) : undefined;
  const daysLeft = item.expiresAt ? daysBetween(today, item.expiresAt) : null;

  const expiryLabel =
    daysLeft === null
      ? null
      : daysLeft < 0
        ? "期限切れ"
        : daysLeft === 0
          ? "今日まで"
          : `あと${daysLeft}日`;

  const expiryColor =
    daysLeft === null
      ? "text-fg-dim"
      : daysLeft < 0
        ? "text-danger"
        : daysLeft <= 2
          ? "text-warn"
          : "text-fg-dim";

  if (editing) {
    return (
      <li className="rounded-lg border border-border p-2.5">
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <FoodSelect
              value={item.foodId}
              onChange={(foodId) => updatePantryItem(item.id, { foodId })}
            />
          </div>
          <label className="flex w-24 shrink-0 items-center gap-1">
            <input
              type="number"
              inputMode="numeric"
              value={item.grams}
              onChange={(e) => updatePantryItem(item.id, { grams: Number(e.target.value) || 0 })}
              className="numeric"
              aria-label="分量"
            />
            <span className="text-xs text-fg-dim">g</span>
          </label>
        </div>
        <div className="mt-2 flex justify-end gap-2">
          <Button variant="danger" onClick={() => removePantryItem(item.id)}>
            削除
          </Button>
          <Button variant="ghost" onClick={() => setEditing(false)}>
            閉じる
          </Button>
        </div>
      </li>
    );
  }

  return (
    <li>
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="flex w-full items-center justify-between gap-3 rounded-lg px-1 py-1 text-left hover:bg-surface-2"
      >
        <span className="min-w-0">
          <span className={`block truncate text-sm ${food ? "" : "text-warn"}`}>
            {food?.name ?? `${item.rawName}（未分類）`}
          </span>
          {expiryLabel && <span className={`text-[11px] ${expiryColor}`}>{expiryLabel}</span>}
        </span>
        <span className="numeric shrink-0 text-sm text-fg-muted">
          {Math.round(item.grams)} g
        </span>
      </button>
    </li>
  );
}

// ---------------------------------------------------------------------------

function ManualAdd() {
  const [foodId, setFoodId] = useState<string | null>(null);
  const [grams, setGrams] = useState("200");
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);

  const food = foodId ? FOOD_BY_ID.get(foodId) : undefined;

  const add = () => {
    const amount = Number(grams);
    if (!foodId || !food || !Number.isFinite(amount) || amount <= 0) return;

    addPantryItems([
      {
        foodId,
        rawName: food.name,
        grams: amount,
        source: "manual",
        expiresAt: food.shelfLifeDays ? addDays(todayStr(), food.shelfLifeDays) : undefined,
      },
    ]);
    setSaved(true);
    setFoodId(null);
    setGrams("200");
    setTimeout(() => setSaved(false), 1800);
  };

  if (!open) {
    return (
      <Button variant="ghost" className="w-full" onClick={() => setOpen(true)}>
        手入力で食材を追加
      </Button>
    );
  }

  return (
    <Card>
      <SectionTitle>手入力で追加</SectionTitle>
      <div className="space-y-3">
        <Field label="食材">
          <FoodSelect value={foodId} onChange={setFoodId} />
        </Field>
        <Field
          label="分量 (g)"
          hint={food?.gramsPerUnit ? `${food.unitLabel}1つ ≒ ${food.gramsPerUnit}g` : undefined}
        >
          <input
            type="number"
            inputMode="numeric"
            value={grams}
            onChange={(e) => setGrams(e.target.value)}
            className="numeric"
          />
        </Field>

        {food?.gramsPerUnit && (
          <div className="flex gap-2">
            {[1, 2, 3].map((count) => (
              <button
                key={count}
                type="button"
                onClick={() => setGrams(String(food.gramsPerUnit! * count))}
                className="rounded-full border border-border bg-surface-2 px-3 py-1 text-xs text-fg-muted"
              >
                {count}
                {food.unitLabel}
              </button>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <Button onClick={add} disabled={!foodId} className="flex-1">
            追加
          </Button>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            閉じる
          </Button>
        </div>
        {saved && <p className="text-sm text-ok">追加しました</p>}
      </div>
    </Card>
  );
}
