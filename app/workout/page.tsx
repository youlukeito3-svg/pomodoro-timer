"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import LevelUpToast from "@/components/LevelUpToast";
import { Button, Card, Empty, Loading, Page, PageHeader, SectionTitle } from "@/components/ui";
import { addSet, completeWorkout, ensureSession, updateSet } from "@/lib/actions";
import { formatJa, todayStr } from "@/lib/date";
import type { WorkoutXpBreakdown } from "@/lib/rpg/xp";
import { SPLIT_LABEL, type SetLog } from "@/lib/types";
import { useGame } from "@/lib/useGame";
import { EXERCISE_BY_ID, repUnitLabel } from "@/lib/workout/exercises";
import { generatePlan } from "@/lib/workout/generate";

export default function WorkoutPage() {
  const { data, hydrated, state } = useGame();
  const today = todayStr();
  const [extraMenu, setExtraMenu] = useState(false);
  const [result, setResult] = useState<WorkoutXpBreakdown | null>(null);

  const isRest = state.plan?.split === "rest";

  // 休養日に「それでも動かす」を選んだときは全身メニューを組む
  const plan = useMemo(() => {
    if (!data.profile) return null;
    if (isRest && extraMenu) {
      return generatePlan({
        profile: data.profile,
        date: today,
        level: state.level,
        // 当日ぶんを含めると完了直後に推奨重量が変わってしまうので前日までを見る
        sessions: data.sessions.filter((s) => s.date < today),
        bodyWeightKg: state.bodyWeightKg,
        splitOverride: "fullA",
      });
    }
    return state.plan;
  }, [data.profile, data.sessions, extraMenu, isRest, state.bodyWeightKg, state.level, state.plan, today]);

  // プランが決まったらセッションの雛形を用意する
  useEffect(() => {
    if (plan && plan.exercises.length > 0) ensureSession(today, plan);
  }, [plan, today]);

  if (!hydrated) return <Loading />;

  if (!state.ready || !plan) {
    return (
      <Page>
        <PageHeader title="トレーニング" />
        <Empty
          title="先に設定を済ませてください"
          action={
            <Link href="/profile">
              <Button>設定へ</Button>
            </Link>
          }
        />
      </Page>
    );
  }

  if (isRest && !extraMenu) {
    return (
      <Page>
        <PageHeader title="トレーニング" subtitle={formatJa(today)} />
        <Card>
          <p className="text-sm text-fg-muted">
            今日は休養日です。筋肉は休んでいる間に育つので、しっかり休むことも
            メニューのうちです。
          </p>
          <Button variant="ghost" className="mt-4 w-full" onClick={() => setExtraMenu(true)}>
            それでも軽く動かす（全身メニュー）
          </Button>
        </Card>
      </Page>
    );
  }

  const session = state.session;
  const plannedSetCount = plan.exercises.reduce((acc, e) => acc + e.sets, 0);
  const doneCount = session?.logs.filter((l) => l.done).length ?? 0;
  const completed = Boolean(session?.completedAt);

  const finish = () => {
    const breakdown = completeWorkout({ date: today, plannedSetCount });
    if (breakdown) setResult(breakdown);
  };

  return (
    <Page>
      <LevelUpToast />

      <PageHeader
        title={SPLIT_LABEL[plan.split]}
        subtitle={`${formatJa(today)}・目安 ${plan.estimatedMinutes}分`}
      />

      <Card>
        <div className="flex items-center justify-between text-sm">
          <span className="text-fg-muted">消化したセット</span>
          <span className="numeric font-bold">
            {doneCount} / {plannedSetCount}
          </span>
        </div>
      </Card>

      <div className="mt-4 space-y-4">
        {plan.exercises.map((planned) => {
          const def = EXERCISE_BY_ID.get(planned.exerciseId);
          if (!def || !session) return null;
          const logs = session.logs
            .filter((l) => l.exerciseId === planned.exerciseId)
            .sort((a, b) => a.setIndex - b.setIndex);

          return (
            <ExerciseCard
              key={planned.exerciseId}
              name={def.name}
              unit={repUnitLabel(def)}
              isBodyweight={def.isBodyweight}
              targetWeightKg={planned.targetWeightKg}
              logs={logs}
              locked={completed}
              onChange={(setIndex, patch) =>
                updateSet({ date: today, exerciseId: planned.exerciseId, setIndex, patch })
              }
              onAddSet={() => addSet(today, planned.exerciseId)}
            />
          );
        })}
      </div>

      {result && <XpResult breakdown={result} />}

      <div className="mt-5">
        {completed ? (
          <p className="rounded-xl border border-ok/40 bg-ok/10 px-4 py-3 text-center text-sm text-ok">
            このトレーニングは完了済みです
          </p>
        ) : (
          <Button className="w-full" onClick={finish} disabled={doneCount === 0}>
            {doneCount === 0 ? "セットを1つ以上こなすと完了できます" : "トレーニングを完了する"}
          </Button>
        )}
      </div>
    </Page>
  );
}

