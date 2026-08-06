"use client";

import { useId, useMemo, useRef, useState } from "react";
import { FOOD_BY_ID } from "@/lib/nutrition/foods";
import { searchFoods } from "@/lib/nutrition/search";
import { FOOD_CATEGORY_LABEL } from "@/lib/types";

/**
 * 食材を入力でしぼり込んで選ぶ。
 *
 * 食材が90品あるためプルダウンでは探せない。打った文字で候補を出す。
 * 照合は lib/nutrition/search.ts（レシート照合と同じ正規化）に任せているので、
 * 「とりむね」「トリムネ」「鶏むね」のどれでも「鶏むね肉」に当たる。
 */
export default function FoodSelect({
  value,
  onChange,
  placeholder = "食材名を入力",
  autoFocus = false,
}: {
  value: string | null;
  onChange: (foodId: string | null) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const selected = value ? FOOD_BY_ID.get(value) : undefined;
  const hits = useMemo(() => searchFoods(query, 8), [query]);

  // 開いている間は打った文字を、閉じている間は選択中の食材名を見せる
  const display = open ? query : (selected?.name ?? "");

  const commit = (foodId: string) => {
    onChange(foodId);
    setOpen(false);
    setQuery("");
    inputRef.current?.blur();
  };

  const cancel = () => {
    setOpen(false);
    setQuery("");
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      cancel();
      return;
    }
    if (!open) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, hits.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      const hit = hits[active];
      if (hit) {
        e.preventDefault();
        commit(hit.food.id);
      }
    }
  };

  return (
    <div className="relative">
      <div className="flex gap-2">
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && hits[active] ? `${listId}-${active}` : undefined}
          autoComplete="off"
          autoFocus={autoFocus}
          placeholder={placeholder}
          value={display}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => {
            setQuery("");
            setActive(0);
            setOpen(true);
          }}
          // 候補の押下は onMouseDown で拾うので、ここで閉じても取りこぼさない
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
        />
        {selected && !open && (
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-label="選択を解除"
            className="shrink-0 rounded-lg border border-border px-3 text-fg-dim hover:text-danger"
          >
            ×
          </button>
        )}
      </div>

      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute inset-x-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-lg border border-border bg-surface-2 shadow-xl"
        >
          {hits.length === 0 ? (
            <li className="px-3 py-3 text-sm text-fg-dim">
              「{query}」に合う食材が見つかりません
            </li>
          ) : (
            hits.map((hit, i) => (
              <li
                key={hit.food.id}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                // クリックで input の blur が先に走るのを防ぐ
                onMouseDown={(e) => {
                  e.preventDefault();
                  commit(hit.food.id);
                }}
                onMouseEnter={() => setActive(i)}
                className={`flex cursor-pointer items-baseline justify-between gap-3 px-3 py-2.5 text-sm ${
                  i === active ? "bg-gold/15 text-gold" : "text-fg"
                }`}
              >
                <span>{hit.food.name}</span>
                <span className="shrink-0 text-[11px] text-fg-dim">
                  {FOOD_CATEGORY_LABEL[hit.food.category]}・
                  <span className="numeric">{hit.food.kcalPer100g}</span>kcal/100g
                </span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
