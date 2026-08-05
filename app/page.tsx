"use client";

import Link from "next/link";
import { useState } from "react";
import LevelPanel from "@/components/LevelPanel";
import LevelUpToast from "@/components/LevelUpToast";
import WeightChart from "@/components/WeightChart";
import {
  Bar,
  Button,
  Card,
  Empty,
  Field,
  Loading,
  Page,
  PageHeader,
  SectionTitle,
  SettingsLink,
  Stat,
} from "@/components/ui";
import { logWeight } from "@/lib/actions";
import { formatJa, todayStr } from "@/lib/date";
import { SPLIT_LABEL } from "@/lib/types";
import { useGame } from "@/lib/useGame";
import type { GameState } from "@/lib/selectors";
import type { WeightEntry } from "@/lib/types";
import { EXERCISE_BY_ID } from "@/lib/workout/exercises";

export default function HomePage() {
  const { data, hydrated, state } = useGame();
  const today = todayStr();

  if (!hydrated) return <Loading />;

  if (!state.ready || !data.profile) {
    return (
      <Page>
        <PageHeader title="筋トレRPG" subtitle="毎日を積み上げて Lv.9999 を目指す" />
        <Empty
          title="まだ設定がありません"
          hint="身長・体重・目標を登録すると、今日のメニューと食事プランが作られます。"
          action={
            <Link href="/profile">
              <Button>はじめる</Button>
            </Link>
          }
        />
      </Page>
    );
  }

  return (
    <Page>
      <LevelUpToast />

      <PageHeader
        title={`${data.profile.name} のステータス`}
        subtitle={formatJa(today)}
        action={<SettingsLink />}
      />

      <Card>
        <LevelPanel state={state} compact />
        <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-3">
          <Stat label="連続記録" value={state.streak} unit="日" />
          <Stat label="最長連続" value={state.bestStreak} unit="日" />
          <Stat label="体重" value={state.bodyWeightKg.toFixed(1)} unit="kg" />
        </div>
      </Card>

      <div className="mt-4">
        <TodayWorkout state={state} />
      </div>

      <div className="mt-4">
        <TodayCalories state={state} />
      </div>

      <div className="mt-4">
        <WeightSection entries={data.weights} today={today} />
      </div>
    </Page>
  );
}

// ---------------------------------------------------------------------------

function TodayWorkout({ state }: { state: GameState }) {
  const plan = state.plan;
  if (!plan) return null;

  const done = Boolean(state.session?.completedAt);
  const isRest = plan.split === "rest";

  return (
    <Card>
      <SectionTitle right={<span className="text-xs text-fg-dim">{SPLIT_LABEL[plan.split]}</span>}>
        今日のトレーニング
      </SectionTitle>

      {isRest ? (
        <div>
          <p className="text-sm text-fg-muted">
            今日は休養日です。回復もトレーニングのうち。体重の記録だけ済ませておきましょう。
          </p>
          <Link href="/workout">
            <Button variant="ghost" className="mt-3 w-full">
              それでも体を動かす
            </Button>
          </Link>
        </div>
      ) : (
        <>
          <ul className="space-y-1.5">
            {plan.exercises.map((planned) => {
              const def = EXERCISE_BY_ID.get(planned.exerciseId);
              if (!def) return null;
              return (
                <li key={planned.exerciseId} className="flex justify-between gap-3 text-sm">
                  <span>{def.name}</span>
                  <span className="numeric shrink-0 text-fg-muted">
                    {planned.sets} × {planned.reps}
                    {def.repUnit === "sec" ? "秒" : "回"}
                    {planned.targetWeightKg ? ` / ${planned.targetWeightKg}kg` : ""}
                  </span>
                </li>
              );
            })}
          </ul>

          <div className="mt-3 flex items-center justify-between text-xs text-fg-dim">
            <span>目安 {plan.estimatedMinutes}分</span>
            <span className="numeric">約 {plan.estimatedKcal} kcal</span>
          </div>

          <Link href="/workout">
            <Button className="mt-3 w-full" variant={done ? "ghost" : "primary"}>
              {done ? "記録を見る（完了済み）" : "トレーニングを始める"}
            </Button>
          </Link>
        </>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------

function TodayCalories({ state }: { state: GameState }) {
  const { target, consumed } = state;
  if (!target) return null;

  const remaining = target.kcal - consumed.kcal;

  return (
    <Card>
      <SectionTitle right={<Link href="/meals" className="text-xs text-xp">献立を見る</Link>}>
        今日の食事
      </SectionTitle>

      <div className="flex items-baseline justify-between">
        <div>
          <span className="numeric text-3xl font-bold">{consumed.kcal.toLocaleString("ja-JP")}</span>
          <span className="text-sm text-fg-muted">
            {" "}
            / {target.kcal.toLocaleString("ja-JP")} kcal
          </span>
        </div>
        <span className={`numeric text-sm ${remaining < 0 ? "text-warn" : "text-fg-muted"}`}>
          残り {remaining.toLocaleString("ja-JP")}
        </span>
      </div>

      <div className="mt-2">
        <Bar ratio={target.kcal > 0 ? consumed.kcal / target.kcal : 0} color="var(--color-gold)" />
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border pt-3">
        <MacroStat label="タンパク質" current={consumed.protein} target={target.protein} color="var(--color-str)" />
        <MacroStat label="脂質" current={consumed.fat} target={target.fat} color="var(--color-end)" />
        <MacroStat label="炭水化物" current={consumed.carb} target={target.carb} color="var(--color-agi)" />
      </div>

      {target.workoutKcal > 0 && (
        <p className="mt-3 text-xs text-fg-dim">
          今日はトレーニング日なので、消費ぶん {target.workoutKcal} kcal を上乗せしています。
        </p>
      )}
    </Card>
  );
}

function MacroStat({
  label,
  current,
  target,
  color,
}: {
  label: string;
  current: number;
  target: number;
  color: string;
}) {
  return (
    <div>
      <div className="text-xs text-fg-dim">{label}</div>
      <div className="numeric text-sm font-bold">
        {Math.round(current)}
        <span className="text-xs font-normal text-fg-muted"> / {Math.round(target)}g</span>
      </div>
      <div className="mt-1">
        <Bar ratio={target > 0 ? current / target : 0} color={color} height={4} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function WeightSection({ entries, today }: { entries: WeightEntry[]; today: string }) {
  const todayEntry = entries.find((e) => e.date === today);
  const [value, setValue] = useState(String(todayEntry?.weightKg ?? ""));
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    const weightKg = Number(value);
    if (!Number.isFinite(weightKg) || weightKg < 20 || weightKg > 300) {
      setError("20〜300kgの範囲で入力してください。");
      return;
    }
    setError(null);
    logWeight({ weightKg });
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };

  return (
    <Card>
      <SectionTitle right={todayEntry ? <span className="text-xs text-ok">記録済み</span> : undefined}>
        体重の記録
      </SectionTitle>

      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Field label="今日の体重 (kg)">
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="65.0"
            />
          </Field>
        </div>
        <Button onClick={save} className="mb-0.5">
          {todayEntry ? "更新" : "記録"}
        </Button>
      </div>

      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      {saved && <p className="mt-2 text-sm text-ok">記録しました{todayEntry ? "" : "（+20 XP）"}</p>}

      <div className="mt-4">
        <WeightChart entries={entries} />
      </div>
    </Card>
  );
}
