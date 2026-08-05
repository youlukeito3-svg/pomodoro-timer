/**
 * レシート画像の前処理。
 *
 * 感熱紙のレシートは「紙が薄いグレー」「印字が薄い」「照明ムラで片側が暗い」
 * という条件が重なり、素の写真をそのまま OCR にかけるとほとんど読めない。
 * ここでの二値化の質が最終的な精度をほぼ決めるので、
 * 全体の閾値ではなく局所平均を使う適応的二値化（Bradley 法）を使う。
 */

/** OCR に渡す画像の長辺。大きすぎても遅くなるだけで精度は頭打ちになる。 */
const OCR_MAX_EDGE = 1600;
/** AI に送る画像の長辺。転送量とトークンを抑える。 */
const AI_MAX_EDGE = 1568;

async function loadBitmap(file: Blob): Promise<ImageBitmap> {
  return createImageBitmap(file);
}

function fitSize(width: number, height: number, maxEdge: number) {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

function drawScaled(bitmap: ImageBitmap, maxEdge: number): HTMLCanvasElement {
  const { width, height } = fitSize(bitmap.width, bitmap.height, maxEdge);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas を初期化できませんでした");
  ctx.drawImage(bitmap, 0, 0, width, height);
  return canvas;
}

/**
 * Bradley の適応的二値化。
 * 各画素を「周囲 s×s の平均より t% 暗いか」で判定するので、
 * 照明ムラがあっても文字が潰れにくい。
 */
function adaptiveThreshold(gray: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
  // 積分画像を使うと、窓の大きさによらず各画素 O(1) で平均が求まる
  const integral = new Float64Array((width + 1) * (height + 1));
  for (let y = 0; y < height; y++) {
    let rowSum = 0;
    for (let x = 0; x < width; x++) {
      rowSum += gray[y * width + x];
      integral[(y + 1) * (width + 1) + (x + 1)] =
        integral[y * (width + 1) + (x + 1)] + rowSum;
    }
  }

  const out = new Uint8ClampedArray(width * height);
  const radius = Math.max(Math.floor(width / 16), 8);
  const threshold = 0.86; // 平均の86%より暗ければ文字とみなす

  for (let y = 0; y < height; y++) {
    const y1 = Math.max(y - radius, 0);
    const y2 = Math.min(y + radius, height - 1);

    for (let x = 0; x < width; x++) {
      const x1 = Math.max(x - radius, 0);
      const x2 = Math.min(x + radius, width - 1);
      const count = (x2 - x1 + 1) * (y2 - y1 + 1);

      const sum =
        integral[(y2 + 1) * (width + 1) + (x2 + 1)] -
        integral[y1 * (width + 1) + (x2 + 1)] -
        integral[(y2 + 1) * (width + 1) + x1] +
        integral[y1 * (width + 1) + x1];

      out[y * width + x] = gray[y * width + x] * count < sum * threshold ? 0 : 255;
    }
  }

  return out;
}

/** OCR 用に、グレースケール化して適応的二値化した画像を作る */
export async function preprocessForOcr(file: Blob): Promise<HTMLCanvasElement> {
  const bitmap = await loadBitmap(file);
  const canvas = drawScaled(bitmap, OCR_MAX_EDGE);
  bitmap.close();

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas を初期化できませんでした");

  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data, width, height } = image;

  // 輝度に変換しつつ最小・最大を取る
  const gray = new Uint8ClampedArray(width * height);
  let min = 255;
  let max = 0;
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const value = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
    gray[p] = value;
    if (value < min) min = value;
    if (value > max) max = value;
  }

  // コントラスト伸長。薄い印字を先に持ち上げておくと二値化が安定する。
  const range = Math.max(max - min, 1);
  for (let p = 0; p < gray.length; p++) {
    gray[p] = ((gray[p] - min) / range) * 255;
  }

  const binary = adaptiveThreshold(gray, width, height);

  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    data[i] = data[i + 1] = data[i + 2] = binary[p];
    data[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);

  return canvas;
}

/** AI に送る用に縮小した JPEG（二値化はしない。モデルは元の階調のほうが読める） */
export async function preprocessForAi(
  file: Blob,
): Promise<{ base64: string; mimeType: string }> {
  const bitmap = await loadBitmap(file);
  const canvas = drawScaled(bitmap, AI_MAX_EDGE);
  bitmap.close();

  const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
  return { base64: dataUrl.split(",")[1] ?? "", mimeType: "image/jpeg" };
}

/** プレビュー表示用の URL */
export function canvasToDataUrl(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL("image/png");
}
