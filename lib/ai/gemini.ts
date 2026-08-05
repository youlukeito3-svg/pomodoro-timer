import type { Settings } from "@/lib/types";

/**
 * Gemini API のクライアント（BYOK）。
 *
 * このアプリはサーバーを持たない静的サイトなので、ブラウザから直接 API を叩く。
 * generativelanguage.googleapis.com は CORS で content-type と x-goog-api-key を
 * 許可しているため、これが成立する。
 *
 * キーはユーザー自身のもので、この端末の localStorage にしか存在しない。
 * アプリの運営側がキーを持たないので、利用料が発生する余地がない。
 */

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * 使用するモデル。無料枠で使えるものを指定する。
 * 無料枠の対象モデルや上限は変わることがあるので、値はここ一箇所に閉じておく。
 */
export const GEMINI_MODEL = "gemini-2.5-flash";

export type AiErrorCode =
  | "no_key"
  | "no_consent"
  | "invalid_key"
  | "quota"
  | "model_not_found"
  | "network"
  | "bad_response"
  | "unknown";

export class AiError extends Error {
  constructor(
    public code: AiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AiError";
  }
}

/** 画面に出すための日本語メッセージ */
export function aiErrorMessage(error: unknown): string {
  if (error instanceof AiError) {
    switch (error.code) {
      case "no_key":
        return "APIキーが設定されていません。設定画面から登録できます。";
      case "no_consent":
        return "AI機能の利用に同意すると使えるようになります。";
      case "invalid_key":
        return "APIキーが正しくないようです。設定画面で確認してください。";
      case "quota":
        return "無料枠の上限に達しました。時間をおくか、キーなしの機能をお使いください。";
      case "model_not_found":
        return "指定のモデルが使えませんでした。キーの権限か、モデル名の変更が原因の可能性があります。";
      case "network":
        return "通信に失敗しました。オフラインでないか確認してください。";
      case "bad_response":
        return "AIの応答を解釈できませんでした。もう一度お試しください。";
      default:
        return "AIの呼び出しに失敗しました。";
    }
  }
  return "AIの呼び出しに失敗しました。";
}

/** AI機能を使える状態か（キーがあり、かつ同意済み） */
export function isAiReady(settings: Settings): boolean {
  return settings.aiConsent && settings.geminiApiKey.trim().length > 0;
}

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

interface GenerateOptions {
  apiKey: string;
  parts: GeminiPart[];
  systemInstruction?: string;
  /** JSON で受け取りたい場合のスキーマ（Gemini の responseSchema 形式） */
  responseSchema?: Record<string, unknown>;
  signal?: AbortSignal;
}

async function generate(options: GenerateOptions): Promise<string> {
  const { apiKey, parts, systemInstruction, responseSchema, signal } = options;

  const body: Record<string, unknown> = {
    contents: [{ role: "user", parts }],
    generationConfig: responseSchema
      ? { responseMimeType: "application/json", responseSchema }
      : {},
  };
  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction }] };
  }

  let response: Response;
  try {
    response = await fetch(`${ENDPOINT}/${GEMINI_MODEL}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new AiError("network", String(err));
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    switch (response.status) {
      case 400:
      case 401:
      case 403:
        throw new AiError("invalid_key", detail);
      case 404:
        throw new AiError("model_not_found", detail);
      case 429:
        throw new AiError("quota", detail);
      default:
        throw new AiError("unknown", `${response.status} ${detail}`);
    }
  }

  const json = await response.json().catch(() => null);
  const text = json?.candidates?.[0]?.content?.parts
    ?.map((p: GeminiPart) => p.text ?? "")
    .join("")
    .trim();

  if (!text) throw new AiError("bad_response", "空の応答でした");
  return text;
}

// ---------------------------------------------------------------------------
// レシート解析
// ---------------------------------------------------------------------------

export interface AiReceiptItem {
  rawName: string;
  foodId: string | null;
  grams: number;
}

const RECEIPT_SCHEMA = {
  type: "OBJECT",
  properties: {
    items: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          rawName: { type: "STRING" },
          foodId: { type: "STRING" },
          grams: { type: "NUMBER" },
        },
        required: ["rawName", "foodId", "grams"],
      },
    },
  },
  required: ["items"],
};

/**
 * レシート画像から食材を構造化して取り出す。
 *
 * 食材マスタの正規名一覧をプロンプトに渡すので、「豚ﾊﾞﾗ」のような
 * 略記もモデル側で foodId に解決される。
 */
export async function extractReceiptItems(params: {
  apiKey: string;
  imageBase64: string;
  mimeType: string;
  /** 「id: 名前」の一覧 */
  foodCatalog: string;
  signal?: AbortSignal;
}): Promise<AiReceiptItem[]> {
  const text = await generate({
    apiKey: params.apiKey,
    signal: params.signal,
    systemInstruction: [
      "あなたは日本のスーパーのレシート画像から食材だけを抽出する処理系です。",
      "食品以外（日用品・袋代・値引き・小計・合計・ポイント）は出力しません。",
      "商品名は半角カナや略記で書かれていることがあります。読み解いてください。",
      "foodId は与えられた一覧の id から最も近いものを選びます。該当が無ければ空文字にします。",
      "grams は購入したおおよその総グラム数を推定します。単位が個数の場合は一般的な1個の重さから換算します。",
    ].join("\n"),
    parts: [
      { inlineData: { mimeType: params.mimeType, data: params.imageBase64 } },
      {
        text: [
          "このレシートに含まれる食材を抽出してください。",
          "",
          "利用可能な食材ID一覧:",
          params.foodCatalog,
        ].join("\n"),
      },
    ],
    responseSchema: RECEIPT_SCHEMA,
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new AiError("bad_response", text.slice(0, 200));
  }

  const items = (parsed as { items?: unknown })?.items;
  if (!Array.isArray(items)) throw new AiError("bad_response", "items が配列ではありません");

  return items
    .map((item): AiReceiptItem | null => {
      const raw = item as Record<string, unknown>;
      const rawName = typeof raw.rawName === "string" ? raw.rawName.trim() : "";
      if (!rawName) return null;
      const foodId = typeof raw.foodId === "string" && raw.foodId ? raw.foodId : null;
      const grams = typeof raw.grams === "number" && raw.grams > 0 ? raw.grams : 100;
      return { rawName, foodId, grams };
    })
    .filter((item): item is AiReceiptItem => item !== null);
}

// ---------------------------------------------------------------------------
// AI相談
// ---------------------------------------------------------------------------

/** 献立やメニューについて自由に相談する */
export async function askCoach(params: {
  apiKey: string;
  question: string;
  context: string;
  signal?: AbortSignal;
}): Promise<string> {
  return generate({
    apiKey: params.apiKey,
    signal: params.signal,
    systemInstruction: [
      "あなたは筋力トレーニングと食事管理を支援するコーチです。",
      "日本語で、300字程度の簡潔な助言をしてください。",
      "与えられた在庫・記録の範囲で具体的に答えます。手元にない食材を前提にしないでください。",
      "医療行為や診断はしません。体調の異常が疑われる場合は専門家への相談を促してください。",
      "サプリメントや極端な食事制限は勧めないでください。",
    ].join("\n"),
    parts: [{ text: `${params.context}\n\n【相談】\n${params.question}` }],
  });
}
