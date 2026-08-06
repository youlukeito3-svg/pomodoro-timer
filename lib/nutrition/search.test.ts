import { describe, expect, it } from "vitest";
import { searchFoods } from "./search";

const top = (q: string) => searchFoods(q)[0]?.food.id;
const ids = (q: string) => searchFoods(q).map((h) => h.food.id);

describe("食材の絞り込み検索", () => {
  it("正式名称で先頭に来る", () => {
    expect(top("鶏むね肉")).toBe("chicken_breast");
    expect(top("ブロッコリー")).toBe("broccoli");
  });

  it("表記ゆれ（ひらがな・カタカナ・漢字）を吸収する", () => {
    // レシート照合と同じ正規化を通すので、どの書き方でも当たる
    for (const q of ["とりむね", "トリムネ", "鶏むね", "鶏ムネ"]) {
      expect(top(q), q).toBe("chicken_breast");
    }
  });

  it("途中まで打った時点で候補に出る", () => {
    expect(ids("とり")).toContain("chicken_breast");
    expect(ids("ぶろ")).toContain("broccoli");
    expect(ids("たま")).toContain("egg");
  });

  it("別名でも当たる", () => {
    expect(top("しゃけ")).toBe("salmon");
    expect(top("シーチキン")).toBe("canned_tuna");
  });

  it("余分な語が付いていても当たる", () => {
    expect(ids("国産とりむね肉")).toContain("chicken_breast");
  });

  it("無関係な語では候補が出ない", () => {
    expect(searchFoods("トイレットペーパー")).toHaveLength(0);
    expect(searchFoods("zzzzzz")).toHaveLength(0);
  });

  it("件数の上限を守る", () => {
    expect(searchFoods("", 5)).toHaveLength(5);
    expect(searchFoods("肉", 3).length).toBeLessThanOrEqual(3);
  });

  it("同じ入力なら並びが変わらない", () => {
    expect(ids("とり")).toEqual(ids("とり"));
  });

  it("空文字では全件から先頭を返す（カテゴリ一覧の初期表示用）", () => {
    expect(searchFoods("", 8)).toHaveLength(8);
  });
});
