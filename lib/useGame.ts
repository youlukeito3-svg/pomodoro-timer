"use client";

import { useMemo } from "react";
import { useAppData, useHydrated } from "@/lib/store/hooks";
import { selectGameState, type GameState } from "@/lib/selectors";
import type { AppData } from "@/lib/types";

/**
 * 画面が必要とする派生状態をまとめて返す。
 *
 * selectGameState は献立生成まで含めて重いので、AppData が変わったときだけ
 * 再計算する。
 */
export function useGame(): { data: AppData; hydrated: boolean; state: GameState } {
  const data = useAppData();
  const hydrated = useHydrated();
  const state = useMemo(() => selectGameState(data), [data]);
  return { data, hydrated, state };
}
