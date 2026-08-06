"use client";

import Link from "next/link";
import LevelPanel from "@/components/LevelPanel";
import LevelUpToast from "@/components/LevelUpToast";
import StatRadar from "@/components/StatRadar";
import { Bar, Button, Card, Empty, Loading, Page, PageHeader, SectionTitle } from "@/components/ui";
import { STAT_MAX } from "@/lib/rpg/stats";
import { CLASS_BANDS, TITLES } from "@/lib/rpg/titles";
import { MAX_LEVEL, totalXpForLevel } from "@/lib/rpg/xp";
import { STAT_LABEL, XP_SOURCE_LABEL, type StatKey } from "@/lib/types";
import { useGame } from "@/lib/useGame";

const STAT_ORDER: StatKey[] = ["str", "end", "vit", "agi", "dex", "mnd"];

const STAT_COLORS: Record<StatKey, string> = {
  str: "var(--color-str)",
  end: "var(--color-end)",
  vit: "var(--color-vit)",
  agi: "var(--color-agi)",
  dex: "var(--color-dex)",
  mnd: "var(--color-mnd)",
};

export default function StatusPage() {
  const { data, hydrated, state } = useGame();

  if (!hydrated) return <Loading />;

  if (!state.ready) {
    return (
      <Page>
        <PageHeader title="ステータス" />
        <Empty
          title="まだ記録がありません"
          action={
            <Link href="/profile">
              <Button>設定へ</Button>
            </Link>
          }
        />
      </Page>
    );
  }

  const earned = new Set(state.earnedTitles);

  return (
    <Page>
      <LevelUpToast />
      <PageHeader title="ステータス" subtitle={`目標は Lv.${MAX_LEVEL}`} />

      <Card>
        <LevelPanel state={state} />
      </Card>

      <div className="mt-4">
        <Card>
          <SectionTitle>のうりょく</SectionTitle>
          <StatRadar stats={state.stats} />

          <div className="mt-4 space-y-3">
            {STAT_ORDER.map((key) => {
              const detail = state.statDetails[key];
              return (
                <div key={key}>
                  <div className="flex items-baseline justify-between text-sm">
                    <span>
                      <span className="numeric font-bold" style={{ color: STAT_COLORS[key] }}>
                        {STAT_LABEL[key].short}
                      </span>
                      <span className="ml-2 text-fg-muted">{STAT_LABEL[key].name}</span>
                    </span>
                    <span className="numeric font-bold">
                      {detail.value}
                      <span className="text-xs font-normal text-fg-dim"> / {STAT_MAX}</span>
                    </span>
                  </div>
                  <div className="mt-1">
                    <Bar ratio={detail.value / STAT_MAX} color={STAT_COLORS[key]} height={5} />
                  </div>
                  <p className="mt-1 text-[11px] text-fg-dim">{detail.description}</p>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <div className="mt-4">
        <Card>
          <SectionTitle>しょうにん</SectionTitle>
          <ul className="space-y-1.5">
            {CLASS_BANDS.map((band) => {
              const reached = state.level >= band.from;
              const current = state.classBand.name === band.name;
              return (
                <li
                  key={band.name}
                  className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-sm ${
                    current ? "bg-surface-2" : ""
                  }`}
                >
                  <span style={{ color: reached ? band.color : "var(--color-fg-dim)" }}>
                    {reached ? band.name : "？？？"}
                    {current && <span className="ml-2 text-[10px] text-gold">現在</span>}
                  </span>
                  <span className="numeric text-xs text-fg-dim">Lv.{band.from}〜</span>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      <div className="mt-4">
        <Card>
          <SectionTitle
            right={
              <span className="numeric text-xs text-fg-dim">
                {earned.size} / {TITLES.length}
              </span>
            }
          >
            しょうごう
          </SectionTitle>
          <ul className="space-y-1.5">
            {TITLES.map((title) => {
              const got = earned.has(title.id);
              return (
                <li key={title.id} className="flex items-start justify-between gap-3 text-sm">
                  <span className={got ? "text-mnd" : "text-fg-dim"}>
                    {got ? `「${title.name}」` : "？？？"}
                  </span>
                  <span className="shrink-0 text-right text-[11px] text-fg-dim">
                    {title.requirement}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      <div className="mt-4">
        <Card>
          <SectionTitle>これまでの あゆみ</SectionTitle>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <Row label="トレーニング回数" value={`${state.titleContext.sessionCount} 回`} />
            <Row label="経験した種目" value={`${state.titleContext.uniqueExerciseCount} 種`} />
            <Row
              label="生涯の総挙上量"
              value={`${Math.round(state.titleContext.lifetimeVolume).toLocaleString("ja-JP")} kg`}
            />
            <Row label="体重の記録日数" value={`${data.weights.length} 日`} />
            <Row label="最長連続記録" value={`${state.bestStreak} 日`} />
            <Row
              label="Lv.9999まで"
              value={`${Math.max(
                totalXpForLevel(MAX_LEVEL) - state.totalXp,
                0,
              ).toLocaleString("ja-JP")} XP`}
            />
          </dl>
        </Card>
      </div>

      <div className="mt-4">
        <RecentXp events={data.xpEvents} />
      </div>
    </Page>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-fg-dim">{label}</dt>
      <dd className="numeric font-bold">{value}</dd>
    </div>
  );
}

function RecentXp({ events }: { events: ReturnType<typeof useGame>["data"]["xpEvents"] }) {
  const recent = [...events].reverse().slice(0, 12);
  if (recent.length === 0) return null;

  return (
    <Card>
      <SectionTitle>さいきんの けいけん</SectionTitle>
      <ul className="space-y-1.5 text-sm">
        {recent.map((event) => (
          <li key={event.id} className="flex items-center justify-between gap-2">
            <span className="truncate text-fg-muted">
              <span className="text-fg-dim">{event.date.slice(5)}</span>{" "}
              {event.note ?? XP_SOURCE_LABEL[event.source]}
            </span>
            <span className="numeric shrink-0 text-xp">
              +{Math.round(event.amount).toLocaleString("ja-JP")}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
