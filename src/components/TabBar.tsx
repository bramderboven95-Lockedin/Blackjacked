"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/dashboard", label: "Spelen", icon: "\u{1F0CF}" },
  { href: "/campaign", label: "Campaign", icon: "\u{1F916}" },
  { href: "/friends", label: "Vrienden", icon: "\u{1F465}" },
  { href: "/shop", label: "Shop", icon: "\u{1F6D2}" },
  { href: "/profile", label: "Profiel", icon: "\u{1F464}" },
];

export default function TabBar() {
  const pathname = usePathname();
  return (
    <nav className="fixed left-0 right-0 bottom-0 z-40 flex bg-[#0F1B14F5] border-t border-line backdrop-blur px-1 pt-1.5 pb-[calc(0.4rem+env(safe-area-inset-bottom))]">
      {TABS.map((t) => {
        const active = pathname?.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-lg ${
              active ? "text-goldbright" : "text-dim"
            }`}
          >
            <span className="text-lg leading-none">{t.icon}</span>
            <span className="text-[10px] font-semibold">{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
