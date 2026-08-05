import { describe, expect, it } from "vitest";
import {
  cleanProductName,
  isNoiseLine,
  matchFood,
  parseReceiptText,
  similarity,
  toFullWidthKana,
  toHiragana,
} from "./normalize";

describe("半角カナの変換", () => {
  it("濁点を前の文字と合成する", () => {
    expect(toFullWidthKana("ﾌﾞﾀﾊﾞﾗ")).toBe("ブタバラ");
    expect(toFullWidthKana("ﾄﾘﾑﾈ")).toBe("トリムネ");
    expect(toFullWidthKana("ﾖｰｸﾞﾙﾄ")).toBe("ヨーグルト");
  });

  it("半濁点も合成する", () => {
    expect(toFullWidthKana("ﾊﾟﾝ")).toBe("パン");
    expect(toFullWidthKana("ｷｬﾍﾞﾂ")).toBe("キャベツ");
  });

  it("漢字混じりでも壊れない", () => {
    expect(toFullWidthKana("豚ﾊﾞﾗ")).toBe("豚バラ");
  });

  it("カタカナをひらがなに揃えられる", () => {
    expect(toHiragana("トリムネ")).toBe("とりむね");
  });
});

describe("ノイズ行の判定", () => {
  it("金額や集計の行を落とす", () => {
    expect(isNoiseLine("小計          1,234")).toBe(true);
    expect(isNoiseLine("合計 ¥2,980")).toBe(true);
    expect(isNoiseLine("内税  ￥123")).toBe(true);
    expect(isNoiseLine("お預り  3,000")).toBe(true);
    expect(isNoiseLine("お釣    20")).toBe(true);
    expect(isNoiseLine("ﾎﾟｲﾝﾄ  12")).toBe(true);
    expect(isNoiseLine("レジ袋   5")).toBe(true);
  });

  it("日付・時刻・電話番号を落とす", () => {
    expect(isNoiseLine("2026年8月5日 14:32")).toBe(true);
    expect(isNoiseLine("2026/08/05")).toBe(true);
    expect(isNoiseLine("TEL 03-1234-5678")).toBe(true);
  });

  it("数字と記号だけの行を落とす", () => {
    expect(isNoiseLine("   298   ")).toBe(true);
    expect(isNoiseLine("----------------")).toBe(true);
    expect(isNoiseLine("")).toBe(true);
  });

  it("商品行は残す", () => {
    expect(isNoiseLine("豚ﾊﾞﾗ            298")).toBe(false);
    expect(isNoiseLine("ﾄﾘﾑﾈﾆｸ 2枚")).toBe(false);
  });
});

describe("商品名の抽出", () => {
  it("末尾の価格を落とす", () => {
    expect(cleanProductName("豚ﾊﾞﾗ            298")).toBe("豚バラ");
    expect(cleanProductName("ﾌﾞﾛｯｺﾘｰ ¥198")).toBe("ブロッコリー");
    expect(cleanProductName("たまご 258円")).toBe("たまご");
  });

  it("個数表記を落とす", () => {
    expect(cleanProductName("ﾄﾏﾄ ×2")).toBe("トマト");
    expect(cleanProductName("ﾊﾞﾅﾅ 3本")).toBe("バナナ");
  });

  it("内容量表記を落とす", () => {
    expect(cleanProductName("鶏むね肉 300g 450")).toBe("鶏むね肉");
    expect(cleanProductName("牛乳 1000ml")).toBe("牛乳");
  });

  it("先頭の商品コードを落とす", () => {
    expect(cleanProductName("4901234 ﾅｯﾄｳ 98")).toBe("ナットウ");
  });
});

describe("類似度", () => {
  it("同一文字列は1になる", () => {
    expect(similarity("とりむね", "とりむね")).toBe(1);
  });

  it("無関係な語は低い", () => {
    expect(similarity("とりむね", "ばなな")).toBeLessThan(0.3);
  });

  it("部分的に共通する語は中間の値になる", () => {
    const score = similarity("とりむねにく", "とりむね");
    expect(score).toBeGreaterThan(0.5);
    expect(score).toBeLessThan(1);
  });
});

