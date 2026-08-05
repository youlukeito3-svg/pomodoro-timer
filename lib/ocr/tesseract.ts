import { absoluteAsset } from "@/lib/basePath";

/**
 * Tesseract.js によるブラウザ内 OCR。
 *
 * 実行資産（ワーカー・WASMコア・日本語学習データ）は public/tesseract/ から
 * 自前で配信する。外部CDNに依存せず、二度目以降はブラウザキャッシュで
 * オフラインでも動く。処理も通信もすべて端末内で完結するので費用はかからない。
 */

export interface OcrProgress {
  /** 0〜1 */
  progress: number;
  status: string;
}

/** tesseract.js の英語ステータスを日本語に置き換える */
const STATUS_LABEL: Record<string, string> = {
  "loading tesseract core": "OCRエンジンを読み込み中",
  "initializing tesseract": "OCRエンジンを準備中",
  "loading language traineddata": "日本語データを読み込み中",
  "initializing api": "準備中",
  "recognizing text": "文字を認識中",
};

function toJapanese(status: string): string {
  return STATUS_LABEL[status] ?? status;
}

/**
 * 画像から日本語テキストを取り出す。
 * 初回は学習データ(約2MB)の読み込みが入るぶん時間がかかる。
 */
export async function recognizeJapanese(
  image: HTMLCanvasElement | Blob,
  onProgress?: (p: OcrProgress) => void,
): Promise<string> {
  // バンドルサイズを抑えるため、実際に使うときだけ読み込む
  const { createWorker } = await import("tesseract.js");

  const worker = await createWorker("jpn", 1, {
    workerPath: absoluteAsset("/tesseract/worker.min.js"),
    corePath: absoluteAsset("/tesseract/"),
    langPath: absoluteAsset("/tesseract"),
    // .gz のまま置いているので展開はライブラリ側に任せる
    gzip: true,
    logger: (m: { status: string; progress: number }) => {
      onProgress?.({ status: toJapanese(m.status), progress: m.progress });
    },
  });

  try {
    // レシートは1列に商品が並ぶだけなので、段組み解析はさせないほうが安定する
    await worker.setParameters({
      preserve_interword_spaces: "1",
    });

    const { data } = await worker.recognize(image);
    return data.text;
  } finally {
    await worker.terminate();
  }
}
