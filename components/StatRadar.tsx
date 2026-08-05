"use client";

import { STAT_LABEL, type StatKey, type Stats } from "@/lib/types";
import { STAT_MAX } from "@/lib/rpg/stats";

/**
 * 6角形のステータスレーダー。RPGのステータス画面らしさの中心なので
 * ライブラリを足さず SVG で描く。
 */

const ORDER: StatKey[] = ["str", "end", "vit", "agi", "dex", "mnd"];

const COLORS: Record<StatKey, string> = {
  str: "var(--color-str)",
  end: "var(--color-end)",
  vit: "var(--color-vit)",
  agi: "var(--color-agi)",
  dex: "var(--color-dex)",
  mnd: "var(--color-mnd)",
};

export default function StatRadar({ stats, size = 260 }: { stats: Stats; size?: number }) {
  const center = size / 2;
  // ラベルを外周に置くぶんの余白を残す
  const radius = center - 34;

  // 頂点が真上に来るよう -90度から始める
  const angleFor = (index: number) => (Math.PI * 2 * index) / ORDER.length - Math.PI / 2;

  const pointAt = (index: number, ratio: number) => {
    const angle = angleFor(index);
    return [center + Math.cos(angle) * radius * ratio, center + Math.sin(angle) * radius * ratio];
  };

  const gridPolygon = (ratio: number) =>
    ORDER.map((_, i) => pointAt(i, ratio).join(",")).join(" ");

  const valuePolygon = ORDER.map((key, i) =>
    pointAt(i, Math.max(stats[key] / STAT_MAX, 0.02)).join(","),
  ).join(" ");

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className="mx-auto w-full max-w-[280px]"
      role="img"
      aria-label={ORDER.map((k) => `${STAT_LABEL[k].name} ${stats[k]}`).join("、")}
    >
      {/* 目盛りの同心六角形 */}
      {[0.25, 0.5, 0.75, 1].map((ratio) => (
        <polygon
          key={ratio}
          points={gridPolygon(ratio)}
          fill="none"
          stroke="var(--color-border)"
          strokeWidth="1"
        />
      ))}

      {/* 各軸 */}
      {ORDER.map((key, i) => {
        const [x, y] = pointAt(i, 1);
        return (
          <line
            key={key}
            x1={center}
            y1={center}
            x2={x}
            y2={y}
            stroke="var(--color-border)"
            strokeWidth="1"
          />
        );
      })}

      {/* 実際の値 */}
      <polygon
        points={valuePolygon}
        fill="var(--color-xp)"
        fillOpacity="0.22"
        stroke="var(--color-xp)"
        strokeWidth="2"
        strokeLinejoin="round"
      />

      {ORDER.map((key, i) => {
        const [px, py] = pointAt(i, Math.max(stats[key] / STAT_MAX, 0.02));
        return <circle key={key} cx={px} cy={py} r="3" fill={COLORS[key]} />;
      })}

      {/* ラベル */}
      {ORDER.map((key, i) => {
        const [lx, ly] = pointAt(i, 1.2);
        return (
          <g key={key}>
            <text
              x={lx}
              y={ly - 2}
              fontSize="11"
              fontWeight="bold"
              fill={COLORS[key]}
              textAnchor="middle"
            >
              {STAT_LABEL[key].short}
            </text>
            <text x={lx} y={ly + 10} fontSize="11" fill="var(--color-fg)" textAnchor="middle">
              {stats[key]}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
