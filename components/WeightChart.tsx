"use client";

import type { WeightEntry } from "@/lib/types";
import { daysBetween, formatJa } from "@/lib/date";

/**
 * 体重の折れ線グラフ。
 * チャートライブラリを足すほどの要件ではないので SVG を直接描く。
 */
export default function WeightChart({
  entries,
  height = 140,
}: {
  entries: readonly WeightEntry[];
  height?: number;
}) {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));

  if (sorted.length < 2) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-dashed border-border text-xs text-fg-dim"
        style={{ height }}
      >
        2日以上記録するとグラフが出ます
      </div>
    );
  }

  const width = 320;
  const padding = { top: 12, right: 8, bottom: 18, left: 34 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  const first = sorted[0].date;
  const span = Math.max(daysBetween(first, sorted[sorted.length - 1].date), 1);

  const weights = sorted.map((e) => e.weightKg);
  const rawMin = Math.min(...weights);
  const rawMax = Math.max(...weights);
  // 変化が小さいときに直線に見えないよう、最低でも2kgの幅を確保する
  const center = (rawMin + rawMax) / 2;
  const half = Math.max((rawMax - rawMin) / 2, 1);
  const min = center - half * 1.2;
  const max = center + half * 1.2;

  const x = (date: string) => padding.left + (daysBetween(first, date) / span) * innerWidth;
  const y = (kg: number) => padding.top + (1 - (kg - min) / (max - min)) * innerHeight;

  const points = sorted.map((e) => `${x(e.date)},${y(e.weightKg)}`).join(" ");
  const areaPath =
    `M ${x(sorted[0].date)},${padding.top + innerHeight} ` +
    sorted.map((e) => `L ${x(e.date)},${y(e.weightKg)}`).join(" ") +
    ` L ${x(sorted[sorted.length - 1].date)},${padding.top + innerHeight} Z`;

  const latest = sorted[sorted.length - 1];
  const diff = latest.weightKg - sorted[0].weightKg;

  return (
    <div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        role="img"
        aria-label={`体重の推移。${formatJa(first)}から${formatJa(latest.date)}まで、${diff >= 0 ? "+" : ""}${diff.toFixed(1)}kg`}
      >
        {/* 目盛り */}
        {[max, center, min].map((value, i) => {
          const gy = y(value);
          return (
            <g key={i}>
              <line
                x1={padding.left}
                x2={width - padding.right}
                y1={gy}
                y2={gy}
                stroke="var(--color-border)"
                strokeWidth="1"
                strokeDasharray={i === 1 ? "0" : "3 3"}
              />
              <text x={4} y={gy + 3} fontSize="9" fill="var(--color-fg-dim)">
                {value.toFixed(1)}
              </text>
            </g>
          );
        })}

        <path d={areaPath} fill="var(--color-xp)" opacity="0.12" />
        <polyline
          points={points}
          fill="none"
          stroke="var(--color-xp)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {sorted.map((e) => (
          <circle key={e.date} cx={x(e.date)} cy={y(e.weightKg)} r="2.5" fill="var(--color-xp)" />
        ))}

        <text x={padding.left} y={height - 5} fontSize="9" fill="var(--color-fg-dim)">
          {formatJa(first)}
        </text>
        <text
          x={width - padding.right}
          y={height - 5}
          fontSize="9"
          fill="var(--color-fg-dim)"
          textAnchor="end"
        >
          {formatJa(latest.date)}
        </text>
      </svg>

      <p className="mt-1 text-center text-xs text-fg-muted">
        期間の増減{" "}
        <span className={`numeric font-bold ${diff > 0 ? "text-warn" : diff < 0 ? "text-ok" : ""}`}>
          {diff >= 0 ? "+" : ""}
          {diff.toFixed(1)} kg
        </span>
      </p>
    </div>
  );
}
