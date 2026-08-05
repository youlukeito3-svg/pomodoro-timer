import type { FoodCategory, FoodDef } from "@/lib/types";

/**
 * 食材マスタ。100gあたりの栄養価（日本食品標準成分表を基にした概算）。
 *
 * aliases はレシートの商品名照合に使う。レシートは「豚ﾊﾞﾗ」「ﾄﾘﾑﾈ」のように
 * 半角カナ＋略記で印字されるため、正規化後にぶつけられる読みを列挙しておく。
 * （半角→全角の変換は lib/pantry/normalize.ts が行うので、ここは全角で書く）
 */

function food(
  id: string,
  name: string,
  category: FoodCategory,
  kcal: number,
  protein: number,
  fat: number,
  carb: number,
  aliases: string[] = [],
  extra: Partial<Pick<FoodDef, "gramsPerUnit" | "unitLabel" | "shelfLifeDays">> = {},
): FoodDef {
  return {
    id,
    name,
    aliases,
    category,
    kcalPer100g: kcal,
    proteinPer100g: protein,
    fatPer100g: fat,
    carbPer100g: carb,
    ...extra,
  };
}

export const FOODS: FoodDef[] = [
  // --- 肉 ------------------------------------------------------------------
  food("chicken_breast", "鶏むね肉", "meat", 105, 23.3, 1.9, 0.1,
    ["鶏胸肉", "とりむね", "トリムネ", "鶏むね", "若鶏むね", "むね肉", "チキンブレスト", "鶏ムネ"],
    { shelfLifeDays: 3 }),
  food("chicken_thigh", "鶏もも肉", "meat", 190, 16.6, 14.2, 0,
    ["鶏腿肉", "とりもも", "トリモモ", "鶏もも", "若鶏もも", "もも肉", "鶏モモ"],
    { shelfLifeDays: 3 }),
  food("chicken_tender", "ささみ", "meat", 98, 23.9, 0.8, 0.1,
    ["ササミ", "笹身", "鶏ささみ", "トリササミ"], { shelfLifeDays: 3 }),
  food("chicken_mince", "鶏ひき肉", "meat", 171, 17.5, 12.0, 0,
    ["鶏挽肉", "とりひき", "トリヒキ", "鶏ミンチ"], { shelfLifeDays: 2 }),
  food("pork_loin", "豚ロース", "meat", 248, 19.3, 19.2, 0.2,
    ["豚ロース肉", "ブタロース", "ポークロース"], { shelfLifeDays: 3 }),
  food("pork_belly", "豚バラ", "meat", 366, 14.4, 35.4, 0.1,
    ["豚バラ肉", "ブタバラ", "豚ばら"], { shelfLifeDays: 3 }),
  food("pork_mince", "豚ひき肉", "meat", 209, 17.7, 17.2, 0.1,
    ["豚挽肉", "ブタヒキ", "豚ミンチ"], { shelfLifeDays: 2 }),
  food("pork_fillet", "豚ヒレ", "meat", 118, 22.2, 3.7, 0.3,
    ["豚ヒレ肉", "ブタヒレ", "ポークヒレ"], { shelfLifeDays: 3 }),
  food("beef_lean", "牛もも肉", "meat", 182, 21.2, 9.6, 0.5,
    ["牛モモ", "ギュウモモ", "牛赤身"], { shelfLifeDays: 3 }),
  food("beef_mince", "牛ひき肉", "meat", 251, 17.1, 21.1, 0.3,
    ["牛挽肉", "ギュウヒキ", "牛ミンチ"], { shelfLifeDays: 2 }),
  food("mixed_mince", "合いびき肉", "meat", 232, 17.4, 19.2, 0.2,
    ["合挽肉", "合い挽き", "アイビキ", "合挽"], { shelfLifeDays: 2 }),
  food("ham", "ハム", "meat", 196, 16.5, 13.9, 1.3, ["ロースハム"], { shelfLifeDays: 7 }),
  food("bacon", "ベーコン", "meat", 405, 12.9, 39.1, 0.3, [], { shelfLifeDays: 7 }),
  food("sausage", "ウインナー", "meat", 321, 13.2, 28.5, 3.0,
    ["ウィンナー", "ソーセージ", "あらびきウインナー"], { shelfLifeDays: 7 }),

  // --- 魚介 ----------------------------------------------------------------
  food("salmon", "鮭", "fish", 133, 22.3, 4.1, 0.1,
    ["サケ", "しゃけ", "シャケ", "サーモン", "生鮭", "銀鮭"], { shelfLifeDays: 2 }),
  food("tuna_sashimi", "まぐろ赤身", "fish", 115, 26.4, 1.4, 0.1,
    ["マグロ", "鮪", "まぐろ", "刺身マグロ"], { shelfLifeDays: 1 }),
  food("saba", "さば", "fish", 211, 20.6, 16.8, 0.3, ["サバ", "鯖", "生さば"], { shelfLifeDays: 2 }),
  food("sanma", "さんま", "fish", 287, 18.1, 25.6, 0.1, ["サンマ", "秋刀魚"], { shelfLifeDays: 2 }),
  food("shrimp", "えび", "fish", 82, 18.4, 0.3, 0.3, ["エビ", "海老", "むきえび"], { shelfLifeDays: 2 }),
  food("canned_tuna", "ツナ缶", "fish", 71, 16.0, 0.7, 0.2,
    ["ツナ", "シーチキン", "まぐろ水煮"], { shelfLifeDays: 720 }),
  food("canned_saba", "さば缶", "fish", 190, 20.9, 10.7, 0.2,
    ["サバ缶", "鯖缶", "さば水煮"], { shelfLifeDays: 720 }),
  food("chikuwa", "ちくわ", "fish", 121, 12.2, 2.0, 13.5, ["チクワ", "竹輪"], { shelfLifeDays: 7 }),
  food("shirasu", "しらす", "fish", 113, 24.5, 2.1, 0.1, ["シラス", "白子干し"], { shelfLifeDays: 5 }),

  // --- 卵・乳製品 ----------------------------------------------------------
  food("egg", "卵", "egg_dairy", 142, 12.2, 10.2, 0.4,
    ["たまご", "タマゴ", "鶏卵", "玉子", "生卵", "Lサイズ卵"],
    { gramsPerUnit: 50, unitLabel: "個", shelfLifeDays: 14 }),
  food("milk", "牛乳", "egg_dairy", 61, 3.3, 3.8, 4.8,
    ["ミルク", "成分無調整牛乳"], { shelfLifeDays: 7 }),
  food("yogurt_plain", "ヨーグルト", "egg_dairy", 56, 3.6, 3.0, 4.9,
    ["プレーンヨーグルト", "ﾖｰｸﾞﾙﾄ"], { shelfLifeDays: 10 }),
  food("greek_yogurt", "ギリシャヨーグルト", "egg_dairy", 59, 10.0, 0.4, 3.9,
    ["ギリシャヨーグルト", "高たんぱくヨーグルト"], { shelfLifeDays: 10 }),
  food("cheese_process", "プロセスチーズ", "egg_dairy", 313, 22.7, 26.0, 1.3,
    ["チーズ", "スライスチーズ"], { shelfLifeDays: 30 }),
  food("butter", "バター", "egg_dairy", 700, 0.6, 81.0, 0.2, [], { shelfLifeDays: 60 }),
  food("protein_powder", "プロテイン", "egg_dairy", 390, 75.0, 5.0, 10.0,
    ["ホエイプロテイン", "プロテインパウダー"], { shelfLifeDays: 365 }),

  // --- 大豆製品 ------------------------------------------------------------
  food("tofu_momen", "木綿豆腐", "soy", 73, 7.0, 4.9, 1.5,
    ["豆腐", "とうふ", "トウフ", "もめん豆腐"],
    { gramsPerUnit: 300, unitLabel: "丁", shelfLifeDays: 5 }),
  food("tofu_kinu", "絹ごし豆腐", "soy", 56, 5.3, 3.5, 2.0,
    ["絹豆腐", "きぬ豆腐", "絹ごし"],
    { gramsPerUnit: 300, unitLabel: "丁", shelfLifeDays: 5 }),
  food("natto", "納豆", "soy", 190, 16.5, 10.0, 12.1,
    ["なっとう", "ナットウ", "ひきわり納豆"],
    { gramsPerUnit: 45, unitLabel: "パック", shelfLifeDays: 10 }),
  food("soy_milk", "豆乳", "soy", 44, 3.6, 2.0, 3.1,
    ["無調整豆乳", "調整豆乳", "トウニュウ"], { shelfLifeDays: 7 }),
  food("atsuage", "厚揚げ", "soy", 143, 10.7, 11.3, 0.9,
    ["生揚げ", "アツアゲ"], { shelfLifeDays: 5 }),
  food("edamame", "枝豆", "soy", 125, 11.7, 6.2, 8.8, ["エダマメ"], { shelfLifeDays: 3 }),

  // --- 主食 ----------------------------------------------------------------
  food("rice_cooked", "ごはん", "grain", 156, 2.5, 0.3, 37.1,
    ["白米", "ご飯", "米飯", "ライス"]),
  food("rice_raw", "米", "grain", 342, 6.1, 0.9, 77.6,
    ["無洗米", "コシヒカリ", "精米", "お米"], { shelfLifeDays: 180 }),
  food("bread", "食パン", "grain", 248, 8.9, 4.1, 46.4,
    ["パン", "しょくパン", "6枚切"], { gramsPerUnit: 60, unitLabel: "枚", shelfLifeDays: 5 }),
  food("udon", "うどん", "grain", 95, 2.6, 0.4, 21.6, ["ウドン", "ゆでうどん"], { shelfLifeDays: 7 }),
  food("soba", "そば", "grain", 130, 4.8, 1.0, 26.0, ["ソバ", "蕎麦", "ゆでそば"], { shelfLifeDays: 7 }),
  food("pasta_dry", "パスタ", "grain", 347, 12.9, 1.8, 73.1,
    ["スパゲティ", "スパゲッティ", "マカロニ"], { shelfLifeDays: 365 }),
  food("oatmeal", "オートミール", "grain", 350, 13.7, 5.7, 69.1,
    ["オーツ麦", "ｵｰﾄﾐｰﾙ"], { shelfLifeDays: 365 }),
  food("chinese_noodle", "中華麺", "grain", 149, 4.9, 1.2, 27.9, ["ラーメン麺", "焼きそば麺"], { shelfLifeDays: 7 }),

  // --- 野菜 ----------------------------------------------------------------
  food("broccoli", "ブロッコリー", "vegetable", 37, 5.4, 0.6, 6.6, ["ブロッコリ"], { shelfLifeDays: 5 }),
  food("cabbage", "キャベツ", "vegetable", 21, 1.3, 0.2, 5.2, ["きゃべつ"], { shelfLifeDays: 10 }),
  food("carrot", "にんじん", "vegetable", 35, 0.7, 0.2, 9.3, ["ニンジン", "人参"], { shelfLifeDays: 14 }),
  food("onion", "玉ねぎ", "vegetable", 33, 1.0, 0.1, 8.4,
    ["たまねぎ", "タマネギ", "玉葱"], { gramsPerUnit: 200, unitLabel: "個", shelfLifeDays: 30 }),
  food("tomato", "トマト", "vegetable", 20, 0.7, 0.1, 4.7,
    ["とまと", "ミニトマト"], { gramsPerUnit: 150, unitLabel: "個", shelfLifeDays: 7 }),
  food("cucumber", "きゅうり", "vegetable", 13, 1.0, 0.1, 3.0,
    ["キュウリ", "胡瓜"], { gramsPerUnit: 100, unitLabel: "本", shelfLifeDays: 7 }),
  food("spinach", "ほうれん草", "vegetable", 18, 2.2, 0.4, 3.1, ["ホウレンソウ", "法蓮草"], { shelfLifeDays: 4 }),
  food("potato", "じゃがいも", "vegetable", 59, 1.8, 0.1, 17.3,
    ["ジャガイモ", "馬鈴薯", "男爵"], { gramsPerUnit: 130, unitLabel: "個", shelfLifeDays: 30 }),
  food("sweet_potato", "さつまいも", "vegetable", 126, 1.2, 0.2, 31.9,
    ["サツマイモ", "薩摩芋", "紅はるか"], { shelfLifeDays: 21 }),
  food("shimeji", "しめじ", "vegetable", 22, 2.7, 0.6, 4.8, ["シメジ", "ぶなしめじ"], { shelfLifeDays: 7 }),
  food("eringi", "エリンギ", "vegetable", 31, 2.8, 0.4, 6.0, [], { shelfLifeDays: 7 }),
  food("eggplant", "なす", "vegetable", 18, 1.1, 0.1, 5.1, ["ナス", "茄子"], { shelfLifeDays: 5 }),
  food("bean_sprout", "もやし", "vegetable", 15, 1.7, 0.1, 2.6, ["モヤシ"], { shelfLifeDays: 3 }),
  food("lettuce", "レタス", "vegetable", 11, 0.6, 0.1, 2.8, [], { shelfLifeDays: 7 }),
  food("green_pepper", "ピーマン", "vegetable", 20, 0.9, 0.2, 5.1, ["パプリカ"], { shelfLifeDays: 7 }),
  food("daikon", "大根", "vegetable", 15, 0.4, 0.1, 4.1, ["ダイコン", "だいこん"], { shelfLifeDays: 10 }),
  food("napa_cabbage", "白菜", "vegetable", 13, 0.8, 0.1, 3.2, ["ハクサイ", "はくさい"], { shelfLifeDays: 10 }),
  food("green_onion", "長ねぎ", "vegetable", 35, 1.4, 0.1, 8.3,
    ["ねぎ", "ネギ", "長葱", "青ねぎ", "小ねぎ"], { shelfLifeDays: 7 }),
  food("avocado", "アボカド", "vegetable", 176, 2.1, 17.5, 7.9,
    ["アボガド"], { gramsPerUnit: 140, unitLabel: "個", shelfLifeDays: 5 }),
  food("garlic", "にんにく", "vegetable", 129, 6.4, 0.9, 27.5, ["ニンニク", "大蒜"], { shelfLifeDays: 30 }),
  food("ginger", "しょうが", "vegetable", 30, 0.9, 0.3, 6.6, ["ショウガ", "生姜"], { shelfLifeDays: 14 }),

  // --- 果物 ----------------------------------------------------------------
  food("banana", "バナナ", "fruit", 93, 1.1, 0.2, 22.5,
    ["ばなな"], { gramsPerUnit: 90, unitLabel: "本", shelfLifeDays: 5 }),
  food("apple", "りんご", "fruit", 56, 0.2, 0.3, 15.5,
    ["リンゴ", "林檎"], { gramsPerUnit: 250, unitLabel: "個", shelfLifeDays: 14 }),
  food("orange", "みかん", "fruit", 49, 0.7, 0.1, 12.0,
    ["ミカン", "蜜柑", "オレンジ"], { gramsPerUnit: 100, unitLabel: "個", shelfLifeDays: 10 }),
  food("kiwi", "キウイ", "fruit", 51, 1.0, 0.2, 13.4,
    ["キウイフルーツ"], { gramsPerUnit: 100, unitLabel: "個", shelfLifeDays: 10 }),
  food("blueberry", "ブルーベリー", "fruit", 48, 0.5, 0.1, 12.9, [], { shelfLifeDays: 7 }),

  // --- 調味料 --------------------------------------------------------------
  food("soy_sauce", "醤油", "seasoning", 77, 7.7, 0, 7.9, ["しょうゆ", "ショウユ"], { shelfLifeDays: 365 }),
  food("miso", "味噌", "seasoning", 182, 12.5, 6.0, 21.9, ["みそ", "ミソ"], { shelfLifeDays: 365 }),
  food("mirin", "みりん", "seasoning", 241, 0.3, 0, 43.2, ["ミリン", "味醂"], { shelfLifeDays: 365 }),
  food("cooking_sake", "料理酒", "seasoning", 88, 0.2, 0, 4.7, ["清酒"], { shelfLifeDays: 365 }),
  food("sugar", "砂糖", "seasoning", 391, 0, 0, 99.2, ["上白糖", "さとう"], { shelfLifeDays: 999 }),
  food("salt", "塩", "seasoning", 0, 0, 0, 0, ["食塩", "しお"], { shelfLifeDays: 999 }),
  food("olive_oil", "オリーブオイル", "seasoning", 894, 0, 100, 0,
    ["オリーブ油", "ｵﾘｰﾌﾞｵｲﾙ"], { shelfLifeDays: 365 }),
  food("sesame_oil", "ごま油", "seasoning", 890, 0, 100, 0, ["ゴマ油", "胡麻油"], { shelfLifeDays: 365 }),
  food("salad_oil", "サラダ油", "seasoning", 886, 0, 100, 0, ["キャノーラ油", "食用油"], { shelfLifeDays: 365 }),
  food("mayonnaise", "マヨネーズ", "seasoning", 668, 1.4, 72.5, 3.6, ["マヨ"], { shelfLifeDays: 180 }),
  food("ketchup", "ケチャップ", "seasoning", 106, 1.6, 0.2, 25.9, ["トマトケチャップ"], { shelfLifeDays: 180 }),
  food("worcester_sauce", "ソース", "seasoning", 117, 0.8, 0, 27.1, ["中濃ソース", "ウスターソース"], { shelfLifeDays: 365 }),
  food("pepper", "こしょう", "seasoning", 371, 11.6, 6.0, 66.6, ["コショウ", "胡椒", "ブラックペッパー"], { shelfLifeDays: 999 }),
  food("dashi", "だし", "seasoning", 12, 1.3, 0, 1.5, ["だしの素", "顆粒だし", "ほんだし"], { shelfLifeDays: 365 }),
  food("consomme", "コンソメ", "seasoning", 233, 12.0, 4.0, 40.0, ["コンソメ顆粒", "ブイヨン"], { shelfLifeDays: 365 }),
  food("oyster_sauce", "オイスターソース", "seasoning", 107, 7.7, 0.3, 18.3, [], { shelfLifeDays: 365 }),
  food("vinegar", "酢", "seasoning", 25, 0.1, 0, 2.4, ["米酢", "穀物酢"], { shelfLifeDays: 365 }),
];

export const FOOD_BY_ID = new Map(FOODS.map((f) => [f.id, f]));

export function getFood(id: string): FoodDef | undefined {
  return FOOD_BY_ID.get(id);
}

/** 指定グラム数あたりの栄養価 */
export function macrosForGrams(food: FoodDef, grams: number) {
  const factor = grams / 100;
  return {
    kcal: food.kcalPer100g * factor,
    protein: food.proteinPer100g * factor,
    fat: food.fatPer100g * factor,
    carb: food.carbPer100g * factor,
  };
}

/** 「個」「本」などの単位を持つ食材か */
export function hasUnit(food: FoodDef): boolean {
  return typeof food.gramsPerUnit === "number" && !!food.unitLabel;
}
