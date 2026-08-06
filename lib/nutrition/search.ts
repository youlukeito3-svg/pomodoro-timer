import type { FoodDef } from "@/lib/types";
import { similarity, toComparable } from "@/lib/pantry/normalize";
import { FOODS } from "./foods";

/**
 * 食材の絞り込み検索。
 *
 * 食材が90品あるので、プルダウンから目で探すのは現実的でない。
 * レシート照合で使っている正規化（半角カナ→全角→ひらがな、記号除去）を
 * そのまま流用するので、「とりむね」「トリムネ」「鶏むね」のどれを打っても
 * 「鶏むね肉」に当たる。専用の辞書を別に用意する必要がない。
 */

/** 検索対象の正規形をあらかじめ作っておく（入力のたびに作り直さない） */
const INDEX: { food: FoodDef; keys: string[] }[] = FOODS.map((food) => ({
  food,
  keys: [food.name, ...food.aliases].map(toComparable).filter((k) => k.length > 0),
}));

/** これ未満の類似度は無関係とみなす */
const FUZZY_FLOOR = 0.45;

export interface FoodSearchHit {
  food: FoodDef;
  /** 高いほど一致が強い。並べ替えにのみ使う。 */
  score: number;
}

function scoreFood(keys: string[], query: string): number {
  let best = 0;
  for (const key of keys) {
    let score = 0;
    if (key === query) {
      score = 4;
    } else if (key.startsWith(query)) {
      // 「とり」で「とりむね」に当たる。短いキーほど狙いに近いとみなす。
      score = 3 + query.length / key.length;
    } else if (key.includes(query)) {
      score = 2 + query.length / key.length;
    } else if (query.includes(key)) {
      // 「あじつけとりむねにく」のように余分が付いた入力
      score = 1.5 + key.length / query.length;
    } else {
      const sim = similarity(query, key);
      if (sim >= FUZZY_FLOOR) score = sim;
    }
    if (score > best) best = score;
  }
  return best;
}

/**
 * 入力に合う食材を強い順に返す。
 * 空文字なら全件（呼び出し側でカテゴリ別に並べる想定）。
 */
export function searchFoods(query: string, limit = 8): FoodSearchHit[] {
  const q = toComparable(query);
  if (q.length === 0) {
    return INDEX.slice(0, limit).map(({ food }) => ({ food, score: 0 }));
  }

  const hits: FoodSearchHit[] = [];
  for (const { food, keys } of INDEX) {
    const score = scoreFood(keys, q);
    if (score > 0) hits.push({ food, score });
  }

  // 同点は名前順にして、同じ入力で並びが揺れないようにする
  hits.sort((a, b) => b.score - a.score || a.food.name.localeCompare(b.food.name, "ja"));
  return hits.slice(0, limit);
}
