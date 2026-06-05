"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "市场扫描" },
  { href: "/timeline", label: "赛程时间线" },
  { href: "/teams", label: "球队" },
  { href: "/players", label: "球员" },
  { href: "/dashboard", label: "控制台" },
];

export function Nav() {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-50 border-b border-emerald-400/15 bg-[#05080f]/88 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl border border-emerald-400/30 bg-emerald-400/10 text-xs font-black text-emerald-300 shadow-glow-electric">
            AI
          </span>
          <span className="text-xl font-black tracking-normal text-white">
            <span className="zen-text">World Cup</span> Console
          </span>
          <span className="hidden rounded border border-electric/30 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-electric sm:inline">
            WC 2026
          </span>
        </Link>
        <nav className="flex items-center gap-1">
          {links.map((l) => {
            const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                  active
                    ? "border border-emerald-400/20 bg-emerald-400/10 text-emerald-300 shadow-glow-electric"
                    : "text-slate-300 hover:bg-white/5 hover:text-white"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
