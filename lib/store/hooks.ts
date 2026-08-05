"use client";

import { useSyncExternalStore } from "react";
import type { AppData, Settings } from "@/lib/types";
import { EMPTY_APP_DATA } from "@/lib/types";
import {
  EMPTY_SETTINGS,
  STORAGE_KEY,
  loadAppData,
  loadSettings,
  saveAppData,
  saveSettings,
} from "./db";

/**
 * useSyncExternalStore ベースの単一ストア。
 *
 * 静的エクスポートなので各ページはビルド時にプリレンダされる。そのとき
 * localStorage は存在しないため、初回レンダーは必ず EMPTY_APP_DATA を返し、
 * subscribe（＝マウント後）で初めて実データを読み込む。
 * こうすることでハイドレーション不一致を構造的に起こさない。
 */

let state: AppData = EMPTY_APP_DATA;
let hydrated = false;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function hydrate() {
  if (hydrated) return;
  hydrated = true;
  state = loadAppData();
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // 最初の購読者が付いた時点＝クライアントで動いていることが確実な時点
  if (!hydrated) hydrate();
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): AppData {
  return state;
}

function getServerSnapshot(): AppData {
  return EMPTY_APP_DATA;
}

function getHydratedSnapshot(): boolean {
  return hydrated;
}

function getHydratedServerSnapshot(): boolean {
  return false;
}

/** 現在の永続データ。書き込みは updateAppData を通すこと。 */
export function useAppData(): AppData {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * localStorage の読み込みが済んだか。
 * false の間は「データが無い」のか「まだ読んでいない」のか区別できないので、
 * 空状態の案内（オンボーディング等）はこれが true になってから出す。
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    getHydratedSnapshot,
    getHydratedServerSnapshot,
  );
}

/**
 * 唯一の書き込み口。更新関数は新しいオブジェクトを返すこと（ミューテート不可）。
 * 保存と通知をここに集約している。
 */
export function updateAppData(updater: (current: AppData) => AppData): void {
  if (!hydrated) hydrate();
  const next = updater(state);
  if (next === state) return;
  state = next;
  saveAppData(state);
  emit();
}

/** React の外（イベントハンドラ内など）から現在値を読みたいとき用 */
export function getAppData(): AppData {
  if (!hydrated) hydrate();
  return state;
}

// ---------------------------------------------------------------------------
// 設定（APIキー）— 本体データとは別ストア
// ---------------------------------------------------------------------------

let settings: Settings = EMPTY_SETTINGS;
let settingsHydrated = false;
const settingsListeners = new Set<() => void>();

function subscribeSettings(listener: () => void): () => void {
  settingsListeners.add(listener);
  if (!settingsHydrated) {
    settingsHydrated = true;
    settings = loadSettings();
    for (const l of settingsListeners) l();
  }
  return () => {
    settingsListeners.delete(listener);
  };
}

export function useSettings(): Settings {
  return useSyncExternalStore(
    subscribeSettings,
    () => settings,
    () => EMPTY_SETTINGS,
  );
}

export function updateSettings(updater: (current: Settings) => Settings): void {
  settings = updater(settings);
  saveSettings(settings);
  for (const l of settingsListeners) l();
}

export function getSettings(): Settings {
  if (!settingsHydrated) {
    settingsHydrated = true;
    settings = loadSettings();
  }
  return settings;
}

// ---------------------------------------------------------------------------
// 別タブでの変更に追従する
// ---------------------------------------------------------------------------

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === STORAGE_KEY && hydrated) {
      state = loadAppData();
      emit();
    }
  });
}
