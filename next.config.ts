import type { NextConfig } from "next";

// GitHub Pages のプロジェクトページは https://<user>.github.io/<repo>/ に配信されるため
// basePath が必要になる。ローカル開発では空にしたいので環境変数で切り替える。
// （値は .github/workflows/deploy.yml で設定する）
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  // サーバーを一切持たない構成。out/ に静的ファイルだけを吐く。
  output: "export",

  // /workout -> /workout/index.html にすることで、GitHub Pages の
  // 素朴なファイル解決でもサブページが 404 にならない。
  trailingSlash: true,

  basePath,
  assetPrefix: basePath || undefined,

  // 画像最適化はサーバーが要るので無効化する（next/image は使わない方針）。
  images: { unoptimized: true },
};

export default nextConfig;
