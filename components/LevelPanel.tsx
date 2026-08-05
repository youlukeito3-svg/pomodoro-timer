"use client";

import { MAX_LEVEL } from "@/lib/rpg/xp";
import type { GameState } from "@/lib/selectors";
import { Bar } from "./ui";

/**
 * レベル・クラス・XPバーのひとかたまり。ホームとステータス画面で共用する。
 */
export default function LevelPanel({ state, compact = false }: { state: GameState; compact?: boolean }) {
  const { progress, classBand, next } = state;

  return (
    <div>
      <div className="flex items-end justify-between">
        <div>
          <div className="text-xs tracking-widest" style={{ color: classBand.color }}>
            {classBand.name}
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xs text-fg-muted">Lv.</span>
            <span className="numeric text-4xl font-bold text-gold">{progress.level}</span>
            <span className="numeric text-sm text-fg-dim">/ {MAX_LEVEL}</span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-fg-dim">累計XP</div>
          <div className="numeric text-lg font-bold">
            {Math.round(progress.totalXp).toLocaleString("ja-JP")}
          </div>
        </div>
      </div>

      <div className="mt-3">
        <Bar ratio={progress.ratio} color="var(--color-xp)" height={10} />
        <div className="mt-1 flex justify-between text-[11px] text-fg-dim">
          <span className="numeric">
            {Math.round(progress.xpIntoLevel).toLocaleString("ja-JP")} /{" "}
            {Math.round(progress.xpForThisLevel).toLocaleString("ja-JP")} XP
          </span>
          <span>
            {progress.isMax ? "最大レベル到達" : `次のレベルまで ${Math.round(progress.xpToNext).toLocaleString("ja-JP")}`}
          </span>
        </div>
      </div>

      {!compact && (
        <div className="mt-4 border-t border-border pt-3">
          <div className="flex justify-between text-xs text-fg-muted">
            <span>Lv.{MAX_LEVEL} への道のり</span>
            <span className="numeric">{(progress.overallRatio * 100).toFixed(2)}%</span>
          </div>
          <div className="mt-1.5">
            <Bar ratio={progress.overallRatio} color="var(--color-gold)" height={6} />
          </div>
          {next && (
            <p className="mt-2 text-[11px] text-fg-dim">
              あと {next.levelsLeft.toLocaleString("ja-JP")} レベルで「{next.band.name}」に昇格
            </p>
          )}
        </div>
      )}
    </div>
  );
}
