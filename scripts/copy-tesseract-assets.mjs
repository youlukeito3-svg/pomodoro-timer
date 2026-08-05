import { cpSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Tesseract.js の実行資産を public/tesseract/ に配置する。
 *
 * 既定では jsDelivr の CDN から取りに行くが、それでは
 *   - 外部CDNへの依存が増える
 *   - オフラインで動かない
 * ため、node_modules から自前で配信する。
 *
 * これらのファイルは合計10MB超になるので Git には入れず、
 * ビルドのたびにここで用意する（npm scripts の prebuild / predev から呼ばれる）。
 */

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "tesseract");

/** [コピー元, コピー先のファイル名] */
const ASSETS = [
  // ワーカー本体
  ["tesseract.js/dist/worker.min.js", "worker.min.js"],

  // WASM コア。ブラウザの SIMD 対応状況に応じて3種のいずれかが読まれるため、
  // どれが選ばれても 404 にならないよう全部置く。
  ["tesseract.js-core/tesseract-core-lstm.wasm.js", "tesseract-core-lstm.wasm.js"],
  ["tesseract.js-core/tesseract-core-simd-lstm.wasm.js", "tesseract-core-simd-lstm.wasm.js"],
  [
    "tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js",
    "tesseract-core-relaxedsimd-lstm.wasm.js",
  ],

  // 日本語の学習データ。
  // 4.0.0（16MB・Legacy込み）ではなく 4.0.0_best_int（2MB）を使う。
  // LSTM のみで動かすので Legacy 用データは不要で、best_int は
  // 精度を保ったまま量子化されており、モバイルでの初回読み込みが軽い。
  ["@tesseract.js-data/jpn/4.0.0_best_int/jpn.traineddata.gz", "jpn.traineddata.gz"],
];

mkdirSync(outDir, { recursive: true });

let copied = 0;
let total = 0;

for (const [from, to] of ASSETS) {
  const source = join(root, "node_modules", from);
  if (!existsSync(source)) {
    console.error(`[tesseract] 見つかりません: ${from}`);
    console.error("  npm install を実行してから再試行してください。");
    process.exit(1);
  }
  const dest = join(outDir, to);
  cpSync(source, dest);
  copied += 1;
  total += statSync(dest).size;
}

console.log(
  `[tesseract] ${copied} ファイルを public/tesseract/ に配置しました (${(total / 1048576).toFixed(1)} MB)`,
);
