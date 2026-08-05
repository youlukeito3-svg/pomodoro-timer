import { AppData, EMPTY_APP_DATA, Settings } from "@/lib/types";

/**
 * localStorage への永続化層。
 *
 * データ量は数年分でも数百KB に収まるので、単一キーに JSON をまとめて置く。
 * IndexedDB の非同期性をアプリ全体に波及させないための意図的な選択。
 */

export const STORAGE_KEY = "kintore-rpg";
/** APIキーを含むためエクスポート対象から外したく、本体とは別キーにする */
export const SETTINGS_KEY = "kintore-rpg.settings";
/** 読み込みに失敗した壊れたデータの退避先（黙って捨てないため） */
export const BACKUP_KEY = "kintore-rpg.backup";

export const SCHEMA_VERSION = 1;

interface StoredEnvelope {
  schemaVersion: number;
  data: unknown;
}

/**
 * スキーマ移行。キー N の関数は「バージョン N のデータを N+1 に変換する」。
 * 将来フィールドを増やしたときはここに追記し、SCHEMA_VERSION を上げる。
 */
const migrations: Record<number, (data: unknown) => unknown> = {
  // 例: 1: (d) => ({ ...(d as object), newField: [] }),
};

function migrate(envelope: StoredEnvelope): unknown {
  let { schemaVersion: version, data } = envelope;
  while (version < SCHEMA_VERSION) {
    const step = migrations[version];
    if (!step) {
      // 移行手段がないので、後段の zod 検証に委ねる（失敗すれば退避される）
      break;
    }
    data = step(data);
    version += 1;
  }
  return data;
}

export function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

/**
 * 保存済みデータを読み込む。壊れていた場合は捨てずに BACKUP_KEY へ退避して
 * 初期状態を返す（ユーザーの記録を黙って消滅させないため）。
 */
export function loadAppData(): AppData {
  if (!isBrowser()) return EMPTY_APP_DATA;

  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return EMPTY_APP_DATA;

  try {
    const envelope = JSON.parse(raw) as StoredEnvelope;
    const migrated = migrate(envelope);
    const parsed = AppData.safeParse(migrated);
    if (parsed.success) return parsed.data;

    console.warn("保存データの検証に失敗しました。バックアップに退避します。", parsed.error);
  } catch (err) {
    console.warn("保存データの読み込みに失敗しました。バックアップに退避します。", err);
  }

  try {
    localStorage.setItem(BACKUP_KEY, raw);
  } catch {
    // 退避にも失敗した場合は諦める（容量超過など）
  }
  return EMPTY_APP_DATA;
}

export function saveAppData(data: AppData): void {
  if (!isBrowser()) return;
  const envelope: StoredEnvelope = { schemaVersion: SCHEMA_VERSION, data };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
  } catch (err) {
    // 容量超過時。握り潰すと保存されていないことに気づけないので警告は出す。
    console.error("保存に失敗しました（容量超過の可能性があります）", err);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// 設定（APIキー）
// ---------------------------------------------------------------------------

export const EMPTY_SETTINGS: Settings = { geminiApiKey: "", aiConsent: false };

export function loadSettings(): Settings {
  if (!isBrowser()) return EMPTY_SETTINGS;
  const raw = localStorage.getItem(SETTINGS_KEY);
  if (!raw) return EMPTY_SETTINGS;
  const parsed = Settings.safeParse(JSON.parse(raw));
  return parsed.success ? parsed.data : EMPTY_SETTINGS;
}

export function saveSettings(settings: Settings): void {
  if (!isBrowser()) return;
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

// ---------------------------------------------------------------------------
// エクスポート / インポート
// ---------------------------------------------------------------------------

/** バックアップ用の JSON 文字列。APIキーは含めない。 */
export function exportJson(data: AppData): string {
  return JSON.stringify({ schemaVersion: SCHEMA_VERSION, data }, null, 2);
}

/**
 * エクスポートした JSON を読み戻す。
 * 壊れた入力で既存データを破壊しないよう、検証に通った場合だけ値を返す。
 */
export function importJson(text: string): { ok: true; data: AppData } | { ok: false; error: string } {
  let envelope: StoredEnvelope;
  try {
    envelope = JSON.parse(text) as StoredEnvelope;
  } catch {
    return { ok: false, error: "JSON として読み取れませんでした。" };
  }
  if (typeof envelope?.schemaVersion !== "number") {
    return { ok: false, error: "このアプリのバックアップファイルではないようです。" };
  }
  const parsed = AppData.safeParse(migrate(envelope));
  if (!parsed.success) {
    return { ok: false, error: "データの形式が壊れています。" };
  }
  return { ok: true, data: parsed.data };
}

export function clearAll(): void {
  if (!isBrowser()) return;
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(SETTINGS_KEY);
}