describe("食材の照合", () => {
  const expectMatch = (input: string, foodId: string) => {
    const match = matchFood(input);
    expect(match?.foodId, `${input} → ${match?.foodId ?? "該当なし"}`).toBe(foodId);
  };

  it("正式名称で当たる", () => {
    expectMatch("鶏むね肉", "chicken_breast");
    expectMatch("ブロッコリー", "broccoli");
  });

  it("半角カナの略記で当たる", () => {
    expectMatch(toFullWidthKana("ﾄﾘﾑﾈ"), "chicken_breast");
    expectMatch(toFullWidthKana("ﾌﾞﾀﾊﾞﾗ"), "pork_belly");
    expectMatch(toFullWidthKana("ﾅｯﾄｳ"), "natto");
    expectMatch(toFullWidthKana("ﾄｳﾌ"), "tofu_momen");
  });

  it("ひらがな・カタカナの表記ゆれを吸収する", () => {
    expectMatch("とりむね", "chicken_breast");
    expectMatch("タマゴ", "egg");
    expectMatch("たまご", "egg");
  });

  it("余分な語がついていても拾う", () => {
    expectMatch("豚バラ肉 こま切れ", "pork_belly");
    expectMatch("国産 鶏むね肉", "chicken_breast");
  });

  it("該当がなければ null を返す", () => {
    expect(matchFood("トイレットペーパー")).toBeNull();
    expect(matchFood("")).toBeNull();
  });
});

describe("レシート全体の解析", () => {
  // 実際のレシートに近い形（半角カナ・価格・集計行が混ざる）
  const receipt = [
    "スーパーマルエツ 〇〇店",
    "TEL 03-1234-5678",
    "2026年8月5日 18:42",
    "----------------------",
    "ﾌﾞﾀﾊﾞﾗ            298",
    "ﾄﾘﾑﾈﾆｸ            198",
    "ﾌﾞﾛｯｺﾘｰ           198",
    "ﾀﾏｺﾞ 10ｺ          258",
    "ｷｬﾍﾞﾂ             128",
    "ﾄｲﾚｯﾄﾍﾟｰﾊﾟｰ       398",
    "----------------------",
    "小計            1,478",
    "内税              118",
    "合計            1,478",
    "お預り          2,000",
    "お釣              522",
  ].join("\n");

  it("商品行だけを取り出す", () => {
    const lines = parseReceiptText(receipt);
    const names = lines.map((l) => l.productName);
    expect(names).toContain("ブタバラ");
    expect(names).toContain("ブロッコリー");
    expect(names.some((n) => n.includes("合計"))).toBe(false);
    expect(names.some((n) => n.includes("お釣"))).toBe(false);
  });

  it("主要な食材が食材IDに解決される", () => {
    const lines = parseReceiptText(receipt);
    const resolved = new Map(
      lines.filter((l) => l.match).map((l) => [l.match!.foodId, l.productName]),
    );
    expect([...resolved.keys()]).toEqual(
      expect.arrayContaining(["pork_belly", "chicken_breast", "broccoli", "egg", "cabbage"]),
    );
  });

  it("食品でない品は解決されないか、確信度が低い", () => {
    const lines = parseReceiptText(receipt);
    const paper = lines.find((l) => l.productName.includes("トイレット"));
    expect(paper).toBeDefined();
    // 食材に化けても構わないが、その場合はスコアが低く出て人が直せること
    if (paper?.match) expect(paper.match.score).toBeLessThan(0.8);
  });

  it("同じ商品名が重複しない", () => {
    const lines = parseReceiptText(`ﾄﾘﾑﾈ 198\nﾄﾘﾑﾈ 198`);
    expect(lines).toHaveLength(1);
  });
});
