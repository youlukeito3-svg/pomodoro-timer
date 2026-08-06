import Link from "next/link";
import type { ReactNode } from "react";

/**
 * 画面をまたいで使う部品。
 *
 * RPGのコマンドウィンドウ調。Card と SectionTitle を組み合わせると、
 * 見出しが枠の上辺に載る形になる（SectionTitle は絶対配置なので、
 * 各ページの記述を変えずに見た目だけ差し替えられる）。
 */

export function Page({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-lg px-4 py-4">{children}</div>;
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <header className="mb-5 flex items-start justify-between gap-3">
      <div>
        <h1 className="text-xl tracking-wider text-gold">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-fg-muted">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

/** 設定へ移動する歯車ボタン */
export function SettingsLink() {
  return (
    <Link
      href="/profile"
      aria-label="設定"
      className="win px-2.5 py-2 text-fg-muted hover:text-gold"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.9.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1.1 1.7 1.7 0 0 0-.4-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H23a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
      </svg>
    </Link>
  );
}

/** コマンドウィンドウ。SectionTitle を中に置くと見出しが枠に載る。 */
export function Card({
  children,
  className = "",
  glow = false,
}: {
  children: ReactNode;
  className?: string;
  glow?: boolean;
}) {
  return (
    <section
      className={`win px-3.5 pb-3.5 pt-4 ${glow ? "shadow-[0_0_18px_rgba(255,210,63,0.28)]" : ""} ${className}`}
    >
      {children}
    </section>
  );
}

/** ウィンドウの上辺に載る見出し。right は右上に置かれる。 */
export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <>
      <h2 className="win-title text-fg">{children}</h2>
      {right && <div className="win-title-right">{right}</div>}
    </>
  );
}

/**
 * ウィンドウの外に置く見出し（複数のウィンドウをまとめるとき用）。
 * SectionTitle は Card の枠に載せる前提の絶対配置なので、
 * ウィンドウの外で使うと基準を失って画面上部に飛んでしまう。こちらを使う。
 */
export function GroupTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-2 flex items-center gap-3">
      <h2 className="text-sm tracking-widest text-fg-muted">{children}</h2>
      <span className="h-px flex-1 bg-border" />
      {right}
    </div>
  );
}

/**
 * 進捗バー。
 * segments を渡すとブロックに刻んでドット感を出す（レベルや経験値向け）。
 * 渡さないときは細い連続バー（PFCの小さな指標向け）。
 */
export function Bar({
  ratio,
  color = "var(--color-xp)",
  height = 8,
  segments,
}: {
  ratio: number;
  color?: string;
  height?: number;
  segments?: number;
}) {
  const clamped = Math.max(0, Math.min(1, ratio));

  if (segments && segments > 0) {
    const filled = Math.round(clamped * segments);
    return (
      <div className="flex gap-[2px]" role="presentation">
        {Array.from({ length: segments }, (_, i) => (
          <span
            key={i}
            className="flex-1 border"
            style={{
              height,
              background: i < filled ? color : "var(--color-surface-2)",
              borderColor: i < filled ? color : "var(--color-border)",
            }}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className="w-full border border-border"
      style={{ height, background: "var(--color-surface-2)" }}
      role="presentation"
    >
      <div
        className="h-full transition-[width] duration-300"
        style={{ width: `${clamped * 100}%`, background: color }}
      />
    </div>
  );
}

/** コマンド風のボタン。主要な操作には ▶ カーソルが付く。 */
export function Button({
  children,
  onClick,
  variant = "primary",
  type = "button",
  disabled = false,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "ghost" | "danger";
  type?: "button" | "submit";
  disabled?: boolean;
  className?: string;
}) {
  const styles = {
    primary: "border-frame bg-bg text-gold hover:bg-gold/10",
    ghost: "border-border bg-bg text-fg-muted hover:border-fg-dim hover:text-fg",
    danger: "border-danger/60 bg-bg text-danger hover:bg-danger/10",
  }[variant];

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md border-2 px-4 py-2.5 text-sm tracking-wide transition disabled:cursor-not-allowed disabled:opacity-40 ${styles} ${className}`}
    >
      {variant === "primary" && !disabled && (
        <span aria-hidden className="mr-1.5 text-[0.7em]">
          ▶
        </span>
      )}
      {children}
    </button>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-fg-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-fg-dim">{hint}</span>}
    </label>
  );
}

export function Empty({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="win px-4 py-10 text-center">
      <p className="text-sm text-fg-muted">{title}</p>
      {hint && <p className="mt-2 text-xs text-fg-dim">{hint}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** ハイドレーション前に出す読み込み表示 */
export function Loading() {
  return (
    <Page>
      <div className="flex h-40 items-center justify-center text-sm text-fg-dim">
        <span className="animate-blink">▶</span>
        <span className="ml-2">よみこみちゅう…</span>
      </div>
    </Page>
  );
}

export function Stat({ label, value, unit }: { label: string; value: ReactNode; unit?: string }) {
  return (
    <div>
      <div className="text-xs text-fg-dim">{label}</div>
      <div className="numeric text-lg">
        {value}
        {unit && <span className="ml-0.5 text-xs text-fg-muted">{unit}</span>}
      </div>
    </div>
  );
}

/**
 * コマンドリストの一行。選択中の行に ▶ カーソルが付く。
 * 種目一覧や献立など「並んだ選択肢」に使う。
 */
export function CommandRow({
  label,
  value,
  cursor = false,
}: {
  label: ReactNode;
  value?: ReactNode;
  cursor?: boolean;
}) {
  return (
    <li
      className={`flex items-baseline justify-between gap-3 py-1 text-sm ${
        cursor ? "text-gold" : "pl-[1.15rem]"
      }`}
    >
      <span className="flex-1">
        {cursor && (
          <span aria-hidden className="mr-1.5 text-[0.7em]">
            ▶
          </span>
        )}
        {label}
      </span>
      {value && <span className="numeric shrink-0 text-xs text-fg-muted">{value}</span>}
    </li>
  );
}
