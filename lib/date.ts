import type { DateStr } from "@/lib/types";

/**
 * 日付は 'YYYY-MM-DD' の文字列で扱う。
 *
 * Date オブジェクトを持ち回るとタイムゾーンで日付がずれる（UTC 換算で前日になる）
 * 事故が起きやすい。ローカル時刻での「その日」が意味を持つアプリなので、
 * 文字列を正とし、変換は必ずこのモジュールを通す。
 */

export function toDateStr(d: Date): DateStr {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayStr(): DateStr {
  return toDateStr(new Date());
}

/** 'YYYY-MM-DD' をローカル時刻の 00:00 として Date に戻す */
export function parseDateStr(s: DateStr): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s: DateStr, days: number): DateStr {
  const d = parseDateStr(s);
  d.setDate(d.getDate() + days);
  return toDateStr(d);
}

/** b - a を日数で返す（b が後なら正） */
export function daysBetween(a: DateStr, b: DateStr): number {
  const ms = parseDateStr(b).getTime() - parseDateStr(a).getTime();
  return Math.round(ms / 86_400_000);
}

/** 直近 n 日（今日を含む）に入るか */
export function isWithinDays(date: DateStr, n: number, from: DateStr = todayStr()): boolean {
  const diff = daysBetween(date, from);
  return diff >= 0 && diff < n;
}

export function ageFrom(birthDate: DateStr, at: DateStr = todayStr()): number {
  const b = parseDateStr(birthDate);
  const now = parseDateStr(at);
  let age = now.getFullYear() - b.getFullYear();
  const beforeBirthday =
    now.getMonth() < b.getMonth() ||
    (now.getMonth() === b.getMonth() && now.getDate() < b.getDate());
  if (beforeBirthday) age -= 1;
  return age;
}

const WEEKDAY_JA = ["日", "月", "火", "水", "木", "金", "土"];

/** 「8月5日(水)」のような表示用文字列 */
export function formatJa(s: DateStr): string {
  const d = parseDateStr(s);
  return `${d.getMonth() + 1}月${d.getDate()}日(${WEEKDAY_JA[d.getDay()]})`;
}

/**
 * 日付を種にした決定的な擬似乱数（mulberry32）。
 * 「日替わりだが同じ日なら必ず同じ結果」を作るために使う。
 */
export function seededRandom(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let a = h >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 決定的シャッフル（元配列は変更しない） */
export function seededShuffle<T>(items: readonly T[], seed: string): T[] {
  const rand = seededRandom(seed);
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
