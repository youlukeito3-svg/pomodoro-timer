"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * モバイル前提のボトムナビ。
 * 体重記録はホームから、設定はヘッダの歯車から辿るのでタブには出さない。
 */

const TABS = [
  { href: "/", label: "ホーム", icon: HomeIcon },
  { href: "/workout", label: "トレ", icon: DumbbellIcon },
  { href: "/meals", label: "食事", icon: MealIcon },
  { href: "/pantry", label: "在庫", icon: FridgeIcon },
  { href: "/status", label: "ステータス", icon: StatusIcon },
] as const;

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 border-t border-border bg-surface/95 backdrop-blur pb-safe">
      <ul className="mx-auto flex max-w-lg">
        {TABS.map((tab) => {
          // trailingSlash: true なので '/workout/' のような形で来る
          const normalized = pathname.replace(/\/+$/, "") || "/";
          const active = normalized === tab.href;
          const Icon = tab.icon;

          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center gap-1 py-2.5 text-[11px] transition-colors ${
                  active ? "text-gold" : "text-fg-dim hover:text-fg-muted"
                }`}
              >
                <Icon active={active} />
                <span>{tab.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

interface IconProps {
  active: boolean;
}

const strokeProps = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function HomeIcon({ active }: IconProps) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" {...strokeProps} aria-hidden>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5.5 9.5V20h13V9.5" />
      {active && <path d="M10 20v-5h4v5" />}
    </svg>
  );
}

function DumbbellIcon({ active }: IconProps) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" {...strokeProps} aria-hidden>
      <path d="M4 9v6M7 7v10M17 7v10M20 9v6" />
      <path d="M7 12h10" strokeWidth={active ? 2.6 : 1.8} />
    </svg>
  );
}

function MealIcon({ active }: IconProps) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" {...strokeProps} aria-hidden>
      <path d="M6 3v8a2 2 0 0 0 4 0V3M8 11v10" />
      <path d="M16 3c-1.5 1.5-2 3-2 5s.5 3 2 3v10" />
      {active && <circle cx="16" cy="7" r="1.2" fill="currentColor" stroke="none" />}
    </svg>
  );
}

function FridgeIcon({ active }: IconProps) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" {...strokeProps} aria-hidden>
      <rect x="5" y="2.5" width="14" height="19" rx="2.5" />
      <path d="M5 10h14" />
      <path d="M8.5 6v2M8.5 13v2.5" strokeWidth={active ? 2.6 : 1.8} />
    </svg>
  );
}

function StatusIcon({ active }: IconProps) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" {...strokeProps} aria-hidden>
      <path d="M12 2.5 20 6v6.5c0 4.5-3.2 7.7-8 9-4.8-1.3-8-4.5-8-9V6z" />
      {active ? (
        <path d="m8.5 12 2.5 2.5L15.5 10" />
      ) : (
        <path d="M12 8v5" />
      )}
    </svg>
  );
}
