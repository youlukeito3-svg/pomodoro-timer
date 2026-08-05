import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * PWA 用のアイコンを生成する。
 *
 * 画像変換ツール（ImageMagick 等）に依存したくないので、
 * ピクセルを直接組み立てて Node 標準の zlib だけで PNG を書き出す。
 * 図柄はダンベル。塗りつぶし主体なので描画も単純な矩形演算で足りる。
 */

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "icons");

const BG = [0x07, 0x0a, 0x14];
const GOLD = [0xf5, 0xc4, 0x51];

// --- PNG エンコード --------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const body = Buffer.concat([typeBuf, data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), body.length + 4);
  return out;
}

/** RGB のピクセル配列(Uint8Array, 3バイト/px)を PNG にする */
function encodePng(width, height, rgb) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // ビット深度
  ihdr[9] = 2; // カラータイプ: truecolor
  // 10-12 は圧縮・フィルタ・インタレース方式（すべて 0 が既定）

  // 各行の先頭にフィルタ種別バイト(0 = None)を置く
  const raw = Buffer.alloc(height * (width * 3 + 1));
  for (let y = 0; y < height; y++) {
    const rowStart = y * (width * 3 + 1);
    raw[rowStart] = 0;
    rgb.copy(raw, rowStart + 1, y * width * 3, (y + 1) * width * 3);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// --- 図柄 ------------------------------------------------------------------

/**
 * ダンベルを描く。
 * マスカブルアイコンは外周20%が切り取られうるので、図柄は中央60%に収める。
 */
function drawIcon(size) {
  const pixels = Buffer.alloc(size * size * 3);

  const put = (x, y, color) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 3;
    pixels[i] = color[0];
    pixels[i + 1] = color[1];
    pixels[i + 2] = color[2];
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) put(x, y, BG);
  }

  const cx = size / 2;
  const cy = size / 2;
  const unit = size / 100; // 100分率で寸法を書けるようにする

  const rect = (left, top, width, height, color) => {
    for (let y = Math.round(top); y < Math.round(top + height); y++) {
      for (let x = Math.round(left); x < Math.round(left + width); x++) put(x, y, color);
    }
  };

  // シャフト
  rect(cx - 24 * unit, cy - 3.5 * unit, 48 * unit, 7 * unit, GOLD);

  // 内側のプレート（左右）
  rect(cx - 30 * unit, cy - 11 * unit, 6 * unit, 22 * unit, GOLD);
  rect(cx + 24 * unit, cy - 11 * unit, 6 * unit, 22 * unit, GOLD);

  // 外側のプレート（左右）
  rect(cx - 38 * unit, cy - 18 * unit, 7 * unit, 36 * unit, GOLD);
  rect(cx + 31 * unit, cy - 18 * unit, 7 * unit, 36 * unit, GOLD);

  return pixels;
}

// --- 出力 ------------------------------------------------------------------

mkdirSync(outDir, { recursive: true });

const SIZES = [
  [192, "icon-192.png"],
  [512, "icon-512.png"],
  [180, "apple-touch-icon.png"],
];

for (const [size, name] of SIZES) {
  writeFileSync(join(outDir, name), encodePng(size, size, drawIcon(size)));
}

console.log(`[icons] ${SIZES.length} 個のアイコンを public/icons/ に生成しました`);
