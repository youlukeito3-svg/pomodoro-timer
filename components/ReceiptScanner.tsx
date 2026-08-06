"use client";

import { useRef, useState } from "react";
import { AiError, aiErrorMessage, extractReceiptItems, isAiReady } from "@/lib/ai/gemini";
import { addPantryItems } from "@/lib/actions";
import { addDays, todayStr } from "@/lib/date";
import { FOOD_BY_ID } from "@/lib/nutrition/foods";
import { preprocessForAi, preprocessForOcr } from "@/lib/ocr/preprocess";
import { recognizeJapanese } from "@/lib/ocr/tesseract";
import { foodCatalogText, parseReceiptText } from "@/lib/pantry/normalize";
import { useSettings } from "@/lib/store/hooks";
import { Button, Card, SectionTitle } from "./ui";
import FoodSelect from "./FoodSelect";

/**
 * レシート読み取り。
 *
 * 既定はブラウザ内OCR（無料・オフライン）。APIキーがあれば高精度なAI解析も選べる。
 * どちらの経路でも、確認・編集画面を必ず通してから在庫に入れる。
 * 日本語レシートの読み取りは誤りが避けられないので、
 * 「機械は下書きを作り、確定は人がする」という形にしている。
 */

type Stage = "idle" | "working" | "review";

interface DraftItem {
  key: string;
  rawName: string;
  foodId: string | null;
  grams: number;
  /** 自動判定の確からしさ。低いものを目立たせて確認を促す。 */
  confidence: number;
}

/** 1件あたりの既定グラム数（判定できなかったときの置き） */
const DEFAULT_GRAMS = 200;

