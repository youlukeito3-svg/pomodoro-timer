import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Tesseract の実行資産（ビルド時に node_modules からコピーされる
    // ミニファイ済みのベンダーコード）と Service Worker は対象外にする。
    "public/tesseract/**",
    "public/sw.js",
  ]),
]);

export default eslintConfig;