// ---------------------------------------------------------------------------

function ExerciseCard({
  name,
  unit,
  isBodyweight,
  targetWeightKg,
  logs,
  locked,
  onChange,
  onAddSet,
}: {
  name: string;
  unit: string;
  isBodyweight: boolean;
  targetWeightKg?: number;
  logs: SetLog[];
  locked: boolean;
  onChange: (setIndex: number, patch: Partial<SetLog>) => void;
  onAddSet: () => void;
}) {
  return (
    <Card>
      <SectionTitle
        right={
          targetWeightKg ? (
            <span className="numeric text-xs text-gold">推奨 {targetWeightKg}kg</span>
          ) : isBodyweight ? (
            <span className="text-xs text-fg-dim">自重</span>
          ) : (
            <span className="text-xs text-fg-dim">重量はお好みで</span>
          )
        }
      >
        {name}
      </SectionTitle>

      <div className="space-y-2">
        {logs.map((log) => (
          <div key={log.setIndex} className="flex items-center gap-2">
            <span className="w-8 shrink-0 text-xs text-fg-dim">{log.setIndex + 1}set</span>

            {!isBodyweight && (
              <label className="flex flex-1 items-center gap-1">
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.5"
                  value={log.weightKg || ""}
                  disabled={locked}
                  onChange={(e) => onChange(log.setIndex, { weightKg: Number(e.target.value) || 0 })}
                  className="numeric"
                  aria-label={`${log.setIndex + 1}セット目の重量`}
                />
                <span className="text-xs text-fg-dim">kg</span>
              </label>
            )}

            <label className="flex flex-1 items-center gap-1">
              <input
                type="number"
                inputMode="numeric"
                value={log.reps || ""}
                disabled={locked}
                onChange={(e) => onChange(log.setIndex, { reps: Number(e.target.value) || 0 })}
                className="numeric"
                aria-label={`${log.setIndex + 1}セット目の回数`}
              />
              <span className="text-xs text-fg-dim">{unit}</span>
            </label>

            <button
              type="button"
              disabled={locked}
              onClick={() => onChange(log.setIndex, { done: !log.done })}
              aria-pressed={log.done}
              aria-label={`${log.setIndex + 1}セット目を完了`}
              className={`grid size-10 shrink-0 place-items-center rounded-lg border transition ${
                log.done
                  ? "border-ok bg-ok/20 text-ok"
                  : "border-border bg-surface-2 text-fg-dim"
              } disabled:opacity-50`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                <path d="m5 12.5 4.5 4.5L19 7.5" />
              </svg>
            </button>
          </div>
        ))}
      </div>

      {!locked && (
        <button
          type="button"
          onClick={onAddSet}
          className="mt-2 text-xs text-xp hover:underline"
        >
          ＋ セットを追加
        </button>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------

function XpResult({ breakdown }: { breakdown: WorkoutXpBreakdown }) {
  const rows = [
    { label: "完了ボーナス", value: breakdown.base },
    { label: "挙上ボリューム", value: breakdown.volume },
    { label: "全メニュー完遂", value: breakdown.allDone },
    { label: "自己ベスト更新", value: breakdown.personalRecords },
  ].filter((r) => r.value > 0);

  return (
    <Card className="mt-5 border-gold/40">
      <SectionTitle>獲得XP</SectionTitle>
      <ul className="space-y-1 text-sm">
        {rows.map((row) => (
          <li key={row.label} className="flex justify-between">
            <span className="text-fg-muted">{row.label}</span>
            <span className="numeric">+{row.value.toLocaleString("ja-JP")}</span>
          </li>
        ))}
        {breakdown.multiplier > 1 && (
          <li className="flex justify-between">
            <span className="text-fg-muted">連続記録ボーナス</span>
            <span className="numeric text-mnd">×{breakdown.multiplier.toFixed(2)}</span>
          </li>
        )}
      </ul>
      <div className="mt-2 flex justify-between border-t border-border pt-2">
        <span className="font-bold">合計</span>
        <span className="numeric text-lg font-bold text-gold">
          +{breakdown.total.toLocaleString("ja-JP")} XP
        </span>
      </div>
    </Card>
  );
}
