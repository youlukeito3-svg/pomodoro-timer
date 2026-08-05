import { FOODS } from "@/lib/nutrition/foods";

/**
 * レシートのテキスト行を食材に対応づける。
 *
 * 日本のレシートは半角カナ＋略記＋価格が1行に混ざる（例: 「豚ﾊﾞﾗ    298」）。
 * OCR の生出力をそのまま辞書に当ててもまず当たらないので、
 *   半角カナ→全角 → 価格や記号の除去 → ひらがな化 → 完全一致/前方一致/類似度
 * の順に段階を踏んで拾う。
 */

// ---------------------------------------------------------------------------
// 半角カナ → 全角カナ
// ---------------------------------------------------------------------------

const HALF_TO_FULL: Record<string, string> = {
  "ｱ": "ア", "ｲ": "イ", "ｳ": "ウ", "ｴ": "エ", "ｵ": "オ",
  "ｶ": "カ", "ｷ": "キ", "ｸ": "ク", "ｹ": "ケ", "ｺ": "コ",
  "ｻ": "サ", "ｼ": "シ", "ｽ": "ス", "ｾ": "セ", "ｿ": "ソ",
  "ﾀ": "タ", "ﾁ": "チ", "ﾂ": "ツ", "ﾃ": "テ", "ﾄ": "ト",
  "ﾅ": "ナ", "ﾆ": "ニ", "ﾇ": "ヌ", "ﾈ": "ネ", "ﾉ": "ノ",
  "ﾊ": "ハ", "ﾋ": "ヒ", "ﾌ": "フ", "ﾍ": "ヘ", "ﾎ": "ホ",
  "ﾏ": "マ", "ﾐ": "ミ", "ﾑ": "ム", "ﾒ": "メ", "ﾓ": "モ",
  "ﾔ": "ヤ", "ﾕ": "ユ", "ﾖ": "ヨ",
  "ﾗ": "ラ", "ﾘ": "リ", "ﾙ": "ル", "ﾚ": "レ", "ﾛ": "ロ",
  "ﾜ": "ワ", "ｦ": "ヲ", "ﾝ": "ン",
  "ｧ": "ァ", "ｨ": "ィ", "ｩ": "ゥ", "ｪ": "ェ", "ｫ": "ォ",
  "ｬ": "ャ", "ｭ": "ュ", "ｮ": "ョ", "ｯ": "ッ", "ｰ": "ー",
  "｡": "。", "｢": "「", "｣": "」", "､": "、", "･": "・",
};

/** 濁点が付く文字 */
const VOICED: Record<string, string> = {
  "カ": "ガ", "キ": "ギ", "ク": "グ", "ケ": "ゲ", "コ": "ゴ",
  "サ": "ザ", "シ": "ジ", "ス": "ズ", "セ": "ゼ", "ソ": "ゾ",
  "タ": "ダ", "チ": "ヂ", "ツ": "ヅ", "テ": "デ", "ト": "ド",
  "ハ": "バ", "ヒ": "ビ", "フ": "ブ", "ヘ": "ベ", "ホ": "ボ",
  "ウ": "ヴ",
};

/** 半濁点が付く文字 */
const SEMI_VOICED: Record<string, string> = {
  "ハ": "パ", "ヒ": "ピ", "フ": "プ", "ヘ": "ペ", "ホ": "ポ",
};

/** 半角カナを全角に直す。濁点・半濁点は前の文字と合成する。 */
export function toFullWidthKana(input: string): string {
  let out = "";
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    const full = HALF_TO_FULL[char] ?? char;
    const next = input[i + 1];

    if (next === "ﾞ" && VOICED[full]) {
      out += VOICED[full];
      i++;
      continue;
    }
    if (next === "ﾟ" && SEMI_VOICED[full]) {
      out += SEMI_VOICED[full];
      i++;
      continue;
    }
    out += full;
  }
  return out;
}

/** 全角英数字を半角に直す */
export function toHalfWidthAlnum(input: string): string {
  return input.replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) - 0xfee0),
  );
}

/** カタカナをひらがなに揃える（表記ゆれを吸収するため） */
export function toHiragana(input: string): string {
  return input.replace(/[ァ-ヶ]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) - 0x60),
  );
}

// ---------------------------------------------------------------------------
// 行のクリーニング
// ---------------------------------------------------------------------------

/** 商品行ではないと判断する語 */
const NOISE_WORDS = [
  "小計", "合計", "総計", "課税", "内税", "外税", "消費税", "税抜", "税込",
  "お預", "預り", "お釣", "釣銭", "おつり", "現金", "クレジット", "電子マネー",
  "ポイント", "ﾎﾟｲﾝﾄ", "カード", "領収", "レシート", "登録番号", "インボイス",
  "電話", "TEL", "店", "様", "係", "レジ", "責", "取引", "値引", "割引",
  "袋", "レジ袋", "お買上", "点数", "計",
];