export default function ReceiptScanner({ onDone }: { onDone?: () => void }) {
  const settings = useSettings();
  const fileInput = useRef<HTMLInputElement>(null);

  const [stage, setStage] = useState<Stage>("idle");
  const [progress, setProgress] = useState<{ status: string; value: number } | null>(null);
  const [items, setItems] = useState<DraftItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [useAi, setUseAi] = useState(false);

  const aiReady = isAiReady(settings);

  const reset = () => {
    setStage("idle");
    setProgress(null);
    setItems([]);
    setError(null);
  };

  const handleFile = async (file: File) => {
    setStage("working");
    setError(null);
    setNotice(null);
    setProgress({ status: "画像を準備中", value: 0.05 });

    try {
      const drafts = useAi && aiReady ? await runAi(file) : await runOcr(file);

      if (drafts.length === 0) {
        setError(
          "食材を読み取れませんでした。明るい場所で、レシート全体が入るように撮り直してみてください。",
        );
        setStage("idle");
        return;
      }
      setItems(drafts);
      setStage("review");
    } catch (err) {
      if (err instanceof AiError) {
        setError(aiErrorMessage(err));
        // AI が使えないだけならOCRに落とせることを伝える
        if (err.code === "quota" || err.code === "invalid_key") {
          setNotice("「端末内で読み取る」に切り替えれば、そのまま続けられます。");
        }
      } else {
        console.error(err);
        setError("読み取りに失敗しました。もう一度お試しください。");
      }
      setStage("idle");
    } finally {
      setProgress(null);
    }
  };

  const runOcr = async (file: File): Promise<DraftItem[]> => {
    const canvas = await preprocessForOcr(file);
    const text = await recognizeJapanese(canvas, (p) =>
      setProgress({ status: p.status, value: p.progress }),
    );

    return parseReceiptText(text).map((line, i) => ({
      key: `ocr-${i}`,
      rawName: line.productName,
      foodId: line.match?.foodId ?? null,
      grams: defaultGramsFor(line.match?.foodId ?? null),
      confidence: line.match?.score ?? 0,
    }));
  };

  const runAi = async (file: File): Promise<DraftItem[]> => {
    setProgress({ status: "AIが解析中", value: 0.4 });
    const { base64, mimeType } = await preprocessForAi(file);
    const result = await extractReceiptItems({
      apiKey: settings.geminiApiKey,
      imageBase64: base64,
      mimeType,
      foodCatalog: foodCatalogText(),
    });

    return result.map((item, i) => ({
      key: `ai-${i}`,
      rawName: item.rawName,
      // モデルが知らない id を返すことがあるので実在チェックをする
      foodId: item.foodId && FOOD_BY_ID.has(item.foodId) ? item.foodId : null,
      grams: item.grams > 0 ? Math.round(item.grams) : defaultGramsFor(item.foodId),
      confidence: item.foodId && FOOD_BY_ID.has(item.foodId) ? 0.95 : 0,
    }));
  };

  const confirm = () => {
    const valid = items.filter((item) => item.foodId && item.grams > 0);
    if (valid.length === 0) {
      setError("登録する食材がありません。食材を選ぶか、行を削除してください。");
      return;
    }

    addPantryItems(
      valid.map((item) => {
        const food = item.foodId ? FOOD_BY_ID.get(item.foodId) : undefined;
        return {
          foodId: item.foodId,
          rawName: item.rawName,
          grams: item.grams,
          source: (useAi && aiReady ? "ai" : "ocr") as "ai" | "ocr",
          expiresAt: food?.shelfLifeDays
            ? addDays(todayStr(), food.shelfLifeDays)
            : undefined,
        };
      }),
    );

    setNotice(`${valid.length}件を在庫に追加しました。`);
    reset();
    onDone?.();
  };

  // -------------------------------------------------------------------------

  if (stage === "review") {
    return (
      <Card>
        <SectionTitle right={<span className="text-xs text-fg-dim">{items.length}件</span>}>
          よみとり けっかの かくにん
        </SectionTitle>
        <p className="mb-3 text-xs text-fg-dim">
          読み取りは完璧ではありません。食材と分量を確認してから登録してください。
          薄い色の行は自動判定の確度が低いところです。
        </p>

        <div className="space-y-3">
          {items.map((item) => (
            <div
              key={item.key}
              className={`rounded-lg border p-2.5 ${
                item.foodId && item.confidence >= 0.8
                  ? "border-border"
                  : "border-warn/40 bg-warn/5"
              }`}
            >
              <div className="mb-1.5 truncate text-xs text-fg-dim">読み取り: {item.rawName}</div>
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <FoodSelect
                    value={item.foodId}
                    onChange={(foodId) =>
                      setItems((current) =>
                        current.map((it) =>
                          it.key === item.key
                            ? { ...it, foodId, confidence: foodId ? 1 : 0 }
                            : it,
                        ),
                      )
                    }
                  />
                </div>
                <label className="flex w-24 shrink-0 items-center gap-1">
                  <input
                    type="number"
                    inputMode="numeric"
                    value={item.grams}
                    onChange={(e) =>
                      setItems((current) =>
                        current.map((it) =>
                          it.key === item.key ? { ...it, grams: Number(e.target.value) || 0 } : it,
                        ),
                      )
                    }
                    className="numeric"
                    aria-label={`${item.rawName} の分量`}
                  />
                  <span className="text-xs text-fg-dim">g</span>
                </label>
                <button
                  type="button"
                  onClick={() => setItems((current) => current.filter((it) => it.key !== item.key))}
                  aria-label={`${item.rawName} を削除`}
                  className="shrink-0 rounded-lg border border-border px-2.5 py-2 text-fg-dim hover:text-danger"
                >
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>

        {error && <p className="mt-3 text-sm text-danger">{error}</p>}

        <div className="mt-4 flex gap-2">
          <Button onClick={confirm} className="flex-1">
            在庫に追加
          </Button>
          <Button variant="ghost" onClick={reset}>
            やめる
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <SectionTitle>レシートから とうろく</SectionTitle>

      {stage === "working" ? (
        <div className="py-6 text-center">
          <p className="text-sm text-fg-muted">{progress?.status ?? "処理中"}…</p>
          <div className="mx-auto mt-3 h-1.5 w-48 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-xp transition-[width]"
              style={{ width: `${Math.round((progress?.value ?? 0) * 100)}%` }}
            />
          </div>
          <p className="mt-3 text-xs text-fg-dim">
            初回は日本語データ（約2MB）の読み込みに少し時間がかかります。
          </p>
        </div>
      ) : (
        <>
          <p className="text-sm text-fg-muted">
            レシートを撮影すると、食材を読み取って在庫の下書きを作ります。
            登録前に必ず確認画面が出ます。
          </p>

          {aiReady && (
            <div className="mt-3 flex gap-2">
              <ModeButton active={!useAi} onClick={() => setUseAi(false)}>
                端末内で読み取る
              </ModeButton>
              <ModeButton active={useAi} onClick={() => setUseAi(true)}>
                AIで読み取る（高精度）
              </ModeButton>
            </div>
          )}

          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
              e.target.value = "";
            }}
          />

          <Button className="mt-3 w-full" onClick={() => fileInput.current?.click()}>
            レシートを撮影 / 選択
          </Button>

          {!aiReady && (
            <p className="mt-2 text-xs text-fg-dim">
              端末内での読み取りは無料・オフラインで動きますが、感熱紙のレシートは
              読み間違いが出ます。設定でAPIキーを入れると精度の高いAI解析も選べます。
            </p>
          )}

          {error && (
            <p className="mt-3 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}
          {notice && <p className="mt-2 text-sm text-ok">{notice}</p>}
        </>
      )}
    </Card>
  );
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex-1 rounded-lg border px-3 py-2 text-xs transition ${
        active ? "border-gold bg-gold/15 text-gold" : "border-border bg-surface-2 text-fg-muted"
      }`}
    >
      {children}
    </button>
  );
}

/** 食材ごとの一般的な購入量。単位を持つものは1単位ぶんを既定にする。 */
function defaultGramsFor(foodId: string | null): number {
  if (!foodId) return DEFAULT_GRAMS;
  const food = FOOD_BY_ID.get(foodId);
  if (!food) return DEFAULT_GRAMS;
  if (food.gramsPerUnit) return food.gramsPerUnit;
  return food.category === "seasoning" ? 100 : DEFAULT_GRAMS;
}
