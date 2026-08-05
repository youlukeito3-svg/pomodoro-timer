"use client";

import { acknowledgeLevel, syncTitles } from "@/lib/actions";
import { classForLevel, TITLE_BY_ID } from "@/lib/rpg/titles";
import { useGame } from "@/lib/useGame";
import { Button } from "./ui";

/**
 * レベルアップ・称号獲得の演出。
 *
 * 「最後に見たレベル」と現在レベルの差、および「解禁済みとして記録された称号」と
 * 現時点で条件を満たす称号の差から、表示すべきかを純粋に導出する。
 * アプリを閉じている間に増えたぶんもまとめて見せられる。
 *
 * 確認を押した時点で初めて記録側を更新する。副作用を確認操作に紐づけることで、
 * 「表示のために state を書き換える」必要がなくなり、描画が単純になる。
 */
export default function LevelUpToast() {
  const { data, hydrated, state } = useGame();

  if (!hydrated || !state.ready) return null;

  const previousLevel = data.rpg.lastSeenLevel;
  const gainedLevels = state.level - previousLevel;
  const freshTitles = state.earnedTitles.filter(
    (id) => !data.rpg.unlockedTitles.includes(id),
  );

  if (gainedLevels <= 0 && freshTitles.length === 0) return null;

  const band = classForLevel(state.level);
  const promoted = gainedLevels > 0 && band.name !== classForLevel(previousLevel).name;

  const close = () => {
    acknowledgeLevel(state.level);
    syncTitles();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="animate-levelup w-full max-w-sm rounded-2xl border border-gold/50 bg-surface p-6 text-center">
        {gainedLevels > 0 ? (
          <>
            <p className="text-sm tracking-[0.3em] text-gold">LEVEL UP</p>

            <div className="mt-4 flex items-center justify-center gap-3">
              <span className="numeric text-2xl text-fg-dim">{previousLevel}</span>
              <span className="text-fg-dim">→</span>
              <span className="numeric text-5xl font-bold text-gold">{state.level}</span>
            </div>

            <p className="mt-2 text-xs text-fg-muted">
              +{gainedLevels.toLocaleString("ja-JP")} レベル
            </p>
          </>
        ) : (
          <p className="text-sm tracking-[0.3em] text-mnd">TITLE UNLOCKED</p>
        )}

        {promoted && (
          <div className="mt-5 rounded-xl border border-border bg-surface-2 p-3">
            <p className="text-xs text-fg-muted">クラスが昇格しました</p>
            <p className="mt-1 text-lg font-bold" style={{ color: band.color }}>
              {band.name}
            </p>
          </div>
        )}

        {freshTitles.length > 0 && (
          <div className="mt-4 space-y-1.5">
            <p className="text-xs text-fg-muted">称号を獲得</p>
            {freshTitles.map((id) => (
              <p key={id} className="text-sm font-bold text-mnd">
                「{TITLE_BY_ID.get(id)?.name ?? id}」
              </p>
            ))}
          </div>
        )}

        <Button onClick={close} className="mt-6 w-full">
          確認
        </Button>
      </div>
    </div>
  );
}
