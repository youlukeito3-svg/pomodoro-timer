import type { Macros, MealSlot, RecipeDef } from "@/lib/types";
import { FOOD_BY_ID, macrosForGrams } from "./foods";
import { ZERO_MACROS, addMacros } from "./bmr";

/**
 * レシピマスタ。
 *
 * 栄養価はレシピ自身に持たせず、材料（食材ID×グラム）から計算する。
 * 二重管理を避けられるうえ、在庫との突き合わせもそのまま材料表を使える。
 */

function recipe(
  id: string,
  name: string,
  slots: MealSlot[],
  minutes: number,
  ingredients: [foodId: string, grams: number][],
  steps: string[],
  tags: string[] = [],
): RecipeDef {
  return {
    id,
    name,
    slots,
    minutes,
    ingredients: ingredients.map(([foodId, grams]) => ({ foodId, grams })),
    steps,
    tags,
  };
}

export const RECIPES: RecipeDef[] = [
  // --- 朝食 ----------------------------------------------------------------
  recipe("natto_gohan", "納豆ごはん", ["breakfast"], 5,
    [["rice_cooked", 200], ["natto", 45], ["egg", 50], ["soy_sauce", 5]],
    ["納豆をよく混ぜ、付属のタレを加える。", "温かいごはんに納豆と生卵をのせる。", "醤油をひと回しかける。"],
    ["高たんぱく", "時短", "節約"]),

  recipe("oatmeal_protein", "プロテインオートミール", ["breakfast"], 5,
    [["oatmeal", 40], ["milk", 200], ["protein_powder", 30], ["banana", 90]],
    ["オートミールと牛乳を耐熱容器に入れ、600Wで2分加熱する。", "粗熱を取ってからプロテインを混ぜる。", "輪切りにしたバナナをのせる。"],
    ["高たんぱく", "時短"]),

  recipe("egg_toast", "たまごトースト", ["breakfast"], 10,
    [["bread", 60], ["egg", 100], ["butter", 5], ["salt", 1]],
    ["食パンをトースターで焼く。", "フライパンにバターを溶かし目玉焼きを作る。", "トーストにのせ塩をふる。"],
    ["時短"]),

  recipe("greek_yogurt_bowl", "ヨーグルトボウル", ["breakfast", "snack"], 3,
    [["greek_yogurt", 150], ["blueberry", 50], ["banana", 90]],
    ["ヨーグルトを器に盛る。", "バナナとブルーベリーをのせる。"],
    ["高たんぱく", "低脂質", "時短"]),

  recipe("scrambled_eggs", "スクランブルエッグ", ["breakfast"], 8,
    [["egg", 150], ["milk", 30], ["butter", 5], ["salt", 1], ["pepper", 1]],
    ["卵と牛乳、塩こしょうを混ぜる。", "バターを溶かしたフライパンで、半熟になるまで手早く混ぜる。"],
    ["高たんぱく", "時短"]),

  recipe("tofu_miso_soup", "豆腐の味噌汁", ["breakfast", "dinner"], 10,
    [["tofu_momen", 100], ["miso", 15], ["dashi", 2], ["green_onion", 10]],
    ["水400mlにだしを溶かし火にかける。", "角切りの豆腐を入れて温める。", "火を止めて味噌を溶き、ねぎを散らす。"],
    ["低脂質", "節約"]),

  recipe("protein_shake_banana", "バナナプロテインシェイク", ["breakfast", "snack"], 3,
    [["protein_powder", 30], ["milk", 300], ["banana", 90]],
    ["すべてをシェイカーかミキサーに入れる。", "よく混ぜる。"],
    ["高たんぱく", "時短"]),

  // --- 昼食 ----------------------------------------------------------------
  recipe("chicken_rice_bowl", "鶏むね丼", ["lunch", "dinner"], 20,
    [["chicken_breast", 150], ["rice_cooked", 200], ["onion", 50],
     ["soy_sauce", 15], ["mirin", 10], ["egg", 50]],
    ["鶏むね肉をそぎ切りにする。", "玉ねぎと一緒に炒め、醤油とみりんで煮からめる。", "ごはんにのせ、卵黄を落とす。"],
    ["高たんぱく", "低脂質"]),

  recipe("tuna_pasta", "ツナとブロッコリーのパスタ", ["lunch"], 20,
    [["pasta_dry", 100], ["canned_tuna", 70], ["olive_oil", 10],
     ["garlic", 5], ["broccoli", 80], ["salt", 2]],
    ["パスタを茹で、茹で上がり2分前にブロッコリーを加える。", "にんにくをオリーブオイルで炒める。", "ツナとパスタを加えて和える。"],
    ["高たんぱく"]),

  recipe("saba_teishoku", "さばの塩焼き定食", ["lunch", "dinner"], 25,
    [["saba", 120], ["rice_cooked", 200], ["miso", 15], ["dashi", 2],
     ["tofu_momen", 50], ["salt", 2]],
    ["さばに塩をふり10分おく。", "グリルで両面を焼く。", "味噌汁を添える。"],
    ["高たんぱく"]),

  recipe("chicken_sandwich", "サラダチキンサンド", ["lunch"], 10,
    [["bread", 120], ["chicken_breast", 100], ["lettuce", 30],
     ["tomato", 50], ["mayonnaise", 10]],
    ["鶏むね肉を茹でて割く（市販のサラダチキンでも可）。", "パンにマヨネーズを塗る。", "レタス、トマト、鶏肉を挟む。"],
    ["高たんぱく", "時短"]),

  recipe("yakisoba", "焼きそば", ["lunch", "dinner"], 15,
    [["chinese_noodle", 150], ["pork_belly", 80], ["cabbage", 100],
     ["carrot", 30], ["worcester_sauce", 25]],
    ["豚バラを炒め、野菜を加える。", "麺をほぐして加える。", "ソースで味を整える。"],
    ["節約", "時短"]),

  recipe("oyakodon", "親子丼", ["lunch", "dinner"], 20,
    [["chicken_thigh", 120], ["egg", 100], ["rice_cooked", 200],
     ["onion", 60], ["soy_sauce", 15], ["mirin", 10], ["dashi", 2]],
    ["だし、醤油、みりんを煮立てる。", "鶏肉と玉ねぎを入れて火を通す。", "溶き卵を回し入れ半熟で火を止め、ごはんにのせる。"],
    ["高たんぱく"]),

  recipe("tsukimi_udon", "月見うどん", ["lunch"], 10,
    [["udon", 250], ["egg", 50], ["green_onion", 20],
     ["soy_sauce", 15], ["dashi", 3]],
    ["だしと醤油でつゆを作る。", "うどんを温めて器に入れる。", "卵とねぎをのせる。"],
    ["時短", "節約"]),

  recipe("tuna_mayo_don", "ツナマヨ丼", ["lunch", "snack"], 5,
    [["rice_cooked", 200], ["canned_tuna", 70], ["mayonnaise", 15],
     ["green_onion", 10], ["soy_sauce", 5]],
    ["ツナとマヨネーズを混ぜる。", "ごはんにのせ、ねぎを散らす。"],
    ["時短", "節約"]),

  // --- 夕食 ----------------------------------------------------------------
  recipe("chicken_broccoli", "鶏むねとブロッコリーの炒めもの", ["dinner", "lunch"], 15,
    [["chicken_breast", 200], ["broccoli", 150], ["garlic", 5],
     ["olive_oil", 10], ["salt", 2], ["pepper", 1]],
    ["鶏むね肉を一口大に切る。", "にんにくを炒めて香りを出す。", "鶏肉とブロッコリーを炒め、塩こしょうで整える。"],
    ["高たんぱく", "低脂質"]),

  recipe("hamburg", "ハンバーグ", ["dinner"], 30,
    [["mixed_mince", 180], ["onion", 60], ["egg", 25],
     ["bread", 20], ["ketchup", 20], ["salad_oil", 5], ["salt", 1]],
    ["玉ねぎをみじん切りにして炒め冷ます。", "ひき肉、卵、パン粉と練り混ぜる。", "成形して両面を焼き、蒸し焼きにする。"],
    ["高たんぱく"]),

  recipe("ginger_pork", "豚の生姜焼き", ["dinner", "lunch"], 15,
    [["pork_loin", 150], ["ginger", 10], ["soy_sauce", 20],
     ["mirin", 15], ["cabbage", 100], ["salad_oil", 5]],
    ["生姜をすりおろし、醤油・みりんと合わせる。", "豚肉を焼き、タレを加えて煮からめる。", "千切りキャベツを添える。"],
    ["高たんぱく"]),

  recipe("salmon_meuniere", "鮭のムニエル", ["dinner"], 20,
    [["salmon", 150], ["butter", 10], ["salt", 2],
     ["pepper", 1], ["broccoli", 80]],
    ["鮭に塩こしょうをする。", "バターで両面をこんがり焼く。", "茹でたブロッコリーを添える。"],
    ["高たんぱく"]),

  recipe("mapo_tofu", "麻婆豆腐", ["dinner"], 20,
    [["tofu_momen", 300], ["pork_mince", 100], ["green_onion", 20],
     ["garlic", 5], ["ginger", 5], ["miso", 15], ["sesame_oil", 5]],
    ["にんにく・生姜・ひき肉を炒める。", "味噌と水を加えて煮立てる。", "角切りの豆腐を加えて煮からめ、ねぎを散らす。"],
    ["高たんぱく"]),

  recipe("nikujaga", "肉じゃが", ["dinner"], 35,
    [["beef_lean", 120], ["potato", 250], ["onion", 100],
     ["carrot", 60], ["soy_sauce", 25], ["mirin", 20], ["sugar", 8], ["dashi", 2]],
    ["牛肉を炒め、野菜を加える。", "だしと調味料を入れて落とし蓋をする。", "じゃがいもが柔らかくなるまで煮る。"],
    ["節約"]),

  recipe("chicken_steak", "チキンステーキ", ["dinner"], 20,
    [["chicken_thigh", 200], ["salt", 2], ["pepper", 1],
     ["garlic", 5], ["salad_oil", 5], ["lettuce", 40]],
    ["鶏ももに塩こしょうをする。", "皮目からじっくり焼いて脂を出す。", "裏返して火を通し、サラダを添える。"],
    ["高たんぱく"]),

  recipe("tofu_hamburg", "豆腐ハンバーグ", ["dinner"], 30,
    [["tofu_momen", 200], ["chicken_mince", 150], ["onion", 50],
     ["egg", 25], ["soy_sauce", 15], ["salad_oil", 5]],
    ["豆腐は水切りする。", "鶏ひき肉、玉ねぎ、卵と混ぜて成形する。", "両面を焼き、醤油で味を整える。"],
    ["高たんぱく", "低脂質"]),

  recipe("shrimp_chili", "エビチリ", ["dinner"], 20,
    [["shrimp", 180], ["ketchup", 30], ["garlic", 5],
     ["ginger", 5], ["green_onion", 20], ["sesame_oil", 5]],
    ["えびの背わたを取る。", "にんにく・生姜を炒め、ケチャップを加える。", "えびを加えて炒め合わせる。"],
    ["高たんぱく", "低脂質"]),

  recipe("beef_veg_stirfry", "牛肉と野菜のオイスター炒め", ["dinner"], 15,
    [["beef_lean", 150], ["green_pepper", 60], ["onion", 80],
     ["oyster_sauce", 20], ["sesame_oil", 8]],
    ["牛肉を強火で炒める。", "野菜を加えて炒め合わせる。", "オイスターソースで味を整える。"],
    ["高たんぱく", "時短"]),

  recipe("sanma_grill", "さんまの塩焼き", ["dinner"], 20,
    [["sanma", 150], ["salt", 2], ["daikon", 50], ["rice_cooked", 200]],
    ["さんまに塩をふる。", "グリルで両面を焼く。", "大根おろしを添える。"],
    ["高たんぱく"]),

  recipe("pork_shabu_salad", "豚しゃぶサラダ", ["dinner", "lunch"], 15,
    [["pork_loin", 150], ["lettuce", 50], ["tomato", 80],
     ["cucumber", 50], ["soy_sauce", 10], ["sesame_oil", 5]],
    ["豚肉をさっと茹でて冷ます。", "野菜を切って盛り付ける。", "醤油とごま油のタレをかける。"],
    ["高たんぱく"]),

  recipe("atsuage_stir", "厚揚げの甘辛炒め", ["dinner"], 12,
    [["atsuage", 200], ["green_onion", 30], ["soy_sauce", 15],
     ["mirin", 10], ["sugar", 5]],
    ["厚揚げを一口大に切る。", "焼き色をつける。", "調味料を加えて煮からめる。"],
    ["節約", "時短"]),

  recipe("chikuwa_pepper", "ちくわとピーマンの炒めもの", ["dinner", "lunch"], 10,
    [["chikuwa", 100], ["green_pepper", 80], ["sesame_oil", 5], ["soy_sauce", 10]],
    ["ちくわとピーマンを細切りにする。", "ごま油で炒め、醤油で味を整える。"],
    ["節約", "時短"]),

  // --- 副菜 ----------------------------------------------------------------
  recipe("broccoli_egg_salad", "ブロッコリーと卵のサラダ", ["dinner", "lunch"], 12,
    [["broccoli", 120], ["egg", 50], ["mayonnaise", 15], ["salt", 1]],
    ["ブロッコリーを茹でる。", "ゆで卵を刻む。", "マヨネーズで和える。"],
    ["高たんぱく"]),

  recipe("spinach_ohitashi", "ほうれん草のおひたし", ["dinner", "breakfast"], 8,
    [["spinach", 100], ["soy_sauce", 8], ["dashi", 1]],
    ["ほうれん草を茹でて水にさらす。", "水気を絞って切る。", "だし醤油をかける。"],
    ["低脂質", "節約"]),

  recipe("moyashi_namuru", "もやしのナムル", ["dinner", "lunch"], 8,
    [["bean_sprout", 150], ["sesame_oil", 6], ["salt", 1], ["garlic", 3]],
    ["もやしをさっと茹でる。", "水気を切る。", "ごま油、塩、おろしにんにくで和える。"],
    ["節約", "時短", "低脂質"]),

  // --- 間食 ----------------------------------------------------------------
  recipe("protein_water", "プロテイン（水割り）", ["snack"], 2,
    [["protein_powder", 30]],
    ["水300mlとプロテインをシェイカーで混ぜる。"],
    ["高たんぱく", "低脂質", "時短"]),

  recipe("boiled_eggs", "ゆで卵", ["snack", "breakfast"], 12,
    [["egg", 100], ["salt", 1]],
    ["沸騰した湯で8〜10分茹でる。", "冷水にとって殻をむく。"],
    ["高たんぱく", "時短"]),

  recipe("edamame_snack", "枝豆", ["snack"], 8,
    [["edamame", 100], ["salt", 2]],
    ["塩を揉み込む。", "熱湯で4分茹でる。"],
    ["高たんぱく", "時短"]),

  recipe("cheese_snack", "チーズ", ["snack"], 1,
    [["cheese_process", 40]],
    ["そのまま食べる。"],
    ["高たんぱく", "時短"]),

  recipe("banana_snack", "バナナ", ["snack"], 1,
    [["banana", 90]],
    ["皮をむいて食べる。"],
    ["時短", "節約"]),

  recipe("shirasu_gohan", "しらすごはん", ["snack", "breakfast"], 3,
    [["rice_cooked", 150], ["shirasu", 30], ["soy_sauce", 3]],
    ["ごはんにしらすをのせる。", "醤油を少量たらす。"],
    ["高たんぱく", "時短"]),

  recipe("yogurt_plain_snack", "プレーンヨーグルト", ["snack"], 1,
    [["yogurt_plain", 150]],
    ["器に盛る。"],
    ["時短"]),
];

