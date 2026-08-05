/**
 * GitHub Pages のプロジェクトページでは /pomodoro-timer 配下に配信されるため、
 * public/ の資産を参照するときは basePath を前置する必要がある。
 *
 * next/link と next/image は自動で付けてくれるが、fetch や Web Worker に渡す
 * URL は自分で組み立てる必要があるのでここに寄せる。
 */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** public/ 配下のパスを basePath 込みに直す */
export function asset(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${BASE_PATH}${normalized}`;
}

/**
 * 絶対URLに直す。
 * Web Worker は Blob URL から起動されることがあり、相対パスだと
 * 基準が blob: になって解決に失敗するため、ワーカーへ渡す URL は絶対にする。
 */
export function absoluteAsset(path: string): string {
  return new URL(asset(path), window.location.href).href;
}
