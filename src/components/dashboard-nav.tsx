"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { OpsIcon, type OpsIconName } from "@/components/ops-icon";

export type DashboardNavItem = {
  href: string;
  label: string;
  icon: OpsIconName;
  exact?: boolean;
};

export type DashboardNavGroup = {
  label: string;
  items: DashboardNavItem[];
};

function isItemActive(pathname: string, item: DashboardNavItem) {
  if (item.exact || item.href === "/dashboard") return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function NavLink({ item, compact = false }: { item: DashboardNavItem; compact?: boolean }) {
  const pathname = usePathname();
  const active = isItemActive(pathname, item);

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`group flex shrink-0 items-center gap-2.5 rounded-md text-xs font-medium transition-all duration-150 ${
        compact ? "min-h-9 px-3" : "min-h-8 px-2.5"
      } ${
        active
          ? "bg-blue-950/80 text-blue-200 shadow-sm border border-blue-800/60 font-semibold"
          : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-100 border border-transparent"
      }`}
    >
      <OpsIcon
        name={item.icon}
        size={14}
        className={`shrink-0 transition-colors ${
          active ? "text-blue-400" : "text-slate-500 group-hover:text-slate-300"
        }`}
      />
      <span className="truncate">{item.label}</span>
      {active && (
        <span className="ml-auto size-1.5 rounded-full bg-blue-400 shadow-[0_0_6px_rgba(96,165,250,0.8)]" />
      )}
    </Link>
  );
}

export function DashboardNav({ groups }: { groups: DashboardNavGroup[] }) {
  const items = groups.flatMap((group) => group.items);

  return (
    <>
      <aside className="hidden w-64 shrink-0 flex-col justify-between overflow-y-auto border-r border-slate-800/80 bg-[#0b121e] p-3.5 lg:flex">
        <nav aria-label="Primary navigation" className="space-y-6">
          {groups.map((group) => (
            <div key={group.label} className="space-y-1.5">
              <p className="px-2.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <NavLink key={`${group.label}-${item.href}`} item={item} />
                ))}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      <nav
        aria-label="Primary navigation"
        className="flex gap-1.5 overflow-x-auto border-b border-slate-800/80 bg-[#0b121e] px-3 py-2 lg:hidden"
      >
        {items.map((item) => (
          <NavLink key={item.href} item={item} compact />
        ))}
      </nav>
    </>
  );
}