export const RECIPE_BY_ID = new Map(RECIPES.map((r) => [r.id, r]));

/** 材料から計算した1人前の栄養価 */
export function recipeMacros(recipe: RecipeDef): Macros {
  let total = ZERO_MACROS;
  for (const ing of recipe.ingredients) {
    const food = FOOD_BY_ID.get(ing.foodId);
    if (!food) continue;
    total = addMacros(total, { ...macrosForGrams(food, ing.grams) });
  }
  return total;
}

/** レシピ栄養価のキャッシュ（毎回全材料を舐めると献立生成が重くなるため） */
const macrosCache = new Map<string, Macros>();

export function cachedRecipeMacros(recipe: RecipeDef): Macros {
  let cached = macrosCache.get(recipe.id);
  if (!cached) {
    cached = recipeMacros(recipe);
    macrosCache.set(recipe.id, cached);
  }
  return cached;
}

/** 参照している食材IDがすべてマスタに存在するか（データ整合性テスト用） */
export function findBrokenIngredientRefs(): { recipeId: string; foodId: string }[] {
  const broken: { recipeId: string; foodId: string }[] = [];
  for (const r of RECIPES) {
    for (const ing of r.ingredients) {
      if (!FOOD_BY_ID.has(ing.foodId)) broken.push({ recipeId: r.id, foodId: ing.foodId });
    }
  }
  return broken;
}
