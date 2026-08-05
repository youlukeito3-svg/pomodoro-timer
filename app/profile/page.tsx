"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { saveProfile } from "@/lib/actions";
import { todayStr } from "@/lib/date";
import { useAppData, useHydrated, updateAppData, updateSettings, useSettings } from "@/lib/store/hooks";
import { clearAll, exportJson, importJson } from "@/lib/store/db";
import {
  ACTIVITY_LABEL,
  EQUIPMENT_LABEL,
  GOAL_LABEL,
  type ActivityLevel,
  type Equipment,
  type Goal,
  type Sex,
  type UserProfile,
} from "@/lib/types";
import { Button, Card, Field, Loading, Page, PageHeader, SectionTitle } from "@/components/ui";

const ALL_EQUIPMENT = Object.keys(EQUIPMENT_LABEL) as Equipment[];

export default function ProfilePage() {
  const data = useAppData();
  const hydrated = useHydrated();

  if (!hydrated) return <Loading />;

  return (
    <Page>
      <PageHeader
        title={data.profile ? "設定" : "はじめまして"}
        subtitle={
          data.profile
            ? "身体情報を変えると目標カロリーとメニューが再計算されます"
            : "まずはあなたのことを教えてください"
        }
      />
      <ProfileForm />
      {data.profile && (
        <>
          <div className="mt-6">
            <AiSettings />
          </div>
          <div className="mt-6">
            <DataManagement />
          </div>
        </>
      )}
    </Page>
  );
}

// ---------------------------------------------------------------------------