/** 明らかに商品名ではない行か */
export function isNoiseLine(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length === 0) return true;

  // 数字・記号だけの行
  if (/^[\d\s,.\-*¥￥#:/()]+$/.test(trimmed)) return true;
  // 日付・時刻
  if (/\d{1,4}[年/-]\d{1,2}[月/-]\d{1,2}/.test(trimmed)) return true;
  if (/\d{1,2}:\d{2}/.test(trimmed)) return true;
  // 電話番号
  if (/\d{2,4}-\d{2,4}-\d{3,4}/.test(trimmed)) return true;

  const normalized = toFullWidthKana(trimmed);
  return NOISE_WORDS.some((word) => normalized.includes(word));
}

/** 商品名だけを取り出す（価格・個数・記号を落とす） */
export function cleanProductName(line: string): string {
  let text = toHalfWidthAlnum(toFullWidthKana(line));

  // 価格・個数・内容量のどれが末尾に来るかはレシートによって違う
  // （「ﾄﾏﾄ ×2」もあれば「ﾀﾏｺﾞ 10ｺ 258」もある）。
  // 剥がす順序に結果が左右されないよう、変化がなくなるまで繰り返す。
  for (let pass = 0; pass < 4; pass++) {
    const before = text;

    // 「×2」などの個数
    text = text.replace(/[x×]\s*\d+/gi, "");
    // 内容量表記（100g、1kg、500ml）
    text = text.replace(/\d+(\.\d+)?\s*(kg|ml|g|l)\b/gi, "");
    // 末尾の「2コ」「3本」などの個数
    text = text.replace(/\d+\s*(コ|個|点|袋|パック|本|枚|丁)\s*$/g, "");
    // 末尾の価格（¥298、298円、*298 など）
    text = text.replace(/[¥￥*※]?\s*[\d,]+\s*円?\s*[*※]?\s*$/g, "");

    text = text.trim();
    if (text === before) break;
  }

  // 先頭の商品コード
  text = text.replace(/^\s*\d{3,}\s+/, "");
  // 残った記号
  text = text.replace(/[*※#:/()\[\]{}<>|・,.\-–—_]+/g, " ");

  return text.replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// あいまい照合
// ---------------------------------------------------------------------------

/** 比較用の正規形（ひらがな・記号なし） */
function toComparable(input: string): string {
  return toHiragana(toFullWidthKana(input))
    .toLowerCase()
    .replace(/[\s　]/g, "")
    .replace(/[^\p{Script=Hiragana}\p{Script=Han}a-z0-9]/gu, "");
}

function bigrams(input: string): Set<string> {
  const set = new Set<string>();
  // 1文字の語は bigram が作れないので、その文字自身を要素にする
  if (input.length === 1) {
    set.add(input);
    return set;
  }
  for (let i = 0; i < input.length - 1; i++) set.add(input.slice(i, i + 2));
  return set;
}

/** Dice 係数による類似度 0〜1 */
export function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;

  const setA = bigrams(a);
  const setB = bigrams(b);
  let intersection = 0;
  for (const gram of setA) if (setB.has(gram)) intersection++;
  return (2 * intersection) / (setA.size + setB.size);
}

/** 照合に使う候補（食材名と別名をすべて正規形にしたもの） */
const CANDIDATES: { foodId: string; key: string }[] = FOODS.flatMap((food) =>
  [food.name, ...food.aliases].map((label) => ({
    foodId: food.id,
    key: toComparable(label),
  })),
).filter((c) => c.key.length > 0);

export interface FoodMatch {
  foodId: string;
  score: number;
  /** どの段階で当たったか（UIで確信度を出し分けるため） */
  via: "exact" | "partial" | "fuzzy";
}

/** 類似度がこれ未満なら「該当なし」として人に判断を委ねる */
export const FUZZY_THRESHOLD = 0.6;

/** 商品名らしき文字列から食材を推定する */
export function matchFood(productName: string): FoodMatch | null {
  const query = toComparable(productName);
  if (query.length === 0) return null;

  // 1. 完全一致
  for (const candidate of CANDIDATES) {
    if (candidate.key === query) return { foodId: candidate.foodId, score: 1, via: "exact" };
  }

  // 2. 包含（「豚バラ肉こま切れ」→「豚バラ」のように余分が付く場合）
  let bestPartial: FoodMatch | null = null;
  for (const candidate of CANDIDATES) {
    if (candidate.key.length < 2) continue;
    if (query.includes(candidate.key) || candidate.key.includes(query)) {
      // 長い一致ほど確からしい
      const score = 0.9 * (Math.min(candidate.key.length, query.length) / Math.max(candidate.key.length, query.length));
      if (!bestPartial || score > bestPartial.score) {
        bestPartial = { foodId: candidate.foodId, score, via: "partial" };
      }
    }
  }
  if (bestPartial && bestPartial.score >= 0.5) return bestPartial;

  // 3. 類似度
  let bestFuzzy: FoodMatch | null = null;
  for (const candidate of CANDIDATES) {
    const score = similarity(query, candidate.key);
    if (!bestFuzzy || score > bestFuzzy.score) {
      bestFuzzy = { foodId: candidate.foodId, score, via: "fuzzy" };
    }
  }

  if (bestFuzzy && bestFuzzy.score >= FUZZY_THRESHOLD) return bestFuzzy;
  return bestPartial;
}

export interface ParsedReceiptLine {
  raw: string;
  productName: string;
  match: FoodMatch | null;
}

/** OCR の生テキストから商品候補を取り出す */
export function parseReceiptText(text: string): ParsedReceiptLine[] {
  const results: ParsedReceiptLine[] = [];
  const seen = new Set<string>();

  for (const raw of text.split(/\r?\n/)) {
    if (isNoiseLine(raw)) continue;

    const productName = cleanProductName(raw);
    // 1文字だとOCRのゴミである可能性が高い
    if (productName.length < 2) continue;
    if (seen.has(productName)) continue;
    seen.add(productName);

    results.push({ raw: raw.trim(), productName, match: matchFood(productName) });
  }

  return results;
}

/** AIに渡す「id: 名前」の一覧 */
export function foodCatalogText(): string {
  return FOODS.map((f) => `${f.id}: ${f.name}`).join("\n");
}
