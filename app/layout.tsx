import type { Metadata, Viewport } from "next";
import "./globals.css";
import BottomNav from "@/components/BottomNav";
import ServiceWorker from "@/components/ServiceWorker";
import { asset } from "@/lib/basePath";

export const metadata: Metadata = {
  title: "筋トレRPG",
  description: "毎日の筋トレ・食事・体重を記録して Lv.9999 を目指す筋トレアプリ",
  manifest: asset("/manifest.webmanifest"),
  icons: {
    icon: asset("/icons/icon-192.png"),
    apple: asset("/icons/apple-touch-icon.png"),
  },
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "筋トレRPG" },
};

export const viewport: Viewport = {
  themeColor: "#070a14",
  // ステータス画面の数値レイアウトが崩れるのでユーザー拡大は許可したうえで初期倍率は固定
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className="h-full">
      <body className="min-h-full flex flex-col bg-bg text-fg">
        {/*
          ドットフォントは scripts/fetch-fonts.mjs が public/fonts/ に置く。
          バンドラを通さないので link で読む。React が head へ巻き上げるので
          body 内に書く（html 直下に置くとハイドレーションが壊れる）。
          取得できなかった場合は空のCSSになり、globals.css のフォールバックで
          システムのゴシックが使われる。
        */}
        <link rel="stylesheet" href={asset("/fonts/fonts.css")} />
        {/* ボトムナビの高さぶん下に余白を取る */}
        <main className="flex-1 pb-28">{children}</main>
        <BottomNav />
        <ServiceWorker />
      </body>
    </html>
  );
}