function ProfileForm() {
  const data = useAppData();
  const router = useRouter();
  const existing = data.profile;

  const [name, setName] = useState(existing?.name ?? "");
  const [sex, setSex] = useState<Sex>(existing?.sex ?? "male");
  const [birthDate, setBirthDate] = useState(existing?.birthDate ?? "1995-01-01");
  const [heightCm, setHeightCm] = useState(String(existing?.heightCm ?? 170));
  const [weightKg, setWeightKg] = useState(
    String(data.weights[data.weights.length - 1]?.weightKg ?? 65),
  );
  const [goal, setGoal] = useState<Goal>(existing?.goal ?? "bulk");
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>(existing?.activityLevel ?? 3);
  const [equipment, setEquipment] = useState<Equipment[]>(
    existing?.equipment ?? ["bodyweight", "dumbbell"],
  );
  const [daysPerWeek, setDaysPerWeek] = useState(existing?.daysPerWeek ?? 3);
  const [dietaryNg, setDietaryNg] = useState((existing?.dietaryNg ?? []).join("、"));
  const [error, setError] = useState<string | null>(null);

  const toggleEquipment = (item: Equipment) => {
    setEquipment((current) =>
      current.includes(item) ? current.filter((e) => e !== item) : [...current, item],
    );
  };

  const submit = () => {
    setError(null);

    const height = Number(heightCm);
    const weight = Number(weightKg);

    if (!name.trim()) return setError("名前を入力してください。");
    if (!Number.isFinite(height) || height < 100 || height > 250)
      return setError("身長は100〜250cmの範囲で入力してください。");
    if (!Number.isFinite(weight) || weight < 20 || weight > 300)
      return setError("体重は20〜300kgの範囲で入力してください。");
    if (equipment.length === 0)
      return setError("使える器具を1つ以上選んでください（自重だけでもメニューは組めます）。");

    const profile: UserProfile = {
      name: name.trim(),
      sex,
      birthDate,
      heightCm: height,
      goal,
      activityLevel,
      equipment,
      daysPerWeek,
      dietaryNg: dietaryNg
        .split(/[、,\s]+/)
        .map((s) => s.trim())
        .filter(Boolean),
      // 分割ローテーションの基準日。既存プロフィールでは変えない
      // （変えると今日の種目が別物に入れ替わってしまう）。
      startedAt: existing?.startedAt ?? todayStr(),
    };

    saveProfile(profile, existing ? undefined : weight);
    if (!existing) router.push("/");
  };

  return (
    <Card>
      <div className="space-y-4">
        <Field label="名前">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="ニックネーム" maxLength={20} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="性別">
            <select value={sex} onChange={(e) => setSex(e.target.value as Sex)}>
              <option value="male">男性</option>
              <option value="female">女性</option>
            </select>
          </Field>
          <Field label="生年月日">
            <input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="身長 (cm)">
            <input type="number" inputMode="decimal" value={heightCm} onChange={(e) => setHeightCm(e.target.value)} />
          </Field>
          <Field label="体重 (kg)" hint={existing ? "変更はホームの体重記録から" : undefined}>
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              value={weightKg}
              onChange={(e) => setWeightKg(e.target.value)}
              disabled={!!existing}
            />
          </Field>
        </div>

        <Field label="目標">
          <select value={goal} onChange={(e) => setGoal(e.target.value as Goal)}>
            {(Object.keys(GOAL_LABEL) as Goal[]).map((g) => (
              <option key={g} value={g}>
                {GOAL_LABEL[g]}
              </option>
            ))}
          </select>
        </Field>

        <Field label="ふだんの活動量">
          <select
            value={activityLevel}
            onChange={(e) => setActivityLevel(Number(e.target.value) as ActivityLevel)}
          >
            {([1, 2, 3, 4, 5] as ActivityLevel[]).map((level) => (
              <option key={level} value={level}>
                {ACTIVITY_LABEL[level]}
              </option>
            ))}
          </select>
        </Field>

        <Field label="週に何日トレーニングする？">
          <select value={daysPerWeek} onChange={(e) => setDaysPerWeek(Number(e.target.value))}>
            {[2, 3, 4, 5, 6].map((d) => (
              <option key={d} value={d}>
                週 {d} 日
              </option>
            ))}
          </select>
        </Field>

        <div>
          <span className="mb-1.5 block text-sm text-fg-muted">使える器具（複数選択）</span>
          <div className="flex flex-wrap gap-2">
            {ALL_EQUIPMENT.map((item) => {
              const on = equipment.includes(item);
              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => toggleEquipment(item)}
                  aria-pressed={on}
                  className={`rounded-full border px-3 py-1.5 text-sm transition ${
                    on
                      ? "border-gold bg-gold/15 text-gold"
                      : "border-border bg-surface-2 text-fg-muted"
                  }`}
                >
                  {EQUIPMENT_LABEL[item]}
                </button>
              );
            })}
          </div>
        </div>

        <Field label="苦手・アレルギーの食材" hint="読点区切り。例: 納豆、えび">
          <input value={dietaryNg} onChange={(e) => setDietaryNg(e.target.value)} placeholder="なければ空欄でOK" />
        </Field>

        {error && (
          <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        <Button onClick={submit} className="w-full">
          {existing ? "保存する" : "はじめる"}
        </Button>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------

function AiSettings() {
  const settings = useSettings();
  // 保存済みの値を初期表示にしつつ、ユーザーが編集したらそちらを優先する。
  // useState の初期値だけに頼ると、localStorage の読み込みが後から来るぶんが
  // 反映されない（初回描画時点ではまだ空のため）。
  const [draft, setDraft] = useState<string | null>(null);
  const key = draft ?? settings.geminiApiKey;
  const [saved, setSaved] = useState(false);

  const save = () => {
    updateSettings((s) => ({ ...s, geminiApiKey: key.trim() }));
    setDraft(null);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <Card>
      <SectionTitle>AI機能（任意）</SectionTitle>
      <p className="text-sm text-fg-muted">
        レシートの高精度な読み取りと献立の相談に、Googleの Gemini API を使えます。
        <strong className="text-fg">このアプリ自体に費用はかかりません。</strong>
        使いたい場合だけ、ご自身の無料枠のAPIキーを設定してください。設定しなくても
        アプリのすべての機能は動きます。
      </p>

      <ul className="mt-3 space-y-1.5 text-xs text-fg-dim">
        <li>・キーはこの端末のブラウザ内にのみ保存され、外部には送りません。</li>
        <li>・無料枠では、送信した内容がGoogleのサービス改善に使われることがあります。</li>
        <li>・レシート画像を送る機能なので、この点に同意できる場合のみ有効にしてください。</li>
        <li>・提案は医療・栄養の専門的な助言ではありません。</li>
      </ul>

      <label className="mt-3 flex items-start gap-2.5 text-sm">
        <input
          type="checkbox"
          checked={settings.aiConsent}
          onChange={(e) => updateSettings((s) => ({ ...s, aiConsent: e.target.checked }))}
          className="mt-0.5 size-4 shrink-0"
        />
        <span className="text-fg-muted">上記に同意してAI機能を使う</span>
      </label>

      <div className="mt-3 space-y-2">
        <Field label="Gemini API キー">
          <input
            type="password"
            value={key}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="AIza..."
            autoComplete="off"
            disabled={!settings.aiConsent}
          />
        </Field>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={save} disabled={!settings.aiConsent}>
            キーを保存
          </Button>
          {settings.geminiApiKey && (
            <Button
              variant="danger"
              onClick={() => {
                updateSettings((s) => ({ ...s, geminiApiKey: "" }));
                setDraft(null);
              }}
            >
              削除
            </Button>
          )}
          {saved && <span className="text-sm text-ok">保存しました</span>}
        </div>
        <p className="text-xs text-fg-dim">
          キーは Google AI Studio (aistudio.google.com) で無料で発行できます。
        </p>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------

function DataManagement() {
  const data = useAppData();
  const fileInput = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const download = () => {
    const blob = new Blob([exportJson(data)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kintore-rpg-${todayStr()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const upload = async (file: File) => {
    const result = importJson(await file.text());
    if (!result.ok) {
      setMessage({ kind: "error", text: result.error });
      return;
    }
    updateAppData(() => result.data);
    setMessage({ kind: "ok", text: "読み込みました。" });
  };

  return (
    <Card>
      <SectionTitle>データ</SectionTitle>
      <p className="text-sm text-fg-muted">
        記録はこの端末のブラウザにのみ保存されています。機種変更やブラウザのデータ削除に
        備えて、ときどき書き出しておくことをおすすめします。
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="ghost" onClick={download}>
          書き出す
        </Button>
        <Button variant="ghost" onClick={() => fileInput.current?.click()}>
          読み込む
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
            e.target.value = "";
          }}
        />
      </div>

      {message && (
        <p className={`mt-3 text-sm ${message.kind === "ok" ? "text-ok" : "text-danger"}`}>
          {message.text}
        </p>
      )}

      <div className="mt-5 border-t border-border pt-4">
        {confirmClear ? (
          <div className="space-y-2">
            <p className="text-sm text-danger">
              すべての記録（体重・トレーニング・在庫・レベル）が消えます。元に戻せません。
            </p>
            <div className="flex gap-2">
              <Button
                variant="danger"
                onClick={() => {
                  clearAll();
                  location.reload();
                }}
              >
                本当に削除する
              </Button>
              <Button variant="ghost" onClick={() => setConfirmClear(false)}>
                やめる
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="danger" onClick={() => setConfirmClear(true)}>
            すべてのデータを削除
          </Button>
        )}
      </div>
    </Card>
  );
}
