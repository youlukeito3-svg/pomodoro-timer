"use client";

import Link from "next/link";
import { useState } from "react";
import { AiError, aiErrorMessage, askCoach, isAiReady } from "@/lib/ai/gemini";
import { isWithinDays, todayStr } from "@/lib/date";
import { FOOD_BY_ID } from "@/lib/nutrition/foods";
import { RECIPE_BY_ID } from "@/lib/nutrition/recipes";
import { useSettings } from "@/lib/store/hooks";
import { GOAL_LABEL, STAT_LABEL, type StatKey } from "@/lib/types";
import { useGame } from "@/lib/useGame";
import { EXERCISE_BY_ID } from "@/lib/workout/exercises";
import { Button, Card, SectionTitle } from "./ui";

const SUGGESTIONS = [
  "在庫の食材で作れる高たんぱくな夕食を教えて",
  "今日の献立をもっと脂質を抑えた形にしたい",
  "停滞しているので次の1ヶ月の方針を知りたい",
];

/**
 * AI相談。キーが未設定でもアプリが成立するよう、ここは「あれば嬉しい追加機能」
 * という位置づけに留めている（基本の助言はルールベースが常に出している）。
 */
export default function AiCoach() {
  const settings = useSettings();
  const { data, state } = useGame();
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const ready = isAiReady(settings);

  if (!ready) {
    return (
      <Card>
        <SectionTitle>AIに相談（任意）</SectionTitle>
        <p className="text-sm text-fg-muted">
          Googleの無料枠のAPIキーを設定すると、在庫や記録をふまえた相談ができます。
          設定しなくても、上のアドバイスと献立はそのまま使えます。
        </p>
        <Link href="/profile">
          <Button variant="ghost" className="mt-3 w-full">
            設定を開く
          </Button>
        </Link>
      </Card>
    );
  }

  const ask = async (text: string) => {
    if (!text.trim() || loading) return;
    setLoading(true);
    setError(null);
    setAnswer(null);
    try {
      const reply = await askCoach({
        apiKey: settings.geminiApiKey,
        question: text,
        context: buildContext(data, state),
      });
      setAnswer(reply);
    } catch (err) {
      setError(aiErrorMessage(err));
      if (!(err instanceof AiError)) console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <SectionTitle>AIに相談</SectionTitle>

      <div className="mb-2 flex flex-wrap gap-1.5">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => {
              setQuestion(s);
              void ask(s);
            }}
            disabled={loading}
            className="rounded-full border border-border bg-surface-2 px-2.5 py-1 text-[11px] text-fg-muted hover:border-fg-dim disabled:opacity-50"
          >
            {s}
          </button>
        ))}
      </div>

      <textarea
        rows={3}
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder="献立やメニューについて聞いてみましょう"
      />

      <Button onClick={() => void ask(question)} disabled={loading || !question.trim()} className="mt-2 w-full">
        {loading ? "考えています…" : "相談する"}
      </Button>

      {error && (
        <p className="mt-3 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {answer && (
        <div className="mt-3 rounded-lg border border-border bg-surface-2 p-3">
          <p className="whitespace-pre-wrap text-sm text-fg-muted">{answer}</p>
          <p className="mt-2 text-[10px] text-fg-dim">
            AIによる提案です。医療・栄養の専門的な助言ではありません。
          </p>
        </div>
      )}
    </Card>
  );
}

/** AIに渡す文脈。個人が特定される情報は入れない。 */
function buildContext(
  data: ReturnType<typeof useGame>["data"],
  state: ReturnType<typeof useGame>["state"],
): string {
  const today = todayStr();
  const profile = data.profile;
  if (!profile) return "";

  const lines: string[] = ["【プロフィール】"];
  lines.push(
    `${profile.sex === "male" ? "男性" : "女性"} / 身長${profile.heightCm}cm / 体重${state.bodyWeightKg.toFixed(1)}kg / 目標: ${GOAL_LABEL[profile.goal]} / 週${profile.daysPerWeek}日トレーニング`,
  );

  if (state.target) {
    lines.push(
      `目標カロリー ${state.target.kcal}kcal (P${state.target.protein}g F${state.target.fat}g C${state.target.carb}g)、本日の摂取 ${state.consumed.kcal}kcal`,
    );
  }

  lines.push("", "【ステータス】");
  lines.push(`Lv.${state.level}（${state.classBand.name}）連続${state.streak}日`);
  lines.push(
    (Object.keys(STAT_LABEL) as StatKey[])
      .map((k) => `${STAT_LABEL[k].short}${state.stats[k]}`)
      .join(" / "),
  );

  const recent = data.sessions
    .filter((s) => s.completedAt && isWithinDays(s.date, 7, today))
    .slice(-5);
  if (recent.length > 0) {
    lines.push("", "【直近7日のトレーニング】");
    for (const session of recent) {
      const names = [...new Set(session.logs.filter((l) => l.done).map((l) => l.exerciseId))]
        .map((id) => EXERCISE_BY_ID.get(id)?.name)
        .filter(Boolean)
        .join("、");
      lines.push(`${session.date}: ${names || "記録なし"}`);
    }
  }

  const pantry = data.pantry
    .map((item) => {
      const name = item.foodId ? FOOD_BY_ID.get(item.foodId)?.name : item.rawName;
      return name ? `${name}(${Math.round(item.grams)}g)` : null;
    })
    .filter(Boolean);
  lines.push("", "【家にある食材】");
  lines.push(pantry.length > 0 ? pantry.join("、") : "（登録なし）");

  const plan = data.mealPlans.find((p) => p.date === today);
  if (plan) {
    lines.push("", "【今日の献立】");
    lines.push(
      plan.meals
        .map((m) => `${RECIPE_BY_ID.get(m.recipeId)?.name ?? m.recipeId}(${m.servings}人前)`)
        .join("、"),
    );
  }

  return lines.join("\n");
}
