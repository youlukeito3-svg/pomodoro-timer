import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * RPG調の見た目に使う日本語ドットフォント（DotGothic16）を public/fonts/ に配置する。
 *
 * next/font/google は DotGothic16 の日本語サブセットを持っていない（latin系のみ）ので
 * 使えない。Tesseract の実行資産と同じ「ビルド前に用意する」方式で自前配信する。
 * 外部CDNに依存せず、Service Worker のキャッシュも効くのでオフラインでも崩れない。
 *
 * 全123サブセットで合計およそ0.7MB。unicode-range が効くのでブラウザは
 * 実際に使う分（1画面あたり100〜150KB程度）しか取りに行かない。
 *
 * ネットワークが無い環境でも開発できるよう、取得に失敗してもビルドは止めない。
 * その場合は @font-face が空になり、システムのゴシックにフォールバックする。
 */

const FAMILY = "DotGothic16";
const CSS_URL = `https://fonts.googleapis.com/css2?family=${FAMILY}&display=swap`;
// woff2 を返させるために新しめのブラウザを名乗る
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "fonts");
const cssPath = join(outDir, "fonts.css");

mkdirSync(outDir, { recursive: true });

/** 取得できなかったときに置く空のCSS（link が404にならないようにする） */
function writeFallback(reason) {
  console.warn(`[fonts] ${FAMILY} を取得できませんでした: ${reason}`);
  console.warn("[fonts] システムのゴシック体で表示されます（機能に影響はありません）。");
  if (!existsSync(cssPath)) {
    writeFileSync(cssPath, `/* ${FAMILY} を取得できなかったため空 */\n`);
  }
}

// 既に揃っていれば取り直さない（毎回のビルドで数百リクエスト出さない）
if (existsSync(cssPath) && readFileSync(cssPath, "utf8").includes("@font-face")) {
  console.log("[fonts] 配置済みのため取得をスキップしました");
  process.exit(0);
}

let css;
try {
  const res = await fetch(CSS_URL, { headers: { "user-agent": UA } });
  if (!res.ok) throw new Error(`CSS の取得に失敗 (${res.status})`);
  css = await res.text();
} catch (err) {
  writeFallback(String(err));
  process.exit(0);
}

const urls = [...new Set(css.match(/https:\/\/fonts\.gstatic\.com\/[^)]+\.woff2/g) ?? [])];
if (urls.length === 0) {
  writeFallback("CSS に woff2 が含まれていませんでした");
  process.exit(0);
}

let bytes = 0;
try {
  await Promise.all(
    urls.map(async (url) => {
      // URL から決まる名前にして、再実行時に取り直さなくて済むようにする
      const name = `${createHash("sha1").update(url).digest("hex").slice(0, 12)}.woff2`;
      const dest = join(outDir, name);

      if (!existsSync(dest)) {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`${url} の取得に失敗 (${res.status})`);
        writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
      }
      bytes += readFileSync(dest).length;
      // CSS 側の参照をローカルの相対パスに書き換える
      css = css.split(url).join(name);
    }),
  );
} catch (err) {
  writeFallback(String(err));
  process.exit(0);
}

writeFileSync(cssPath, css);
console.log(
  `[fonts] ${FAMILY} を ${urls.length} サブセット配置しました (${(bytes / 1048576).toFixed(1)} MB)`,
);
