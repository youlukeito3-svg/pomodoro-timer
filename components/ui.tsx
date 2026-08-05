import Link from "next/link";
import type { ReactNode } from "react";

/** 画面をまたいで使う小さな見た目の部品 */

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
    <header className="mb-4 flex items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold tracking-wide">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-fg-muted">{subtitle}</p>}
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
      className="rounded-lg border border-border bg-surface p-2 text-fg-muted hover:text-fg"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.9.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1.1 1.7 1.7 0 0 0-.4-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H23a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
      </svg>
    </Link>
  );
}

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
      className={`rounded-xl border border-border bg-surface p-4 ${
        glow ? "animate-gold-pulse" : ""
      } ${className}`}
    >
      {children}
    </section>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <h2 className="text-sm font-semibold tracking-wider text-fg-muted">{children}</h2>
      {right}
    </div>
  );
}

/** 汎用の進捗バー */
export function Bar({
  ratio,
  color = "var(--color-xp)",
  height = 8,
  track = "var(--color-surface-2)",
}: {
  ratio: number;
  color?: string;
  height?: number;
  track?: string;
}) {
  const pct = Math.max(0, Math.min(1, ratio)) * 100;
  return (
    <div
      className="w-full overflow-hidden rounded-full"
      style={{ height, background: track }}
      role="presentation"
    >
      <div
        className="h-full rounded-full transition-[width] duration-500"
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  );
}

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
    primary: "bg-gold text-[#1a1405] font-bold hover:brightness-110",
    ghost: "border border-border bg-surface-2 text-fg hover:border-fg-dim",
    danger: "border border-danger/50 bg-transparent text-danger hover:bg-danger/10",
  }[variant];

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg px-4 py-2.5 text-sm transition disabled:cursor-not-allowed disabled:opacity-40 ${styles} ${className}`}
    >
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
    <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center">
      <p className="text-sm text-fg-muted">{title}</p>
      {hint && <p className="mt-1 text-xs text-fg-dim">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** ハイドレーション前に出す読み込み表示 */
export function Loading() {
  return (
    <Page>
      <div className="flex h-40 items-center justify-center text-sm text-fg-dim">
        読み込み中…
      </div>
    </Page>
  );
}

export function Stat({ label, value, unit }: { label: string; value: ReactNode; unit?: string }) {
  return (
    <div>
      <div className="text-xs text-fg-dim">{label}</div>
      <div className="numeric text-lg font-bold">
        {value}
        {unit && <span className="ml-0.5 text-xs font-normal text-fg-muted">{unit}</span>}
      </div>
    </div>
  );
}
